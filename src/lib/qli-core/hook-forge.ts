// QLi Hook Forge pure core. Browser-safe: no RPC, no wallet, no SDK runtime import.
// Policies describe Meteora DBC native configuration (enforced by the DBC program) and
// Token-2022 TransferHook inspection (token transfer callbacks only, NOT swap callbacks).
// Nothing here builds, signs or sends a transaction. Fee math mirrors the pinned SDK and is
// parity-tested against it in src/test/hook-forge.test.ts.
import { z } from "zod";
import { domainHash } from "./neural/canonical";
import type { Snapshot } from "./lifecycle";

export const HOOK_FORGE_VERSION = "qli-hook-forge/v1" as const;
export const HOOK_FORGE_DOMAIN = "QuantumQLi.HookForge.Manifest.v1";
export const HOOK_FORGE_SDK_PIN = "@meteora-ag/dynamic-bonding-curve-sdk@1.5.13";

/** Constants copied from the pinned SDK; equality is asserted in tests. */
export const SDK_LIMITS = {
  FEE_DENOMINATOR: 1_000_000_000n,
  MAX_BASIS_POINT: 10_000n,
  MIN_FEE_BPS: 25,
  MAX_FEE_BPS: 9_900,
  U16_MAX: 65_535,
  MAX_CREATOR_FEE_PERCENT: 100,
  PROTOCOL_FEE_PERCENT: 20n,
} as const;

/** MigrationFeeOption names and fixed bps from the pinned SDK enum (Customizable excluded). */
export const MIGRATION_FEE_OPTIONS = {
  FixedBps25: 25,
  FixedBps30: 30,
  FixedBps100: 100,
  FixedBps200: 200,
  FixedBps400: 400,
  FixedBps600: 600,
} as const;
export type MigrationFeeOptionName = keyof typeof MIGRATION_FEE_OPTIONS;

/** How a rule is enforced. Never conflate these. */
export type Enforcement =
  | "meteora-enforced" // value lives in the DBC PoolConfig; the DBC program enforces it
  | "token2022-executed" // Token-2022 invokes a transfer-hook program on every token transfer
  | "operator-monitored" // QLi off-chain read-only check against verified snapshots
  | "advisory-only"; // not deployable; no on-chain effect

export const ENFORCEMENT_TEXT: Record<Enforcement, string> = {
  "meteora-enforced":
    "Written into the Meteora DBC config at creation and enforced by the DBC program. Immutable after config creation.",
  "token2022-executed":
    "Executed by the Token-2022 program calling a transfer-hook program on token transfers. This is a token transfer callback, not a swap callback.",
  "operator-monitored":
    "Evaluated off-chain by QLi against RPC-verified snapshots when you run it. No background scheduler, no on-chain effect.",
  "advisory-only": "Reference only. Not deployable and has no on-chain effect.",
};

const int = (min: number, max: number) => z.number().int().min(min).max(max);

export const policySchema = z
  .object({
    version: z.literal(HOOK_FORGE_VERSION),
    name: z.string().trim().min(1).max(60),
    activationType: z.enum(["slot", "timestamp"]),
    baseFee: z
      .object({
        mode: z.enum(["flat", "linear", "exponential"]),
        startingBps: int(0, 10_000),
        endingBps: int(0, 10_000),
        numberOfPeriod: int(0, 1_000_000),
        totalDuration: int(0, 1_000_000_000),
      })
      .strict(),
    dynamicFee: z.boolean(),
    collectFeeMode: z.enum(["quote", "output"]),
    creatorTradingFeePercent: int(0, 100),
    tokenType: z.enum(["spl", "token2022"]),
    totalTokenSupply: int(1, 1_000_000_000_000),
    initialMarketCap: z.number().finite().positive().max(1e12),
    migrationMarketCap: z.number().finite().positive().max(1e12),
    migrationFeeOption: z.enum(
      Object.keys(MIGRATION_FEE_OPTIONS) as [MigrationFeeOptionName, ...MigrationFeeOptionName[]],
    ),
    lockedVesting: z
      .object({
        totalLockedVestingAmount: int(0, 1_000_000_000_000),
        numberOfVestingPeriod: int(0, 1_000_000),
        cliffUnlockAmount: int(0, 1_000_000_000_000),
        totalVestingDuration: int(0, 1_000_000_000),
        cliffDurationFromMigrationTime: int(0, 1_000_000_000),
      })
      .strict(),
    advisory: z
      .object({
        transferConstraint: z.boolean(),
        customTransferHook: z.boolean(),
      })
      .strict(),
  })
  .strict();
