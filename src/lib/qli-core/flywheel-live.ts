// Live Quantum Flywheel cycle: claim creator fees -> buy back on the token's own DBC pool -> burn.
// Every step builds one unsigned transaction for explicit wallet review; nothing here signs,
// schedules or runs in the background. Submission goes through `sendReviewedOnce` only.
import {
  Connection,
  PublicKey,
  Transaction,
  TransactionInstruction,
  type Commitment,
  type TransactionSignature,
} from "@solana/web3.js";
import {
  convertToLamports,
  getCurrentPoint,
  type PoolConfig,
  type VirtualPool,
} from "@meteora-ag/dynamic-bonding-curve-sdk";
import { createDBCServices, DBC_PROGRAM_ID } from "./dbc";
import { GENESIS, WSOL_MINT, type LaunchNetwork } from "./dbc-launch";
import { txMessageSha256 } from "./authorization";

type BN = ReturnType<typeof convertToLamports>;
/** Fields read from the on-chain virtual pool (SDK IDL types are not inferred precisely). */
type PoolState = {
  config: PublicKey;
  creator: PublicKey;
  baseMint: PublicKey;
  isMigrated: number;
  creatorQuoteFee: BN;
  creatorBaseFee: BN;
};
export type FlywheelStep = "claim" | "buyback" | "burn";
export const TOKEN_PROGRAM = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
export const TOKEN_2022_PROGRAM = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";
export const ATA_PROGRAM = "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL";
/** Programs any flywheel step may invoke; anything else refuses the build. */
export const FLYWHEEL_ALLOWED_PROGRAMS = new Set([
  DBC_PROGRAM_ID,
  "11111111111111111111111111111111",
  TOKEN_PROGRAM,
  TOKEN_2022_PROGRAM,
  ATA_PROGRAM,
  "ComputeBudget111111111111111111111111111111",
]);
/** Hard per-transaction buyback ceiling; the UI cap may only be lower. */
export const BUYBACK_HARD_MAX_SOL = 10;
export const DEFAULT_BUYBACK_CAP_SOL = 0.5;
export const MAX_SLIPPAGE_BPS = 1000;

export type FlywheelPool = {
  pool: string;
  config: string;
  creator: string;
  baseMint: string;
  quoteMint: string;
  baseDecimals: number;
  baseTokenProgram: string;
  isMigrated: boolean;
  creatorQuoteFee: string; // lamports, as decimal string
  creatorBaseFee: string;
  virtualPool: VirtualPool;
  poolConfig: PoolConfig;
};

/** Reads the pool on-chain and refuses unless the connected wallet is its creator. */
export async function loadFlywheelPool(
  rpc: string,
  poolAddress: string,
  wallet: string,
): Promise<FlywheelPool> {
  const s = createDBCServices(rpc);
  const raw = await s.pool.get(new PublicKey(poolAddress).toBase58());
  const vp = raw as unknown as PoolState;
  const cfg = await s.client.state.getPoolConfig(vp.config);
  if (!cfg) throw new Error("Pool config not found on the selected network.");
  if (!vp.creator.equals(new PublicKey(wallet)))
    throw new Error("Connected wallet is not this pool's creator. The flywheel is blocked.");
  const mintInfo = await s.connection.getParsedAccountInfo(vp.baseMint, "confirmed");
  const parsed = mintInfo.value?.data as { parsed?: { info?: { decimals?: number } } } | undefined;
  const decimals = parsed?.parsed?.info?.decimals;
  const owner = mintInfo.value?.owner.toBase58();
  if (decimals === undefined || !owner || ![TOKEN_PROGRAM, TOKEN_2022_PROGRAM].includes(owner))
    throw new Error("Token mint could not be read on the selected network.");
  return {
    pool: poolAddress,
    config: vp.config.toBase58(),
    creator: vp.creator.toBase58(),
    baseMint: vp.baseMint.toBase58(),
    quoteMint: cfg.quoteMint.toBase58(),
    baseDecimals: decimals,
    baseTokenProgram: owner,
    isMigrated: Number(vp.isMigrated) !== 0,
    creatorQuoteFee: vp.creatorQuoteFee.toString(),
    creatorBaseFee: vp.creatorBaseFee.toString(),
    virtualPool: raw,
    poolConfig: cfg,
  };
}

