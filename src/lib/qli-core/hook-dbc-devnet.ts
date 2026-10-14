// Hook Forge v2.2 — Meteora DBC TransferHookPool devnet builders (SDK 1.5.13) for the research
// QuantumQLi hook. Devnet only. Builders return transactions for the reviewed wallet flow; nothing
// here signs with a wallet, stores keys or sends. One-time config/mint/position keypairs live only
// inside a builder call, partial-sign, and are dropped.
//
// Distinction (do not blur): the DBC-created base mint's Token-2022 TransferHook AUTHORITY is the
// Meteora DBC pool authority PDA (deriveDbcPoolAuthority), not the creator. The QLi POLICY
// authority is the creator's wallet, bound once by `qlihk:db`, which the mint keypair co-signs in
// the same transaction as pool creation. The hook runs on Token-2022 transfers only (including
// the transfers inside DBC swaps); it is not a swap callback.
import "./buffer-global";
import BN from "bn.js";
import {
  Keypair,
  PublicKey,
  Transaction,
  VersionedTransaction,
  type Connection,
} from "@solana/web3.js";
import {
  ActivationType,
  BaseFeeMode,
  CollectFeeMode,
  DAMM_V2_MIGRATION_FEE_ADDRESS,
  DynamicBondingCurveClient,
  MigrationFeeOption,
  MigrationOption,
  SwapMode,
  TokenAuthorityOption,
  TokenDecimal,
  TokenType,
  buildCurveWithMarketCap,
  createDbcProgram,
  deriveDbcPoolAddress,
  deriveDbcPoolAuthority,
  getCurrentPoint,
} from "@meteora-ag/dynamic-bonding-curve-sdk";
import { TOKEN_2022_PROGRAM_ID, getTransferHook, unpackMint } from "@solana/spl-token";
import {
  DEFAULT_DBC_FORM,
  migrationReadiness,
  validateDbcForm,
  type DbcHookForm,
  type DbcPoolStatus,
} from "./hook-dbc-core";
export * from "./hook-dbc-core";
import {
  IX_INIT_DBC,
  assertDevnet,
  assertReviewedCode,
  classifySimulation,
  dbcInitInstruction,
  deriveHookAccounts,
  inspectMint,
  inspectProgram,
  type Built,
  type Check,
  type SimVerdict,
} from "./hook-devnet";

export const DBC_PROGRAM = "dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN";
export const DAMM_V2_PROGRAM = "cpamdpZCGKUy5JxQXB4dcpGPiikHawvSWAd6mEn1sGG";
export const WSOL = "So11111111111111111111111111111111111111112";
export const TX_SIZE_LIMIT = 1232;
export const TRANSFER_HOOK_POOL_DISC = [237, 219, 184, 23, 42, 189, 169, 35] as const;
const BASE_PROGRAMS = [
  DBC_PROGRAM,
  "11111111111111111111111111111111",
  "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
  "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb",
  "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL",
  "ComputeBudget111111111111111111111111111111",
];
/** Programs a DBC hook transaction may invoke: base set + the exact verified hook (+ DAMM v2 for migration). */
export function allowedPrograms(hook: string, migration = false): Set<string> {
  return new Set([...BASE_PROGRAMS, hook, ...(migration ? [DAMM_V2_PROGRAM] : [])]);
}

// ---------- form + curve ----------