export type HookPolicy = z.infer<typeof policySchema>;

export function defaultPolicy(name = "Native flat fee"): HookPolicy {
  return {
    version: HOOK_FORGE_VERSION,
    name,
    activationType: "timestamp",
    baseFee: {
      mode: "flat",
      startingBps: 100,
      endingBps: 100,
      numberOfPeriod: 0,
      totalDuration: 0,
    },
    dynamicFee: true,
    collectFeeMode: "quote",
    creatorTradingFeePercent: 50,
    tokenType: "spl",
    totalTokenSupply: 1_000_000_000,
    initialMarketCap: 30,
    migrationMarketCap: 540,
    migrationFeeOption: "FixedBps100",
    lockedVesting: {
      totalLockedVestingAmount: 0,
      numberOfVestingPeriod: 0,
      cliffUnlockAmount: 0,
      totalVestingDuration: 0,
      cliffDurationFromMigrationTime: 0,
    },
    advisory: { transferConstraint: false, customTransferHook: false },
  };
}

export type Template = {
  id: string;
  title: string;
  enforcement: Enforcement;
  summary: string;
  deployable: boolean;
  policy?: HookPolicy;
};

export const TEMPLATES: Template[] = [
  {
    id: "native-flat-fee",
    title: "Native flat fee",
    enforcement: "meteora-enforced",
    summary:
      "Constant base fee with dynamic fee on. Maps exactly to the current Launch Forge path.",
    deployable: true,
    policy: defaultPolicy(),
  },
  {
    id: "native-linear-schedule",
    title: "Linear anti-sniper fee schedule",
    enforcement: "meteora-enforced",
    summary: "Base fee falls linearly from 50% to 1% over 10 periods after activation.",
    deployable: true,
    policy: {
      ...defaultPolicy("Linear anti-sniper schedule"),
      baseFee: {
        mode: "linear",
        startingBps: 5_000,
        endingBps: 100,
        numberOfPeriod: 10,
        totalDuration: 600,
      },
    },
  },
  {
    id: "native-exponential-schedule",
    title: "Exponential fee decay",
    enforcement: "meteora-enforced",
    summary: "Base fee decays geometrically from 25% to 1% over 20 periods.",
    deployable: true,
    policy: {
      ...defaultPolicy("Exponential fee decay"),
      baseFee: {
        mode: "exponential",
        startingBps: 2_500,
        endingBps: 100,
        numberOfPeriod: 20,
        totalDuration: 1_200,
      },
    },
  },
  {
    id: "creator-fee-split",
    title: "Creator fee split",
    enforcement: "meteora-enforced",
    summary:
      "Creator share of the partner trading fee, set in the config. Claims stay manual and wallet-approved.",
    deployable: true,
    policy: { ...defaultPolicy("Creator fee split 80%"), creatorTradingFeePercent: 80 },
  },
  {
    id: "migration-sentinel",
    title: "Migration sentinel",
    enforcement: "operator-monitored",
    summary: "Watches curve progress and migration flags on verified snapshots. Dry-run only.",
    deployable: false,
  },
  {
    id: "transfer-hook-monitor",
    title: "Transfer-hook alert monitor",
    enforcement: "operator-monitored",
    summary:
      "Inspects a Token-2022 mint's TransferHook extension, program and authorities. Read-only.",
    deployable: false,
  },
  {
    id: "transfer-constraint",
    title: "Transfer constraint (reference)",
    enforcement: "advisory-only",
    summary:
      "A custom transfer-hook program restricting transfers. Disabled: no audited program, independent review or devnet evidence exists.",
    deployable: false,
  },
];

export type Severity = "error" | "warning" | "info";
export type Finding = { field: string; severity: Severity; message: string };

