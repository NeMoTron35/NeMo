// Executes actual quantum_vault.so instructions on solana-test-validator.
// Read-only CI: only local ephemeral token mints and local validator funds.
import * as anchor from "@coral-xyz/anchor";
import { strict as assert } from "node:assert";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  createMint,
  getAccount,
  getAssociatedTokenAddressSync,
  getOrCreateAssociatedTokenAccount,
  mintTo,
} from "@solana/spl-token";
import { Keypair, PublicKey, SystemProgram } from "@solana/web3.js";

const provider = anchor.AnchorProvider.env();
anchor.setProvider(provider);
const program = anchor.workspace.QuantumVault as anchor.Program<any>;
const payer = (provider.wallet as anchor.Wallet & { payer: Keypair }).payer;
const BN = anchor.BN;
const programId = new PublicKey("93v9K8ytGDR3BAoxtaVVo7u1oaBv3Pu257eBAPCp7SH5");

function u64LE(value: bigint): Buffer {
  const b = Buffer.alloc(8);
  b.writeBigUInt64LE(value);
  return b;
}
const expiry = () => new BN(Math.floor(Date.now() / 1000) + 120);

async function expectProgramFailure(work: Promise<unknown>, expected: string): Promise<void> {
  try {
    await work;
    assert.fail("Expected rejection with " + expected);
  } catch (error) {
    if (error instanceof assert.AssertionError) throw error;
    const e = error as {
      error?: { errorCode?: { code?: string } };
      logs?: string[];
      message?: string;
    };
    const evidence = [e.error?.errorCode?.code, e.message, ...(e.logs ?? [])]
      .filter(Boolean).join(" ");
    assert.match(evidence, new RegExp(expected), "Unexpected error: " + evidence);
  }
}