/** Token-2022 base, SOL quote, fixed fee, DAMM v2 migration, no vesting, no first buy. */
export function dbcHookCurve(f: DbcHookForm) {
  return buildCurveWithMarketCap({
    token: {
      tokenType: TokenType.Token2022,
      tokenBaseDecimal: TokenDecimal.SIX,
      tokenQuoteDecimal: 9,
      tokenAuthorityOption: TokenAuthorityOption.Immutable,
      totalTokenSupply: f.totalSupply,
      leftover: 0,
    },
    fee: {
      baseFeeParams: {
        baseFeeMode: BaseFeeMode.FeeSchedulerLinear,
        feeSchedulerParam: {
          startingFeeBps: f.feeBps,
          endingFeeBps: f.feeBps,
          numberOfPeriod: 0,
          totalDuration: 0,
        },
      },
      dynamicFeeEnabled: false,
      collectFeeMode: CollectFeeMode.QuoteToken,
      creatorTradingFeePercentage: 0,
      poolCreationFee: 0,
      enableFirstSwapWithMinFee: false,
    },
    migration: {
      migrationOption: MigrationOption.MET_DAMM_V2,
      migrationFeeOption: MigrationFeeOption.FixedBps100,
      migrationFee: { feePercentage: 0, creatorFeePercentage: 0 },
    },
    liquidityDistribution: {
      partnerPermanentLockedLiquidityPercentage: 0,
      partnerLiquidityPercentage: 0,
      creatorPermanentLockedLiquidityPercentage: 100,
      creatorLiquidityPercentage: 0,
    },
    lockedVesting: {
      totalLockedVestingAmount: 0,
      numberOfVestingPeriod: 0,
      cliffUnlockAmount: 0,
      totalVestingDuration: 0,
      cliffDurationFromMigrationTime: 0,
    },
    activationType: ActivationType.Timestamp,
    initialMarketCap: f.initialMarketCap,
    migrationMarketCap: f.migrationMarketCap,
  });
}

// ---------- pure transaction verification (unit-tested) ----------

export function requiredSigners(tx: Transaction): string[] {
  const m = tx.compileMessage();
  return m.accountKeys.slice(0, m.header.numRequiredSignatures).map((k) => k.toBase58());
}
export function txSize(tx: Transaction): number {
  try {
    return tx.serialize({ requireAllSignatures: false, verifySignatures: false }).length;
  } catch {
    return Number.POSITIVE_INFINITY; // web3.js refuses to encode oversize transactions
  }
}
const sameSet = (a: string[], b: string[]) =>
  a.length === b.length && [...a].sort().join() === [...b].sort().join();

/** Throws unless signers, programs and size match exactly. */
export function verifyTxShape(
  tx: Transaction,
  want: { signers: string[]; programs: Set<string>; mustInvoke: string[] },
) {
  const s = requiredSigners(tx);
  if (!sameSet(s, want.signers))
    throw new Error(`Unexpected signer set (${s.length}); signing blocked.`);
  const progs = [...new Set(tx.instructions.map((i) => i.programId.toBase58()))];
  const foreign = progs.find((p) => !want.programs.has(p));
  if (foreign) throw new Error(`Unexpected program ${foreign}; signing blocked.`);
  for (const p of want.mustInvoke)
    if (!progs.includes(p)) throw new Error(`Transaction does not invoke ${p}; signing blocked.`);
  const size = txSize(tx);
  if (size > TX_SIZE_LIMIT)
    throw new Error(`Transaction is ${size} bytes (limit ${TX_SIZE_LIMIT}); signing blocked.`);
  return { signers: s, programs: progs, size };
}

/**
 * Inserts `qlihk:db` immediately AFTER the DBC pool-initialization instruction (pool creation
 * initializes the mint first; the hook then reads the mint's TransferHook extension).
 * Refuses any DBC instruction after the init (no hidden first buy).
 */
export function insertDbcHookInit(
  sdkTx: Transaction,
  hookIx: ReturnType<typeof dbcInitInstruction>,
): Transaction {
  const idx = sdkTx.instructions.map((i) => i.programId.toBase58()).lastIndexOf(DBC_PROGRAM);
  if (idx < 0) throw new Error("SDK transaction has no DBC instruction.");
  const dbcCount = sdkTx.instructions.filter((i) => i.programId.toBase58() === DBC_PROGRAM).length;
  if (dbcCount !== 1)
    throw new Error("Expected exactly one DBC instruction (pool init, no first buy).");
  const out = new Transaction();
  out.add(...sdkTx.instructions.slice(0, idx + 1), hookIx, ...sdkTx.instructions.slice(idx + 1));
  return out;
}