/** SDK-faithful validation. Errors block export as deployable; warnings need human review. */
export function validatePolicy(p: HookPolicy): Finding[] {
  const out: Finding[] = [];
  const e = (field: string, message: string) => out.push({ field, severity: "error", message });
  const w = (field: string, message: string) => out.push({ field, severity: "warning", message });
  const f = p.baseFee;
  if (f.mode === "flat") {
    if (f.startingBps !== f.endingBps)
      e("baseFee", "Flat mode requires starting and ending fee to be equal.");
    if (f.numberOfPeriod !== 0 || f.totalDuration !== 0)
      e("baseFee", "SDK rule: flat fee requires number of periods and total duration both zero.");
  } else {
    if (f.startingBps === f.endingBps)
      e("baseFee", "A schedule needs starting fee above ending fee; use flat mode.");
    if (f.endingBps > f.startingBps)
      e("baseFee", "Ending fee must be less than or equal to starting fee.");
    if (f.numberOfPeriod <= 0 || f.totalDuration <= 0)
      e(
        "baseFee",
        "SDK rule: number of periods and total duration must both be greater than zero.",
      );
    if (f.numberOfPeriod > SDK_LIMITS.U16_MAX)
      e("baseFee", "Number of periods exceeds u16 maximum (65535).");
    if (f.numberOfPeriod > 0 && f.totalDuration % f.numberOfPeriod !== 0)
      e(
        "baseFee",
        "Total duration must divide evenly by number of periods (integer period frequency).",
      );
  }
  if (f.startingBps > SDK_LIMITS.MAX_FEE_BPS)
    e("baseFee", `Starting fee exceeds SDK maximum ${SDK_LIMITS.MAX_FEE_BPS} bps.`);
  if (f.endingBps < SDK_LIMITS.MIN_FEE_BPS)
    e("baseFee", `Ending fee is below SDK minimum ${SDK_LIMITS.MIN_FEE_BPS} bps.`);
  if (f.startingBps >= 5_000)
    w(
      "baseFee",
      "Starting fee at or above 50% is punitive; confirm this is an intended anti-sniper window.",
    );
  if (p.initialMarketCap >= p.migrationMarketCap)
    e("migration", "Migration market cap must be greater than initial market cap.");
  const lv = p.lockedVesting;
  if (lv.totalLockedVestingAmount + lv.cliffUnlockAmount > p.totalTokenSupply)
    e("lockedVesting", "Locked vesting and cliff unlock exceed total supply.");
  if (lv.cliffUnlockAmount > lv.totalLockedVestingAmount && lv.totalLockedVestingAmount > 0)
    w("lockedVesting", "Cliff unlock exceeds the vesting amount; review intent.");
  if (
    lv.totalLockedVestingAmount > 0 &&
    (lv.numberOfVestingPeriod === 0 || lv.totalVestingDuration === 0)
  )
    e("lockedVesting", "Vesting needs at least one period and a non-zero duration.");
  if (p.tokenType === "token2022")
    w(
      "tokenType",
      "The SDK exposes Token-2022 pool paths, but Launch Forge only builds SPL launches. Export plan only.",
    );
  if (p.advisory.customTransferHook)
    e(
      "advisory",
      "Custom transfer-hook deployment is disabled: no audited program, independent review or devnet evidence.",
    );
  if (p.advisory.transferConstraint)
    w(
      "advisory",
      "Transfer constraints are reference-only and are not enforced by anything QLi deploys.",
    );
  if (!p.dynamicFee)
    w(
      "dynamicFee",
      "Launch Forge always enables dynamic fee; turning it off makes this plan export-only.",
    );
  return out;
}

export type ParamStatus = {
  field: string;
  enforcement: Enforcement;
  launchForge: "mapped" | "export-only" | "unsupported";
  note: string;
};