export function associatedTokenAddress(owner: PublicKey, mint: PublicKey, tokenProgram: PublicKey) {
  return PublicKey.findProgramAddressSync(
    [owner.toBuffer(), tokenProgram.toBuffer(), mint.toBuffer()],
    new PublicKey(ATA_PROGRAM),
  )[0];
}

/** SPL Token / Token-2022 BurnChecked (instruction 15): [15, amount u64 LE, decimals u8]. */
export function burnCheckedInstruction(p: {
  account: PublicKey;
  mint: PublicKey;
  owner: PublicKey;
  amount: bigint;
  decimals: number;
  tokenProgram: PublicKey;
}) {
  if (p.amount <= 0n || p.amount > 0xffff_ffff_ffff_ffffn) throw new Error("Invalid burn amount.");
  if (!Number.isInteger(p.decimals) || p.decimals < 0 || p.decimals > 255)
    throw new Error("Invalid token decimals.");
  const data = new Uint8Array(10);
  data[0] = 15;
  new DataView(data.buffer).setBigUint64(1, p.amount, true);
  data[9] = p.decimals;
  return new TransactionInstruction({
    programId: p.tokenProgram,
    keys: [
      { pubkey: p.account, isSigner: false, isWritable: true },
      { pubkey: p.mint, isSigner: false, isWritable: true },
      { pubkey: p.owner, isSigner: true, isWritable: false },
    ],
    data: data as unknown as Buffer,
  });
}

/** Converts a decimal UI amount to base units without floating-point rounding. */
export function toBaseUnits(amount: string, decimals: number): bigint {
  const s = amount.trim();
  if (!/^\d+(\.\d+)?$/.test(s)) throw new Error("Enter a positive number.");
  const [whole, frac = ""] = s.split(".");
  if (frac.length > decimals) throw new Error(`At most ${decimals} decimal places.`);
  return BigInt(whole! + frac.padEnd(decimals, "0"));
}
export function fromBaseUnits(v: bigint | string, decimals: number) {
  const n = BigInt(v);
  const d = 10n ** BigInt(decimals);
  const frac = (n % d).toString().padStart(decimals, "0").replace(/0+$/, "");
  return frac ? `${n / d}.${frac}` : `${n / d}`;
}

export function assertAllowedPrograms(tx: Transaction) {
  for (const ix of tx.instructions)
    if (!FLYWHEEL_ALLOWED_PROGRAMS.has(ix.programId.toBase58()))
      throw new Error(
        `Transaction invokes an unexpected program (${ix.programId.toBase58()}). Refused.`,
      );
}

export type BuiltStep = {
  step: FlywheelStep;
  transaction: Transaction;
  reviewedMessage: Uint8Array;
  lastValidBlockHeight: number;
  feeLamports: number | null;
  accounts: string[];
  programs: string[];
  summary: string[];
  simulatedUnits: number | null;
  /** Structured scope bound by Quantum Authorization intents (base units, decimal strings). */
  scope: {
    amountBase: string;
    maxSpendLamports: string;
    slippageBps: string;
    minOutBase: string;
    recipient: string;
  };
};

export type StepInput =
  | { step: "claim" }
  | { step: "buyback"; amountSol: string; capSol: number; slippageBps: number }
  | { step: "burn"; amount: string; balance: bigint };