/** Swap must carry the hook program, its ExtraAccountMetaList and QLi config PDA in the DBC ix. */
export function verifySwapHookAccounts(tx: Transaction, mint: PublicKey, hook: PublicKey) {
  const swap = tx.instructions.filter((i) => i.programId.toBase58() === DBC_PROGRAM);
  if (swap.length !== 1) throw new Error("Expected exactly one DBC swap instruction.");
  const instruction = swap[0];
  if (!instruction) throw new Error("Missing DBC swap instruction.");
  const keys = new Set(instruction.keys.map((k) => k.pubkey.toBase58()));
  const { config, extraMetas } = deriveHookAccounts(mint, hook);
  for (const [n, k] of [
    ["hook program", hook],
    ["ExtraAccountMetaList", extraMetas],
    ["QLi policy config", config],
  ] as const)
    if (!keys.has(k.toBase58()))
      throw new Error(`Swap is missing the ${n} (${k.toBase58()}); signing blocked.`);
}

// ---------- builders ----------

async function finalizeMulti(
  conn: Connection,
  payer: PublicKey,
  tx: Transaction,
  kind: Built["kind"],
  summary: string[],
  extraLamports: number,
  signers: Keypair[],
  check: (t: Transaction) => void,
  artifacts?: Built["artifacts"],
): Promise<Built> {
  const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash("confirmed");
  tx.feePayer = payer;
  tx.recentBlockhash = blockhash;
  tx.lastValidBlockHeight = lastValidBlockHeight;
  check(tx);
  if (signers.length) tx.partialSign(...signers);
  const fee = (await conn.getFeeForMessage(tx.compileMessage(), "confirmed")).value ?? 5000;
  const bal = await conn.getBalance(payer, "confirmed");
  if (bal < fee + extraLamports)
    throw new Error(
      `Insufficient devnet SOL: about ${((fee + extraLamports) / 1e9).toFixed(4)} SOL estimated.`,
    );
  return {
    kind,
    transaction: tx,
    reviewedMessage: new Uint8Array(tx.serializeMessage()),
    lastValidBlockHeight,
    summary,
    estimatedLamports: fee + extraLamports,
    ephemeralSigner: signers[0]?.publicKey.toBase58(),
    artifacts,
  };
}

async function gateHook(conn: Connection, hook: PublicKey, expected: string) {
  await assertDevnet(conn);
  const dbc = await conn.getAccountInfo(new PublicKey(DBC_PROGRAM), "confirmed");
  if (!dbc?.executable) throw new Error("Meteora DBC program is not executable on this RPC.");
  const prog = await inspectProgram(conn, hook);
  if (!prog.executable)
    throw new Error("Program deployment required: hook is not executable on devnet.");
  assertReviewedCode(prog, expected);
}

/** Step 8a: partner config with transfer hook. Wallet = payer, fee claimer, leftover receiver. */
export async function buildDbcConfig(
  conn: Connection,
  wallet: PublicKey,
  hook: PublicKey,
  form: DbcHookForm,
  expectedFingerprint: string,
): Promise<Built> {
  const errs = validateDbcForm(form);
  if (errs.length) throw new Error(errs[0]);
  await gateHook(conn, hook, expectedFingerprint);
  const client = new DynamicBondingCurveClient(conn, "confirmed");
  const configKp = Keypair.generate();
  const sdkTx = await client.partner.createConfigWithTransferHook({
    ...dbcHookCurve(form),
    config: configKp.publicKey,
    feeClaimer: wallet,
    leftoverReceiver: wallet,
    quoteMint: new PublicKey(WSOL),
    payer: wallet,
    transferHookProgram: hook,
  });
  const tx = new Transaction().add(...sdkTx.instructions);
  const rent = await conn.getMinimumBalanceForRentExemption(1200);
  return finalizeMulti(
    conn,
    wallet,
    tx,
    "dbc-config",
    [
      `New DBC ConfigWithTransferHook ${configKp.publicKey.toBase58()} (one-time key, signed in memory, discarded).`,
      `transferHookProgram = ${hook.toBase58()} (your reviewed build). Quote = SOL; base = Token-2022.`,
      `Fee ${form.feeBps} bps fixed; migration to DAMM v2 at ~${form.migrationMarketCap} SOL market cap (SDK curve).`,
      "Fee claimer and leftover receiver = your wallet. No first buy.",
    ],
    rent,
    [configKp],
    (t) =>
      verifyTxShape(t, {
        signers: [wallet.toBase58(), configKp.publicKey.toBase58()],
        programs: allowedPrograms(hook.toBase58()),
        mustInvoke: [DBC_PROGRAM],
      }),
    { config: configKp.publicKey.toBase58() },
  );
}