/** Per-parameter enforcement and whether the existing Launch Forge path applies it exactly. */
export function classifyParams(p: HookPolicy): ParamStatus[] {
  const flat = p.baseFee.mode === "flat";
  const vest =
    p.lockedVesting.totalLockedVestingAmount > 0 || p.lockedVesting.cliffUnlockAmount > 0;
  return [
    {
      field: "Base fee",
      enforcement: "meteora-enforced",
      launchForge: flat ? "mapped" : "export-only",
      note: flat
        ? "Flat fee maps to Launch Forge feeBps."
        : "Schedulers are SDK-supported but not wired into Launch Forge yet.",
    },
    {
      field: "Dynamic fee",
      enforcement: "meteora-enforced",
      launchForge: p.dynamicFee ? "mapped" : "export-only",
      note: "Launch Forge always enables dynamic fee.",
    },
    {
      field: "Creator fee share",
      enforcement: "meteora-enforced",
      launchForge: "mapped",
      note: "creatorTradingFeePercentage.",
    },
    {
      field: "Collect fee mode",
      enforcement: "meteora-enforced",
      launchForge: p.collectFeeMode === "quote" ? "mapped" : "export-only",
      note: "Launch Forge collects in quote token.",
    },
    {
      field: "Market cap milestones",
      enforcement: "meteora-enforced",
      launchForge: "mapped",
      note: "buildCurveWithMarketCap initial and migration market cap.",
    },
    {
      field: "Migration fee option",
      enforcement: "meteora-enforced",
      launchForge: p.migrationFeeOption === "FixedBps100" ? "mapped" : "export-only",
      note: "Launch Forge uses FixedBps100 with DAMM v2.",
    },
    {
      field: "Activation type",
      enforcement: "meteora-enforced",
      launchForge: p.activationType === "timestamp" ? "mapped" : "export-only",
      note: "Slot or timestamp scheduling of fee periods.",
    },
    {
      field: "Locked vesting",
      enforcement: "meteora-enforced",
      launchForge: vest ? "export-only" : "mapped",
      note: "SDK lockedVesting; Launch Forge supports none.",
    },
    {
      field: "Token program",
      enforcement: p.tokenType === "token2022" ? "token2022-executed" : "meteora-enforced",
      launchForge: p.tokenType === "spl" ? "mapped" : "export-only",
      note: "Token-2022 hooks run on transfers only.",
    },
    {
      field: "Transfer constraint",
      enforcement: "advisory-only",
      launchForge: p.advisory.transferConstraint ? "unsupported" : "mapped",
      note: p.advisory.transferConstraint
        ? "Requested but not enforceable: Launch Forge has no transfer restriction. Blocks launch mapping."
        : "None requested.",
    },
    {
      field: "Custom transfer hook",
      enforcement: "advisory-only",
      launchForge: p.advisory.customTransferHook ? "unsupported" : "mapped",
      note: p.advisory.customTransferHook
        ? "Deployment and execution disabled. Blocks launch mapping."
        : "None requested.",
    },
  ];
}

/**
 * True only when every value is one the existing Launch Forge builder (dbc-launch.ts curveConfig)
 * hard-codes or accepts exactly. Advisory, unsupported or non-enforced settings always make it false.
 * Even when true, values are re-entered and reviewed manually in Launch Forge; nothing is transferred.
 */
export function launchMappable(p: HookPolicy): boolean {
  if (p.advisory.transferConstraint || p.advisory.customTransferHook) return false;
  if (validatePolicy(p).some((f) => f.severity === "error")) return false;
  return classifyParams(p).every((c) => c.launchForge === "mapped");
}

// ---------- SDK-faithful fee math (BigInt) ----------

export const bpsToNumerator = (bps: number) =>
  (BigInt(bps) * SDK_LIMITS.FEE_DENOMINATOR) / SDK_LIMITS.MAX_BASIS_POINT;
export const numeratorToBpsText = (n: bigint) => {
  const tenths = (n * 100_000n) / SDK_LIMITS.FEE_DENOMINATOR; // bps * 10
  return `${tenths / 10n}.${tenths % 10n}`;
};

const ONE_Q64 = 1n << 64n;
function powQ64(base: bigint, exp: number): bigint {
  let result = ONE_Q64;
  let b = base;
  let e = BigInt(exp);
  while (e > 0n) {
    if (e & 1n) result = (result * b) / ONE_Q64;
    b = (b * b) / ONE_Q64;
    e >>= 1n;
  }
  return result;
}

export type FeeScheduleParams = {
  cliffFeeNumerator: bigint;
  numberOfPeriod: number;
  periodFrequency: bigint;
  reductionFactor: bigint;
  mode: "linear" | "exponential" | "flat";
};