/** Builds, program-checks and simulates one step. Never signs or sends. */
export async function buildFlywheelStep(
  rpc: string,
  pool: FlywheelPool,
  wallet: string,
  input: StepInput,
): Promise<BuiltStep> {
  const s = createDBCServices(rpc);
  const owner = new PublicKey(wallet);
  if (pool.creator !== wallet) throw new Error("Connected wallet is not this pool's creator.");
  let tx: Transaction;
  let summary: string[];
  let scope: BuiltStep["scope"];
  if (input.step === "claim") {
    const quote = BigInt(pool.creatorQuoteFee);
    const base = BigInt(pool.creatorBaseFee);
    if (quote === 0n && base === 0n) throw new Error("No creator fees are claimable right now.");
    tx = await s.creator.claimFees({
      creator: owner,
      payer: owner,
      pool: new PublicKey(pool.pool),
      maxBaseAmount: (pool.virtualPool as unknown as PoolState).creatorBaseFee,
      maxQuoteAmount: (pool.virtualPool as unknown as PoolState).creatorQuoteFee,
    });
    scope = {
      amountBase: quote.toString(),
      maxSpendLamports: "",
      slippageBps: "",
      minOutBase: "",
      recipient: wallet,
    };
    summary = [
      `Claim creator fees from pool ${pool.pool}`,
      `Up to ${fromBaseUnits(quote, 9)} SOL and ${fromBaseUnits(base, pool.baseDecimals)} tokens to your wallet`,
    ];
  } else if (input.step === "buyback") {
    if (pool.isMigrated)
      throw new Error("This pool has migrated to DAMM v2. Bonding-curve buybacks are blocked.");
    if (pool.quoteMint !== WSOL_MINT) throw new Error("Buybacks support SOL-quoted pools only.");
    const cap = Math.min(input.capSol, BUYBACK_HARD_MAX_SOL);
    const lamports = toBaseUnits(input.amountSol, 9);
    if (lamports <= 0n) throw new Error("Enter a buyback amount above zero.");
    if (lamports > toBaseUnits(String(cap), 9))
      throw new Error(`Amount exceeds your ${cap} SOL per-transaction cap.`);
    if (
      !Number.isInteger(input.slippageBps) ||
      input.slippageBps < 1 ||
      input.slippageBps > MAX_SLIPPAGE_BPS
    )
      throw new Error(`Slippage must be 1–${MAX_SLIPPAGE_BPS} bps.`);
    const amountIn: BN = convertToLamports(input.amountSol, 9);
    const currentPoint = await getCurrentPoint(s.connection, pool.poolConfig.activationType);
    const q = s.client.pool.swapQuote({
      virtualPool: pool.virtualPool,
      config: pool.poolConfig,
      swapBaseForQuote: false,
      amountIn,
      slippageBps: input.slippageBps,
      hasReferral: false,
      eligibleForFirstSwapWithMinFee: false,
      currentPoint,
    });
    if (q.minimumAmountOut.isZero()) throw new Error("Quote returned zero tokens. Refused.");
    tx = await s.pool.swap({
      owner,
      payer: owner,
      pool: new PublicKey(pool.pool),
      amountIn,
      minimumAmountOut: q.minimumAmountOut,
      swapBaseForQuote: false,
      referralTokenAccount: null,
    });
    scope = {
      amountBase: lamports.toString(),
      maxSpendLamports: lamports.toString(),
      slippageBps: String(input.slippageBps),
      minOutBase: q.minimumAmountOut.toString(),
      recipient: wallet,
    };
    summary = [
      `Buy back on pool ${pool.pool}: spend ${input.amountSol} SOL`,
      `Quoted ${fromBaseUnits(((q as unknown as { outputAmount?: BN }).outputAmount ?? q.minimumAmountOut).toString(), pool.baseDecimals)} tokens; minimum ${fromBaseUnits(q.minimumAmountOut.toString(), pool.baseDecimals)} (${input.slippageBps} bps slippage)`,
    ];
  } else {
    const amount = toBaseUnits(input.amount, pool.baseDecimals);
    if (amount <= 0n) throw new Error("Enter a burn amount above zero.");
    if (amount > input.balance) throw new Error("Burn amount exceeds your token balance.");
    const program = new PublicKey(pool.baseTokenProgram);
    const mint = new PublicKey(pool.baseMint);
    tx = new Transaction().add(
      burnCheckedInstruction({
        account: associatedTokenAddress(owner, mint, program),
        mint,
        owner,
        amount,
        decimals: pool.baseDecimals,
        tokenProgram: program,
      }),
    );
    scope = {
      amountBase: amount.toString(),
      maxSpendLamports: "",
      slippageBps: "",
      minOutBase: "",
      recipient: associatedTokenAddress(owner, mint, program).toBase58(),
    };
    summary = [
      `Permanently burn ${input.amount} tokens of ${pool.baseMint}`,
      "Burned tokens are destroyed and cannot be recovered.",
    ];
  }
  assertAllowedPrograms(tx);
  const prepared = await s.prepare(tx, owner);
  assertAllowedPrograms(prepared.transaction);
  if (prepared.requiredSigners.length !== 1 || prepared.requiredSigners[0] !== wallet)
    throw new Error("Unexpected signer set. Only your wallet may sign a flywheel step.");
  const sim = await s.simulate(prepared.transaction);
  return {
    step: input.step,
    transaction: prepared.transaction,
    reviewedMessage: prepared.reviewedMessage,
    lastValidBlockHeight: prepared.lastValidBlockHeight,
    feeLamports: prepared.feeLamports,
    accounts: prepared.accounts,
    programs: [...new Set(prepared.transaction.instructions.map((i) => i.programId.toBase58()))],
    summary,
    simulatedUnits: sim.unitsConsumed ?? null,
    scope,
  };
}

