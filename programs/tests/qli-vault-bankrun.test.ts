// @vitest-environment node
// Opt-in real Solana SBF execution. Never substitutes a native/mock processor.
import { describe, it, expect } from "vitest";
import { Clock, start, type ProgramTestContext } from "solana-bankrun";
import {
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";
import {
  createInitializeMint2Instruction,
  createAssociatedTokenAccountInstruction,
  createMintToInstruction,
  createCloseAccountInstruction,
  createSetAuthorityInstruction,
  AuthorityType,
  MINT_SIZE,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import {
  IX,
  LOCAL_BUILD_PROGRAM_ID,
  deriveVault,
  deriveTokenAccount,
  decodeVault,
  encodeVault,
  type VaultAccount,
} from "./quantum-vault-client";

const enabled = process.env["QLI_VAULT_SBF"] === "1";
const pid = new PublicKey(LOCAL_BUILD_PROGRAM_ID);
const u64 = (n: bigint) => {
  const b = Buffer.alloc(8);
  b.writeBigUInt64LE(n);
  return b;
};
const i64 = (n: bigint) => {
  const b = Buffer.alloc(8);
  b.writeBigInt64LE(n);
  return b;
};
const u32 = (n: number) => {
  const b = Buffer.alloc(4);
  b.writeUInt32LE(n);
  return b;
};
const meta = (pubkey: PublicKey, isWritable = false, isSigner = false) => ({
  pubkey,
  isWritable,
  isSigner,
});

describe.skipIf(!enabled)("Quantum Vault compiled SBF execution (local bank only)", () => {
  it("executes real SPL mint, ATA, deposit/withdraw CPI and rejects alternate-client bypasses", async () => {
    const ctx = await start([{ name: "quantum_vault", programId: pid }], [], 1_400_000n);
    const payer = ctx.payer;
    const mint = Keypair.generate();
    const recipient = Keypair.generate();
    const attacker = Keypair.generate();
    const source = deriveTokenAccount(payer.publicKey, mint.publicKey);
    const destination = deriveTokenAccount(recipient.publicKey, mint.publicKey);
    let unique = 0;
    const send = async (ixs: TransactionInstruction[], signers: Keypair[] = [], fail = false) => {
      const block = await ctx.banksClient.getLatestBlockhash();
      if (!block) throw new Error("Missing bank blockhash");
      const tx = new Transaction({ feePayer: payer.publicKey, recentBlockhash: block[0] });
      // Unique harmless memo avoids cached duplicate signatures in negative tests.
      tx.add(
        new TransactionInstruction({
          programId: new PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr"),
          keys: [],
          data: Buffer.from(String(unique++)),
        }),
        ...ixs,
      );
      tx.sign(payer, ...signers);
      const result = await ctx.banksClient.tryProcessTransaction(tx);
      if (fail) expect(result.result).not.toBeNull();
      else expect(result.result).toBeNull();
      return result;
    };
    const now = async () => (await ctx.banksClient.getClock()).unixTimestamp;
    const clock = async (timestamp: bigint) => {
      const c = await ctx.banksClient.getClock();
      ctx.setClock(
        new Clock(c.slot, c.epochStartTimestamp, c.epoch, c.leaderScheduleEpoch, timestamp),
      );
    };
    const rent = await ctx.banksClient.getRent();
    await send(
      [
        SystemProgram.createAccount({
          fromPubkey: payer.publicKey,
          newAccountPubkey: mint.publicKey,
          lamports: Number(rent.minimumBalance(BigInt(MINT_SIZE))),
          space: MINT_SIZE,
          programId: TOKEN_PROGRAM_ID,
        }),
        createInitializeMint2Instruction(mint.publicKey, 6, payer.publicKey, null),
        createAssociatedTokenAccountInstruction(
          payer.publicKey,
          source,
          payer.publicKey,
          mint.publicKey,
        ),
        createAssociatedTokenAccountInstruction(
          payer.publicKey,
          destination,
          recipient.publicKey,
          mint.publicKey,
        ),
        createMintToInstruction(mint.publicKey, source, payer.publicKey, 1000n),
      ],
      [mint],
    );
    const makeCreate = (id: bigint, unlock: bigint = 0n) => {
      const { vault, escrow } = deriveVault(pid, payer.publicKey, mint.publicKey, id);
      const ix = new TransactionInstruction({
        programId: pid,
        keys: [
          meta(payer.publicKey, true, true),
          meta(mint.publicKey),
          meta(vault, true),
          meta(escrow, true),
          meta(destination),
          meta(TOKEN_PROGRAM_ID),
          meta(new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL")),
          meta(SystemProgram.programId),
        ],
        data: Buffer.concat([
          Buffer.from(IX.createVault),
          u64(id),
          u64(100n),
          u64(250n),
          i64(unlock),
        ]),
      });
      return { vault, escrow, ix };
    };
    const v = makeCreate(1n);
    await send([v.ix]);
    const account = async (key: PublicKey) => {
      const a = await ctx.banksClient.getAccount(key);
      if (!a) throw new Error("Missing account");
      return a;
    };
    const state = async () => decodeVault((await account(v.vault)).data);
    const balance = async (key: PublicKey) =>
      Buffer.from((await account(key)).data).readBigUInt64LE(64);
    expect((await account(v.vault)).owner.equals(pid)).toBe(true);
    expect((await account(v.escrow)).owner.equals(TOKEN_PROGRAM_ID)).toBe(true);
    expect(new PublicKey((await account(v.escrow)).data.subarray(32, 64)).equals(v.vault)).toBe(
      true,
    );
    expect((await account(v.vault)).lamports).toBeGreaterThanOrEqual(
      Number(rent.minimumBalance(208n)),
    );
    expect((await state()).destinationOwner.equals(recipient.publicKey)).toBe(true);
    await send([v.ix], [], true); // Duplicate create cannot replace/loosen policy.
    const deposit = (amount: bigint) =>
      new TransactionInstruction({
        programId: pid,
        keys: [
          meta(payer.publicKey, false, true),
          meta(v.vault),
          meta(mint.publicKey),
          meta(source, true),
          meta(v.escrow, true),
          meta(TOKEN_PROGRAM_ID),
        ],
        data: Buffer.concat([Buffer.from(IX.deposit), u64(amount)]),
      });
    await send([deposit(500n)]);
    expect(await balance(source)).toBe(500n);
    expect(await balance(v.escrow)).toBe(500n);
    await send([deposit(0n)], [], true);
    const withdraw = async (
      amount: bigint,
      options: { nonce?: bigint; epoch?: number; expires?: bigint } = {},
    ) => {
      const s = await state();
      return new TransactionInstruction({
        programId: pid,
        keys: [
          meta(payer.publicKey, false, true),
          meta(v.vault, true),
          meta(mint.publicKey),
          meta(v.escrow, true),
          meta(destination, true),
          meta(TOKEN_PROGRAM_ID),
        ],
        data: Buffer.concat([
          Buffer.from(IX.withdraw),
          u64(amount),
          u64(options.nonce ?? s.nonce),
          u32(options.epoch ?? s.epoch),
          i64(options.expires ?? (await now()) + 120n),
        ]),
      });
    };
    const reject = async (ix: TransactionInstruction, signers: Keypair[] = []) => {
      const before = await balance(v.escrow);
      const n = (await state()).nonce;
      await send([ix], signers, true);
      expect(await balance(v.escrow)).toBe(before);
      expect((await state()).nonce).toBe(n);
    };
    const substitute = async (index: number, key: PublicKey, signer = false) => {
      const ix = await withdraw(1n);
      ix.keys[index] = meta(key, index === 3 || index === 4, signer);
      return ix;
    };
    await reject(await substitute(0, attacker.publicKey, true), [attacker]);
    await reject(await substitute(4, source));
    await reject(await substitute(2, source));
    await reject(await substitute(3, source));
    await reject(await substitute(5, SystemProgram.programId));
    const badDeposit = deposit(1n);
    badDeposit.keys[4] = meta(source, true);
    await reject(badDeposit);
    await reject(await withdraw(0n));
    await reject(await withdraw(101n));
    await reject(await withdraw(1n, { epoch: 1 }));
    await reject(await withdraw(1n, { expires: (await now()) - 1n }));
    await reject(await withdraw(1n, { expires: (await now()) + 601n }));
    const first = await withdraw(100n);
    await send([first]);
    expect(await balance(v.escrow)).toBe(400n);
    expect(await balance(destination)).toBe(100n);
    expect((await state()).nonce).toBe(1n);
    await reject(first); // Real replay instruction with old nonce, new transaction.
    await send([await withdraw(100n)]);
    await reject(await withdraw(51n));
    const end = (await state()).windowStart + 86400n;
    await clock(end - 1n);
    await reject(await withdraw(51n));
    await clock(end);
    await send([await withdraw(51n)]);
    expect((await state()).windowSpent).toBe(51n);
    const ownerIx = (discriminator: Uint8Array) =>
      new TransactionInstruction({
        programId: pid,
        keys: [meta(payer.publicKey, false, true), meta(v.vault, true)],
        data: Buffer.from(discriminator),
      });
    await send([ownerIx(IX.pause)]);
    await reject(await withdraw(1n));
    await send([ownerIx(IX.unpause)], [], true);
    await send([ownerIx(IX.requestUnpause)]);
    const unlock = (await state()).unpauseAt;
    await clock(unlock - 1n);
    await send([ownerIx(IX.unpause)], [], true);
    await clock(unlock);
    await send([ownerIx(IX.unpause)]);
    expect((await state()).epoch).toBe(1);
    await reject(await withdraw(1n, { epoch: 0 }));
    // Recipient-owned authority changes are detectable by the program, not only by the client.
    await send(
      [
        createSetAuthorityInstruction(
          destination,
          recipient.publicKey,
          AuthorityType.AccountOwner,
          attacker.publicKey,
        ),
      ],
      [recipient],
    );
    await reject(await withdraw(1n));
    await send(
      [
        createSetAuthorityInstruction(
          destination,
          attacker.publicKey,
          AuthorityType.AccountOwner,
          recipient.publicKey,
        ),
      ],
      [attacker],
    );
    // SPL cannot close escrow under the ordinary owner signature; no vault close/rescue instruction exists.
    await send(
      [createCloseAccountInstruction(v.escrow, payer.publicKey, payer.publicKey)],
      [],
      true,
    );
    const unknown = ownerIx(Buffer.alloc(8, 255));
    await send([unknown], [], true);
    const later = (await now()) + 10n;
    const locked = makeCreate(2n, later);
    await send([locked.ix]);
    expect(locked.vault.equals(v.vault)).toBe(false);
    const dep2 = deposit(1n);
    dep2.keys[1] = meta(locked.vault);
    dep2.keys[4] = meta(locked.escrow, true);
    await send([dep2]);
    const lockWithdraw = await withdraw(1n, { epoch: 0, nonce: 0n });
    lockWithdraw.keys[1] = meta(locked.vault, true);
    lockWithdraw.keys[3] = meta(locked.escrow, true);
    await send([lockWithdraw], [], true);
    await clock(later);
    await send([lockWithdraw]);
    // Artificial unreachable overflow fixture: compiled program still rejects and rolls back CPI.
    const raw = await account(v.vault);
    const original = await state();
    const injected: VaultAccount = { ...original, nonce: (1n << 64n) - 1n };
    ctx.setAccount(v.vault, { ...raw, data: Buffer.from(encodeVault(injected)) });
    await reject(await withdraw(1n));
    ctx.setAccount(v.vault, raw);
    expect(await balance(v.escrow)).toBe(249n);
    console.log(
      "SBF executed: real mint/ATAs, balances, CPI, nonce; 24 negative/boundary cases; overflow uses explicit injected unreachable state. Rent locked, no close path.",
    );
  }, 120_000);
});