/** Mirrors SDK getFeeSchedulerParams. Exponential reduction uses float pow then floor (SDK uses Decimal). */
export function scheduleParams(p: HookPolicy): FeeScheduleParams {
  const f = p.baseFee;
  const max = bpsToNumerator(f.startingBps);
  if (f.mode === "flat" || f.startingBps === f.endingBps)
    return {
      cliffFeeNumerator: max,
      numberOfPeriod: 0,
      periodFrequency: 0n,
      reductionFactor: 0n,
      mode: "flat",
    };
  const min = bpsToNumerator(f.endingBps);
  const periodFrequency = BigInt(Math.floor(f.totalDuration / f.numberOfPeriod));
  let reductionFactor: bigint;
  if (f.mode === "linear") reductionFactor = (max - min) / BigInt(f.numberOfPeriod);
  else {
    const decay = Math.pow(Number(min) / Number(max), 1 / f.numberOfPeriod);
    reductionFactor = BigInt(Math.floor(10_000 * (1 - decay)));
  }
  return {
    cliffFeeNumerator: max,
    numberOfPeriod: f.numberOfPeriod,
    periodFrequency,
    reductionFactor,
    mode: f.mode,
  };
}

/** Mirrors SDK getBaseFeeNumeratorByPeriod. */
export function feeNumeratorAtPeriod(s: FeeScheduleParams, period: number): bigint {
  if (s.mode === "flat") return s.cliffFeeNumerator;
  const n = Math.min(Math.max(0, Math.floor(period)), s.numberOfPeriod);
  if (s.mode === "linear") {
    const v = s.cliffFeeNumerator - BigInt(n) * s.reductionFactor;
    if (v < 0n) throw new Error("Math overflow");
    return v;
  }
  if (n === 0) return s.cliffFeeNumerator;
  const bps = (s.reductionFactor << 64n) / SDK_LIMITS.MAX_BASIS_POINT;
  return (s.cliffFeeNumerator * powQ64(ONE_Q64 - bps, n)) / ONE_Q64;
}

/** Mirrors SDK getFeeOnAmount (no referral): fee rounded up, protocol share 20% rounded down. */
export function feeOnAmount(numerator: bigint, amount: bigint) {
  if (amount < 0n) throw new Error("Amount must be non-negative.");
  if (amount > 2n ** 64n - 1n) throw new Error("Amount exceeds u64.");
  const total =
    amount === 0n
      ? 0n
      : (amount * numerator + SDK_LIMITS.FEE_DENOMINATOR - 1n) / SDK_LIMITS.FEE_DENOMINATOR;
  const protocol = (total * SDK_LIMITS.PROTOCOL_FEE_PERCENT) / 100n;
  const tradingAfterProtocol = total - protocol;
  return {
    totalFee: total,
    protocolFee: protocol,
    tradingFee: tradingAfterProtocol,
    amountAfterFee: amount - total,
  };
}

export type SchedulePoint = { period: number; atPoint: string; numerator: string; bps: string };
export function feeSchedule(p: HookPolicy, maxPoints = 24): SchedulePoint[] {
  const s = scheduleParams(p);
  const periods = s.mode === "flat" ? 1 : s.numberOfPeriod;
  const step = Math.max(1, Math.ceil((periods + 1) / maxPoints));
  const out: SchedulePoint[] = [];
  for (let i = 0; i <= periods; i += step) {
    const n = feeNumeratorAtPeriod(s, i);
    out.push({
      period: i,
      atPoint: (BigInt(i) * s.periodFrequency).toString(),
      numerator: n.toString(),
      bps: numeratorToBpsText(n),
    });
  }
  if (out[out.length - 1]?.period !== periods && s.mode !== "flat") {
    const n = feeNumeratorAtPeriod(s, periods);
    out.push({
      period: periods,
      atPoint: (BigInt(periods) * s.periodFrequency).toString(),
      numerator: n.toString(),
      bps: numeratorToBpsText(n),
    });
  }
  return out;
}

export type ScenarioRow = {
  policy: string;
  period: number;
  feeBps: string;
  totalFee: string;
  protocolFee: string;
  tradingFee: string;
  creatorShare: string;
  partnerShare: string;
  amountAfterFee: string;
};