export type DbcConfigStatus = {
  ok: boolean;
  transferHookProgram: string | null;
  checks: Check[];
  slot: number;
};
export async function inspectDbcConfig(
  conn: Connection,
  config: PublicKey,
  hook: PublicKey,
): Promise<DbcConfigStatus> {
  await assertDevnet(conn);
  const r = await conn.getAccountInfoAndContext(config, "confirmed");
  const checks: Check[] = [];
  let hp: string | null = null;
  const owned = r.value?.owner.toBase58() === DBC_PROGRAM;
  checks.push({
    ok: owned,
    label: "Config owner",
    detail: owned ? "Owned by Meteora DBC." : "Not a DBC-owned account.",
    source: `slot ${r.context.slot}`,
  });
  if (owned && r.value) {
    try {
      const { program } = createDbcProgram(conn);
      const d = program.coder.accounts.decode("configWithTransferHook", r.value.data) as {
        transferHookProgram: PublicKey;
      };
      hp = d.transferHookProgram.toBase58();
    } catch {
      hp = null;
    }
    checks.push({
      ok: hp === hook.toBase58(),
      label: "ConfigWithTransferHook",
      detail: hp
        ? `transferHookProgram ${hp}${hp === hook.toBase58() ? " (matches)" : " (DIFFERENT program)"}`
        : "Not a ConfigWithTransferHook account.",
    });
  }
  return { ok: checks.every((c) => c.ok), transferHookProgram: hp, checks, slot: r.context.slot };
}

/**
 * Step 8b: TransferHookPool from the verified config + `qlihk:db` in the SAME transaction,
 * right after pool init. Signers: wallet + one-time base mint keypair.
 */