/** Sends wallet-signed bytes exactly once and confirms against the reviewed blockhash. */
export async function sendReviewedOnce(
  connection: Connection,
  signed: Uint8Array,
  built: Pick<BuiltStep, "transaction" | "lastValidBlockHeight">,
  onSubmitted: (sig: TransactionSignature) => void,
  commitment: Commitment = "confirmed",
) {
  const sig = await connection.sendRawTransaction(signed, {
    skipPreflight: false,
    preflightCommitment: commitment,
    maxRetries: 3,
  });
  onSubmitted(sig);
  const res = await connection.confirmTransaction(
    {
      signature: sig,
      blockhash: built.transaction.recentBlockhash!,
      lastValidBlockHeight: built.lastValidBlockHeight,
    },
    commitment,
  );
  if (res.value.err)
    throw new Error(`Transaction failed on chain: ${JSON.stringify(res.value.err)}`);
  return sig;
}

/** Post-confirmation re-read: the "verified" tier requires this evidence. */
export async function readFlywheelBalances(rpc: string, pool: FlywheelPool, wallet: string) {
  const conn = new Connection(rpc, "confirmed");
  const owner = new PublicKey(wallet);
  const mint = new PublicKey(pool.baseMint);
  const ata = associatedTokenAddress(owner, mint, new PublicKey(pool.baseTokenProgram));
  const [sol, tok, supply] = await Promise.all([
    conn.getBalance(owner, "confirmed"),
    conn.getTokenAccountBalance(ata, "confirmed").catch(() => null),
    conn.getTokenSupply(mint, "confirmed"),
  ]);
  return {
    solLamports: BigInt(sol),
    tokenBalance: BigInt(tok?.value.amount ?? "0"),
    supply: BigInt(supply.value.amount),
  };
}

export function flywheelFingerprint(p: {
  network: LaunchNetwork;
  rpc: string;
  account: string | null;
  pool: string;
  input: StepInput;
}) {
  return JSON.stringify({
    ...p,
    input: { ...p.input, balance: "balance" in p.input ? String(p.input.balance) : undefined },
  });
}

/** Expected authorization-intent fields rebuilt from the CURRENT reviewed step and live context. */
export function expectedAuthorizationFields(p: {
  built: Pick<
    BuiltStep,
    "step" | "scope" | "reviewedMessage" | "transaction" | "lastValidBlockHeight"
  >;
  pool: Pick<FlywheelPool, "pool" | "creator" | "baseMint">;
  wallet: string;
  network: "mainnet-beta" | "devnet";
  identity: { address: string; root: string };
}) {
  const blockhash = p.built.transaction.recentBlockhash;
  if (!blockhash) throw new Error("Reviewed transaction has no blockhash.");
  return {
    v: "1",
    operation: p.built.step,
    network: p.network,
    genesis: GENESIS[p.network],
    wallet: p.wallet,
    identityAddress: p.identity.address,
    identityRoot: p.identity.root,
    pool: p.pool.pool,
    creator: p.pool.creator,
    mint: p.pool.baseMint,
    recipient: p.built.scope.recipient,
    amountBase: p.built.scope.amountBase,
    maxSpendLamports: p.built.scope.maxSpendLamports,
    slippageBps: p.built.scope.slippageBps,
    minOutBase: p.built.scope.minOutBase,
    txMessageSha256: txMessageSha256(p.built.reviewedMessage),
    blockhash,
    lastValidBlockHeight: String(p.built.lastValidBlockHeight),
  };
}