/** Deterministic, labelled hypothesis: base fee only (dynamic fee excluded) on an input amount in atomic units. */
export function compareScenarios(
  policies: HookPolicy[],
  amountAtomic: bigint,
  periods: number[],
): ScenarioRow[] {
  const rows: ScenarioRow[] = [];
  for (const p of policies) {
    const s = scheduleParams(p);
    for (const period of periods) {
      const n = feeNumeratorAtPeriod(s, period);
      const r = feeOnAmount(n, amountAtomic);
      const creator = (r.tradingFee * BigInt(p.creatorTradingFeePercent)) / 100n;
      rows.push({
        policy: p.name,
        period,
        feeBps: numeratorToBpsText(n),
        totalFee: r.totalFee.toString(),
        protocolFee: r.protocolFee.toString(),
        tradingFee: r.tradingFee.toString(),
        creatorShare: creator.toString(),
        partnerShare: (r.tradingFee - creator).toString(),
        amountAfterFee: r.amountAfterFee.toString(),
      });
    }
  }
  return rows;
}

export function parseAtomic(s: string): bigint | null {
  if (!/^[0-9]{1,20}$/.test(s.trim())) return null;
  const v = BigInt(s.trim());
  return v > 2n ** 64n - 1n ? null : v;
}

// ---------- Review summary, advisor and manifest ----------

export function reviewSummary(p: HookPolicy): string[] {
  const f = p.baseFee;
  const fee =
    f.mode === "flat"
      ? `Flat base fee ${f.startingBps} bps`
      : `${f.mode} base fee ${f.startingBps} to ${f.endingBps} bps over ${f.numberOfPeriod} periods of ${f.totalDuration / Math.max(1, f.numberOfPeriod)} ${p.activationType === "slot" ? "slots" : "seconds"}`;
  return [
    fee,
    `Dynamic fee ${p.dynamicFee ? "enabled (SDK defaults)" : "disabled"}`,
    `Creator receives ${p.creatorTradingFeePercent}% of the partner trading fee; collected in ${p.collectFeeMode} token`,
    `Curve from ${p.initialMarketCap} to ${p.migrationMarketCap} quote-unit market cap, then DAMM v2 migration (${p.migrationFeeOption})`,
    `Token program: ${p.tokenType === "spl" ? "SPL Token" : "Token-2022"}`,
    `Locked vesting: ${p.lockedVesting.totalLockedVestingAmount} tokens`,
    "Reversibility: DBC config values are fixed at config creation; changes need a new config and pool.",
  ];
}

export type Advice = { id: string; title: string; detail: string; humanReview: string };
export function advise(p: HookPolicy): Advice[] {
  const a: Advice[] = [];
  if (p.baseFee.mode !== "flat")
    a.push({
      id: "schedule",
      title: "Fee schedule window",
      detail: "Early buyers pay the starting fee until periods elapse from activation.",
      humanReview: "Confirm the activation point and that early-window fees are disclosed.",
    });
  if (p.creatorTradingFeePercent > 0)
    a.push({
      id: "creator",
      title: "Creator fee claims are manual",
      detail:
        "Accrued creator fees require a wallet-approved claim. QLi never claims, buys back or burns automatically.",
      humanReview: "Record who controls the creator wallet.",
    });
  if (p.tokenType === "token2022")
    a.push({
      id: "t22",
      title: "Token-2022 extension review",
      detail:
        "Transfer hooks, transfer fees and permanent delegates can block or tax transfers, including migration.",
      humanReview: "Inspect the mint in Hook Inspector before any launch.",
    });
  if (p.advisory.customTransferHook || p.advisory.transferConstraint)
    a.push({
      id: "custom",
      title: "Custom hook gated",
      detail: "No audited custom transfer-hook program exists in QLi.",
      humanReview: "Independent security review and positive devnet evidence required first.",
    });
  a.push({
    id: "migration",
    title: "Migration readiness",
    detail:
      "Migration to DAMM v2 compatibility with any Token-2022 extension is not verified by QLi.",
    humanReview: "Validate migration on devnet with the exact mint before mainnet.",
  });
  return a;
}