export async function buildDbcPool(
  conn: Connection,
  wallet: PublicKey,
  hook: PublicKey,
  config: PublicKey,
  form: Pick<DbcHookForm, "name" | "symbol" | "uri">,
  expectedFingerprint: string,
): Promise<Built> {
  const errs = validateDbcForm({ ...DEFAULT_DBC_FORM, ...form });
  if (errs.length) throw new Error(errs[0]);
  await gateHook(conn, hook, expectedFingerprint);
  const cfg = await inspectDbcConfig(conn, config, hook);
  if (!cfg.ok) throw new Error("DBC config must be a ConfigWithTransferHook for this exact hook.");
  const client = new DynamicBondingCurveClient(conn, "confirmed");
  const mintKp = Keypair.generate();
  const mint = mintKp.publicKey;
  const sdkTx = await client.creator.createPoolWithTransferHook({
    ...form,
    payer: wallet,
    poolCreator: wallet,
    config,
    baseMint: mint,
    transferHookProgram: hook,
  });
  const tx = insertDbcHookInit(sdkTx, dbcInitInstruction(hook, wallet, mint));
  const pool = deriveDbcPoolAddress(new PublicKey(WSOL), mint, config);
  const { config: policy, extraMetas } = deriveHookAccounts(mint, hook);
  const rent = (await conn.getMinimumBalanceForRentExemption(1200)) * 4;
  return finalizeMulti(
    conn,
    wallet,
    tx,
    "dbc-pool",
    [
      `DBC TransferHookPool ${pool.toBase58()} for new Token-2022 base mint ${mint.toBase58()} (one-time key, signed in memory, discarded).`,
      `Mint TransferHook authority will be the DBC pool authority PDA ${deriveDbcPoolAuthority().toBase58()}, not your wallet.`,
      `Then qlihk:db (mint co-signs): QLi policy authority = your wallet; config ${policy.toBase58()}, ExtraAccountMetaList ${extraMetas.toBase58()}.`,
      "Initial policy fixed open (paused=false, allowlist=false) so pool vaults can trade. No first buy.",
    ],
    rent,
    [mintKp],
    (t) => {
      verifyTxShape(t, {
        signers: [wallet.toBase58(), mint.toBase58()],
        programs: allowedPrograms(hook.toBase58()),
        mustInvoke: [DBC_PROGRAM, hook.toBase58()],
      });
      const ids = t.instructions.map((i) => i.programId.toBase58());
      const k = ids.indexOf(DBC_PROGRAM);
      const h = t.instructions[k + 1];
      if (
        !h ||
        h.programId.toBase58() !== hook.toBase58() ||
        !Buffer.from(h.data.subarray(0, 8)).equals(Buffer.from(IX_INIT_DBC))
      )
        throw new Error("qlihk:db must directly follow the DBC pool init; signing blocked.");
    },
    { pool: pool.toBase58(), mint: mint.toBase58(), config: config.toBase58() },
  );
}

export async function inspectDbcPool(
  conn: Connection,
  pool: PublicKey,
  hook: PublicKey,
): Promise<DbcPoolStatus> {
  await assertDevnet(conn);
  const r = await conn.getAccountInfoAndContext(pool, "confirmed");
  const a = r.value;
  const out: DbcPoolStatus = {
    slot: r.context.slot,
    ok: false,
    isTransferHookPool: false,
    baseMint: null,
    config: null,
    quoteReserve: null,
    migrationQuoteThreshold: null,
    isMigrated: null,
    migrationFeeOption: null,
    dammConfig: null,
    checks: [],
  };
  out.isTransferHookPool =
    !!a &&
    a.owner.toBase58() === DBC_PROGRAM &&
    TRANSFER_HOOK_POOL_DISC.every((b, i) => a.data[i] === b);
  out.checks.push({
    ok: out.isTransferHookPool,
    label: "TransferHookPool",
    detail: out.isTransferHookPool
      ? "DBC-owned account with the TransferHookPool discriminator."
      : "Not a DBC TransferHookPool.",
    source: `getAccountInfo @ slot ${r.context.slot}`,
  });
  if (!out.isTransferHookPool || !a) return out;
  const { program } = createDbcProgram(conn);
  const ps = (
    program.coder.accounts.decode("transferHookPool", a.data) as {
      poolState: {
        baseMint: PublicKey;
        config: PublicKey;
        quoteReserve: BN;
        isMigrated: number;
      };
    }
  ).poolState;
  out.baseMint = ps.baseMint.toBase58();
  out.config = ps.config.toBase58();
  out.quoteReserve = ps.quoteReserve.toString();
  out.isMigrated = ps.isMigrated !== 0;
  const cfg = await inspectDbcConfig(conn, ps.config, hook);
  out.checks.push(...cfg.checks);
  const cfgAcc = await conn.getAccountInfo(ps.config, "confirmed");
  if (cfgAcc && cfg.ok) {
    const d = program.coder.accounts.decode("configWithTransferHook", cfgAcc.data) as {
      config: { migrationQuoteThreshold: BN; migrationFeeOption: number; migrationOption: number };
    };
    out.migrationQuoteThreshold = d.config.migrationQuoteThreshold.toString();
    out.migrationFeeOption = d.config.migrationFeeOption;
    out.dammConfig = DAMM_V2_MIGRATION_FEE_ADDRESS[d.config.migrationFeeOption]?.toBase58() ?? null;
  }
  const mintAcc = await conn.getAccountInfo(ps.baseMint, "confirmed");
  let authOk = false;
  if (mintAcc && mintAcc.owner.equals(TOKEN_2022_PROGRAM_ID)) {
    const m = unpackMint(ps.baseMint, mintAcc, TOKEN_2022_PROGRAM_ID);
    const th = getTransferHook(m);
    authOk = !!th && th.programId.equals(hook) && th.authority.equals(deriveDbcPoolAuthority());
    out.checks.push({
      ok: authOk,
      label: "Base mint TransferHook",
      detail: th
        ? `program ${th.programId.toBase58()}, authority ${th.authority.toBase58()}${th.authority.equals(deriveDbcPoolAuthority()) ? " (DBC pool authority PDA)" : ""}`
        : "No TransferHook extension.",
    });
  } else out.checks.push({ ok: false, label: "Base mint", detail: "Not a Token-2022 mint." });
  const ms = await inspectMint(conn, ps.baseMint, hook);
  const policyOk = !!ms.config && ms.extraMetasOwned;
  out.checks.push({
    ok: policyOk,
    label: "QLi policy + ExtraAccountMetaList",
    detail: ms.config
      ? `owned by the hook; policy authority ${ms.config.authority}; paused=${ms.config.policy.paused}`
      : "Not initialized (qlihk:db not executed).",
  });
  out.checks.push({
    ok: null,
    label: "Migration",
    detail: out.isMigrated
      ? "Pool reports migrated (flag alone is not proof; verify on Hook Proofs)."
      : `quoteReserve ${out.quoteReserve} / threshold ${out.migrationQuoteThreshold ?? "?"} lamports.`,
  });
  out.ok = out.isTransferHookPool && cfg.ok && authOk && policyOk;
  return out;
}