describe("Quantum Vault Phase 1: real local-validator instructions", () => {
  let mint: PublicKey;
  let wrongMint: PublicKey;
  let vault: PublicKey;
  let escrow: PublicKey;
  let source: PublicKey;
  let wrongDestination: PublicKey;
  const vaultId = new BN(314159);
  const perWithdraw = new BN(500);
  const fixedWindowCap = new BN(1_000);

  before(async () => {
    assert.equal(program.programId.toBase58(), programId.toBase58());
    mint = await createMint(provider.connection, payer, payer.publicKey, null, 6);
    wrongMint = await createMint(provider.connection, payer, payer.publicKey, null, 6);
    const ownerAta = await getOrCreateAssociatedTokenAccount(
      provider.connection, payer, mint, payer.publicKey,
    );
    source = ownerAta.address;
    const outsiderAta = await getOrCreateAssociatedTokenAccount(
      provider.connection, payer, mint, Keypair.generate().publicKey,
    );
    wrongDestination = outsiderAta.address;
    await mintTo(provider.connection, payer, mint, source, payer, 10_000);
    [vault] = PublicKey.findProgramAddressSync(
      [Buffer.from("qvault"), payer.publicKey.toBuffer(), mint.toBuffer(), u64LE(BigInt(vaultId.toString()))],
      program.programId,
    );
    escrow = getAssociatedTokenAddressSync(mint, vault, true);
  });

  it("creates a vault with PDA-controlled SPL escrow and immutable policy", async () => {
    await program.methods
      .createVault(vaultId, perWithdraw, fixedWindowCap, new BN(0))
      .accounts({
        owner: payer.publicKey, mint, vault, escrow, destination: source,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const vaultState = await program.account.vault.fetch(vault);
    assert.equal(vaultState.owner.toBase58(), payer.publicKey.toBase58());
    assert.equal(vaultState.destination.toBase58(), source.toBase58());
    assert.equal(vaultState.maxPerWithdraw.toString(), "500");
    assert.equal(vaultState.dailyLimit.toString(), "1000");
    const escrowAccount = await getAccount(provider.connection, escrow);
    assert.equal(escrowAccount.owner.toBase58(), vault.toBase58());
    assert.equal(escrowAccount.mint.toBase58(), mint.toBase58());
    assert.equal(escrowAccount.amount, 0n);
  });

  it("rejects zero deposit, fake mint and wrong token program", async () => {
    const wrongMintAta = await getOrCreateAssociatedTokenAccount(
      provider.connection, payer, wrongMint, payer.publicKey,
    );
    await expectProgramFailure(
      program.methods.deposit(new BN(0)).accounts({
        depositor: payer.publicKey, vault, mint, source, escrow,
        tokenProgram: TOKEN_PROGRAM_ID,
      }).rpc(), "ZeroAmount",
    );
    await expectProgramFailure(
      program.methods.deposit(new BN(1)).accounts({
        depositor: payer.publicKey, vault, mint: wrongMint,
        source: wrongMintAta.address, escrow,
        tokenProgram: TOKEN_PROGRAM_ID,
      }).rpc(), "ConstraintHasOne|ConstraintTokenMint|ConstraintAssociated",
    );
    await expectProgramFailure(
      program.methods.deposit(new BN(1)).accounts({
        depositor: payer.publicKey, vault, mint, source, escrow,
        tokenProgram: SystemProgram.programId,
      }).rpc(), "InvalidProgramId|InvalidAccountOwner|Constraint",
    );
  });

  it("deposits actual minted SPL units into the PDA-owned escrow", async () => {
    await program.methods.deposit(new BN(4_000)).accounts({
      depositor: payer.publicKey, vault, mint, source, escrow,
      tokenProgram: TOKEN_PROGRAM_ID,
    }).rpc();
    assert.equal((await getAccount(provider.connection, escrow)).amount, 4_000n);
  });

  const withdraw = (
    amount: number, nonce: number, epoch = 0,
    destination = source, owner = payer.publicKey, expiresAt = expiry(),
  ) =>
    program.methods.withdraw(new BN(amount), new BN(nonce), epoch, expiresAt)
      .accounts({ owner, vault, mint, escrow, destination, tokenProgram: TOKEN_PROGRAM_ID });

  it("rejects a different owner, wrong recipient, stale nonce, wrong epoch and expired intent", async () => {
    const attacker = Keypair.generate();
    await expectProgramFailure(
      withdraw(1, 0, 0, source, attacker.publicKey).signers([attacker]).rpc(),
      "ConstraintSeeds|ConstraintHasOne|Signature|owner",
    );
    await expectProgramFailure(withdraw(1, 0, 0, wrongDestination).rpc(), "ConstraintAddress|WrongDestination");
    await expectProgramFailure(withdraw(1, 33).rpc(), "WrongNonce");
    await expectProgramFailure(withdraw(1, 0, 42).rpc(), "WrongEpoch");
    await expectProgramFailure(
      withdraw(1, 0, 0, source, payer.publicKey, new BN(1)).rpc(), "Expired",
    );
  });

  it("enforces per-withdrawal limit; increments nonce after valid withdrawals", async () => {
    await expectProgramFailure(withdraw(501, 0).rpc(), "OverPerWithdraw");
    await withdraw(500, 0).rpc();
    assert.equal((await getAccount(provider.connection, escrow)).amount, 3_500n);
    await expectProgramFailure(withdraw(1, 0).rpc(), "WrongNonce");
    await withdraw(500, 1).rpc();
    assert.equal((await getAccount(provider.connection, escrow)).amount, 3_000n);
    const state = await program.account.vault.fetch(vault);
    assert.equal(state.nonce.toString(), "2");
    assert.equal(state.windowSpent.toString(), "1000");
  });

  it("enforces fixed 24h spend cap independent of UI", async () => {
    await expectProgramFailure(withdraw(1, 2).rpc(), "OverDailyLimit");
  });

  it("pauses immediately; withdrawal cannot bypass a delayed unpause", async () => {
    await program.methods.pause().accounts({owner:payer.publicKey, vault}).rpc();
    await expectProgramFailure(withdraw(1, 2).rpc(), "Paused");
    await expectProgramFailure(
      program.methods.unpause().accounts({owner:payer.publicKey,vault}).rpc(),
      "UnpauseNotRequested",
    );
    await program.methods.requestUnpause().accounts({owner:payer.publicKey,vault}).rpc();
    await expectProgramFailure(
      program.methods.unpause().accounts({owner:payer.publicKey,vault}).rpc(),
      "UnpauseDelayActive",
    );
    const state = await program.account.vault.fetch(vault);
    assert.equal(state.paused, true);
    assert.equal(state.nonce.toString(), "2");
  });
});