export type Manifest = {
  version: typeof HOOK_FORGE_VERSION;
  kind: "qli-hook-forge-manifest";
  sdk: typeof HOOK_FORGE_SDK_PIN;
  createdAt: string;
  integrity: "sha256 integrity checksum, not a signature or on-chain proof";
  policies: HookPolicy[];
  classification: { name: string; deployableViaLaunchForge: boolean; findings: Finding[] }[];
  digest: string;
};

export async function buildManifest(
  policies: HookPolicy[],
  createdAt = new Date().toISOString(),
): Promise<Manifest> {
  const body = {
    version: HOOK_FORGE_VERSION,
    kind: "qli-hook-forge-manifest" as const,
    sdk: HOOK_FORGE_SDK_PIN as typeof HOOK_FORGE_SDK_PIN,
    createdAt,
    integrity: "sha256 integrity checksum, not a signature or on-chain proof" as const,
    policies,
    classification: policies.map((p) => ({
      name: p.name,
      deployableViaLaunchForge: launchMappable(p),
      findings: validatePolicy(p),
    })),
  };
  return { ...body, digest: await domainHash(HOOK_FORGE_DOMAIN, body) };
}

const SECRETISH = /(private[_ ]?key|seed|mnemonic|secret|api[_-]?key|bearer\s)/i;

export async function importManifest(
  text: string,
): Promise<{ ok: true; manifest: Manifest } | { ok: false; error: string }> {
  if (text.length > 200_000) return { ok: false, error: "Manifest too large." };
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: "Not valid JSON." };
  }
  if (SECRETISH.test(text))
    return { ok: false, error: "Manifest contains secret-like fields. Refused." };
  const m = raw as Partial<Manifest>;
  if (m.version !== HOOK_FORGE_VERSION || m.kind !== "qli-hook-forge-manifest")
    return { ok: false, error: "Unsupported manifest version or kind." };
  if (!Array.isArray(m.policies) || m.policies.length < 1 || m.policies.length > 8)
    return { ok: false, error: "Manifest must contain 1 to 8 policies." };
  const parsed = z.array(policySchema).safeParse(m.policies);
  if (!parsed.success) return { ok: false, error: "A policy failed schema validation." };
  const rebuilt = await buildManifest(parsed.data, String(m.createdAt ?? ""));
  if (rebuilt.digest !== m.digest)
    return { ok: false, error: "Digest mismatch: manifest was altered or is not canonical." };
  return { ok: true, manifest: rebuilt };
}

// ---------- Monitor rule proposals (dry run against verified snapshots) ----------

export const ruleSchema = z
  .object({
    id: z.string().min(1).max(40),
    kind: z.enum(["quote-fee-threshold", "curve-progress", "migration-flag"]),
    threshold: z.string().regex(/^[0-9]{1,20}$/),
  })
  .strict();
export type MonitorRule = z.infer<typeof ruleSchema>;

export type RuleEval = {
  rule: MonitorRule;
  status: "triggered" | "not-triggered" | "no-evidence";
  observed: string | null;
  source: string;
};

export function evaluateRules(rules: MonitorRule[], snap: Snapshot | null): RuleEval[] {
  return rules.map((rule) => {
    if (!snap)
      return { rule, status: "no-evidence", observed: null, source: "No verified snapshot loaded" };
    const source = `${snap.network} slot ${snap.observedSlot} via server-trusted RPC (genesis verified)`;
    const t = BigInt(rule.threshold);
    if (rule.kind === "quote-fee-threshold") {
      const v = BigInt(snap.facts.totalTradingQuoteFee || "0");
      return {
        rule,
        status: v >= t ? "triggered" : "not-triggered",
        observed: v.toString(),
        source,
      };
    }
    if (rule.kind === "curve-progress") {
      const v = BigInt(Math.round(snap.facts.migrationProgress));
      return {
        rule,
        status: v >= t ? "triggered" : "not-triggered",
        observed: v.toString(),
        source,
      };
    }
    const v = BigInt(snap.facts.isMigrated);
    return { rule, status: v >= t ? "triggered" : "not-triggered", observed: v.toString(), source };
  });
}

// ---------- Token-2022 inspection result (produced server-side) ----------