export type SwapPlan = { minimumAmountOut: string; outputAmount: string; tradingFee: string };

/** Step 8c: tiny SOL→token buy via SDK swap2WithTransferHook; minOut from SDK swapQuote2. */
export async function buildDbcSwap(
  conn: Connection,
  wallet: PublicKey,
  hook: PublicKey,
  pool: PublicKey,
  lamportsIn: bigint,
  slippageBps: number,
): Promise<Built & { quote: SwapPlan }> {
  if (lamportsIn <= 0n || lamportsIn > 100_000_000n)
    throw new Error("Devnet test buy must be 1 lamport – 0.1 SOL.");
  if (!Number.isInteger(slippageBps) || slippageBps < 1 || slippageBps > 1000)
    throw new Error("Slippage must be 1–1000 bps.");
  const st = await inspectDbcPool(conn, pool, hook);
  if (!st.ok || !st.baseMint || !st.config)
    throw new Error("Pool must verify first (step 8b checks).");
  if (st.isMigrated) throw new Error("Pool is migrated; the curve no longer swaps.");
  const client = new DynamicBondingCurveClient(conn, "confirmed");
  const raw = (await client.state.getPool(pool)) as unknown as { poolState: unknown };
  const cfgState = await client.state.getPoolConfig(new PublicKey(st.config));
  if (!raw?.poolState || !cfgState) throw new Error("SDK could not decode pool/config.");
  const currentPoint = await getCurrentPoint(conn, cfgState.activationType);
  const q = client.pool.swapQuote2({
    virtualPool: raw.poolState as never,
    config: cfgState,
    swapBaseForQuote: false,
    hasReferral: false,
    eligibleForFirstSwapWithMinFee: false,
    currentPoint,
    slippageBps,
    swapMode: SwapMode.ExactIn,
    amountIn: new BN(lamportsIn.toString()),
  });
  if (!q.amountLeft.isZero()) throw new Error("Amount exceeds remaining curve capacity.");
  const minOut = q.minimumAmountOut ?? new BN(0);
  if (minOut.isZero()) throw new Error("SDK quote returned zero minimum output; refused.");
  const sdkTx = await client.pool.swap2WithTransferHook({
    owner: wallet,
    pool,
    swapBaseForQuote: false,
    referralTokenAccount: null,
    swapMode: SwapMode.ExactIn,
    amountIn: new BN(lamportsIn.toString()),
    minimumAmountOut: minOut,
  });
  const tx = new Transaction().add(...sdkTx.instructions);
  const mint = new PublicKey(st.baseMint);
  const quote = {
    minimumAmountOut: minOut.toString(),
    outputAmount: q.outputAmount.toString(),
    tradingFee: q.tradingFee.toString(),
  };
  const b = await finalizeMulti(
    conn,
    wallet,
    tx,
    "dbc-swap",
    [
      `swap2WithTransferHook: buy with ${lamportsIn} lamports on ${pool.toBase58()}.`,
      `SDK swapQuote2 estimate ${quote.outputAmount} base units; minimum ${quote.minimumAmountOut} (slippage ${slippageBps} bps). Estimate, not verified fill.`,
      "Token-2022 runs the QLi hook on the vault → your account transfer; a paused policy would refuse it.",
    ],
    3_000_000,
    [],
    (t) => {
      verifyTxShape(t, {
        signers: [wallet.toBase58()],
        programs: allowedPrograms(hook.toBase58()),
        mustInvoke: [DBC_PROGRAM],
      });
      verifySwapHookAccounts(t, mint, hook);
    },
    { pool: pool.toBase58(), mint: mint.toBase58() },
  );
  return { ...b, quote };
}