export type InspectCode =
  | "ok"
  | "invalid-input"
  | "rate-limited"
  | "rpc-unavailable"
  | "wrong-network"
  | "not-found"
  | "not-a-mint"
  | "spl-token-mint"
  | "pool-unresolved";

export type Permission = {
  label: string;
  value: string | null;
  status: "observed" | "none" | "unknown";
  source: string;
};

export type HookInspection = {
  ok: boolean;
  code: InspectCode;
  message: string;
  network: "mainnet-beta" | "devnet";
  mint: string | null;
  observedSlot: number | null;
  tokenProgram: "spl-token" | "token-2022" | null;
  extensions: string[];
  transferHook: {
    present: boolean;
    programId: string | null;
    authority: string | null;
    disabled: boolean;
    programExecutable: boolean | null;
    programExists?: boolean | null;
    readFailed?: boolean;
    programLoader: string | null;
    upgradeAuthority: string | null;
    upgradeable: boolean | null;
    extraMetaPda: string | null;
    extraMetaExists: boolean | null;
  } | null;
  permissions: Permission[];
  risks: { level: "high" | "medium" | "info"; text: string }[];
  compatibility: {
    dbcSdkPath: string;
    launchForge: string;
    dammV2Migration: string;
    verdict: "not-verified" | "not-applicable" | "blocked";
  };
};

export const MESSAGE: Record<InspectCode, string> = {
  ok: "Mint decoded from server-trusted RPC.",
  "invalid-input": "Invalid network or address. Nothing was looked up.",
  "rate-limited": "Lookup rate limit reached. Try again in a minute.",
  "rpc-unavailable": "Solana RPC unavailable or timed out. Nothing was verified.",
  "wrong-network": "RPC genesis hash does not match the selected network. Refused.",
  "not-found": "No account exists at this address on the selected network.",
  "not-a-mint": "This account is not owned by SPL Token or Token-2022, or is not a mint.",
  "spl-token-mint": "Ordinary SPL Token mint: no Token-2022 extensions and no transfer hook.",
  "pool-unresolved": "Could not resolve a base mint from this address as a verified DBC pool.",
};

/** Risk derivation from observed facts only. */
export function deriveRisks(
  i: Pick<HookInspection, "transferHook" | "extensions" | "permissions">,
) {
  const r: { level: "high" | "medium" | "info"; text: string }[] = [];
  const h = i.transferHook;
  if (h?.present && h.programId) {
    r.push({
      level: "high",
      text: "Every token transfer invokes an external hook program; it can reject transfers, including swaps and migration.",
    });
    if (h.upgradeable)
      r.push({
        level: "high",
        text: "Hook program is upgradeable: its behaviour can change after inspection.",
      });
    if (h.readFailed)
      r.push({
        level: "high",
        text: "Hook program could not be read (RPC failure); its state is unknown.",
      });
    if (h.programExists === false)
      r.push({ level: "high", text: "Hook program account does not exist: transfers will fail." });
    else if (h.programExecutable === false)
      r.push({
        level: "high",
        text: "Hook program account is not executable: transfers will fail.",
      });
    if (h.extraMetaExists === false)
      r.push({
        level: "medium",
        text: "Extra-account-meta-list PDA not found; transfers needing extra accounts may fail.",
      });
    if (h.authority)
      r.push({ level: "medium", text: "A hook authority can change or remove the hook program." });
  }
  if (i.extensions.includes("TransferFeeConfig"))
    r.push({ level: "medium", text: "Transfer fee extension withholds part of each transfer." });
  if (i.extensions.includes("PermanentDelegate"))
    r.push({
      level: "high",
      text: "Permanent delegate can transfer or burn any holder's tokens (implicit treasury control).",
    });
  if (i.extensions.includes("DefaultAccountState"))
    r.push({ level: "medium", text: "Default account state may freeze new token accounts." });
  if (i.extensions.includes("NonTransferable"))
    r.push({ level: "high", text: "Non-transferable mint cannot trade." });
  for (const p of i.permissions)
    if (p.status === "observed" && /freeze/i.test(p.label))
      r.push({ level: "medium", text: "Freeze authority can freeze holder accounts." });
  if (r.length === 0)
    r.push({
      level: "info",
      text: "No transfer-blocking extension observed. This is not an audit.",
    });
  return r;
}