/**
 * Step 9: SDK migrateToDammV2, built only when readiness passes. SDK 1.5.13 attaches no
 * transfer-hook extra accounts to migrationDammV2, so compatibility is decided by simulation:
 * the console refuses to sign unless simulation succeeds.
 */
export async function buildDbcMigration(
  conn: Connection,
  wallet: PublicKey,
  hook: PublicKey,
  pool: PublicKey,
): Promise<Built> {
  const st = await inspectDbcPool(conn, pool, hook);
  const r = migrationReadiness(st);
  if (!r.ready) throw new Error(`Migration not ready: ${r.reasons.join(" ")}`);
  if (!r.dammConfig) throw new Error("DAMM v2 config unavailable.");
  const client = new DynamicBondingCurveClient(conn, "confirmed");
  const res = await client.migration.migrateToDammV2({
    payer: wallet,
    pool,
    dammConfig: new PublicKey(r.dammConfig),
  });
  const tx = new Transaction().add(...res.transaction.instructions);
  const kps = [res.firstPositionNftKeypair, res.secondPositionNftKeypair];
  return finalizeMulti(
    conn,
    wallet,
    tx,
    "dbc-migrate",
    [
      `migrationDammV2 for ${pool.toBase58()} with DAMM v2 config ${r.dammConfig}.`,
      "Two one-time position NFT keys sign in memory and are discarded.",
      "SDK 1.5.13 passes no hook extra accounts here; only a successful simulation makes this sendable.",
    ],
    50_000_000,
    kps,
    (t) =>
      verifyTxShape(t, {
        signers: [wallet.toBase58(), ...kps.map((k) => k.publicKey.toBase58())],
        programs: allowedPrograms(hook.toBase58(), true),
        mustInvoke: [DBC_PROGRAM],
      }),
    { pool: pool.toBase58() },
  );
}

export async function simulateDbc(
  conn: Connection,
  b: Built,
  hook: PublicKey,
): Promise<SimVerdict> {
  await assertDevnet(conn);
  const r = await conn.simulateTransaction(
    new VersionedTransaction(b.transaction.compileMessage()),
    {
      sigVerify: false,
      replaceRecentBlockhash: false,
    },
  );
  return classifySimulation(r.value.err, r.value.logs ?? [], r.context.slot, hook.toBase58());
}
