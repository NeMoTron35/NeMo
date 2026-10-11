// Meteora Lifecycle Intelligence v2 — browser-safe core: schemas, evidence classes,
// lifecycle derivation, deterministic explanations and canonical snapshot hashing.
// Nothing here reads RPC, builds transactions or signs.
import { z } from "zod";
import {
  DBC_PROGRAM,
  isAddress,
  isSignature,
  networkSchema,
  type ProofNetwork,
} from "./launch-proof";

export const LIFECYCLE_VERSION = "2";
export const SNAPSHOT_DOMAIN = "qli.meteora-lifecycle/v2/snapshot";
export const SDK_PIN = "@meteora-ag/dynamic-bonding-curve-sdk@1.5.13";
export const TIMELINE_LIMITS = { default: 20, max: 25 } as const;
export const QUOTE_LIMITS = { maxSlippageBps: 5_000, maxAmount: 2n ** 64n - 1n } as const;
/** A quote is reported stale when the server clock point is older than this. */
export const QUOTE_MAX_AGE_MS = 60_000;

export type EvidenceClass = "on-chain" | "derived" | "estimate" | "unknown";
export type LifecycleNetwork = ProofNetwork;
export { DBC_PROGRAM, isAddress, isSignature, networkSchema };

export const amountSchema = z
  .string()
  .regex(/^[0-9]{1,20}$/, "Amount must be a positive integer in atomic units.")
  .refine((s) => {
    const n = BigInt(s);
    return n > 0n && n <= QUOTE_LIMITS.maxAmount;
  }, "Amount must be between 1 and u64 max atomic units.");

export const lookupSchema = z
  .object({
    network: networkSchema,
    pool: z.string().max(44).refine(isAddress, "Not a valid Solana address."),
  })
  .strict();

export const quoteSchema = lookupSchema
  .extend({
    direction: z.enum(["buy", "sell"]),
    amountIn: amountSchema,
    slippageBps: z.number().int().min(0).max(QUOTE_LIMITS.maxSlippageBps),
  })
  .strict();

export const timelineSchema = lookupSchema
  .extend({
    limit: z.number().int().min(1).max(TIMELINE_LIMITS.max).default(TIMELINE_LIMITS.default),
    before: z.string().max(90).refine(isSignature).optional(),
  })
  .strict();

export type PoolFacts = {
  config: string;
  creator: string;
  baseMint: string;
  baseVault: string;
  quoteVault: string;
  baseReserve: string;
  quoteReserve: string;
  sqrtPrice: string;
  activationPoint: string;
  isMigrated: number;
  migrationProgress: number;
  finishCurveTimestamp: string;
  hasSwap: boolean;
  protocolBaseFee: string;
  protocolQuoteFee: string;
  partnerBaseFee: string;
  partnerQuoteFee: string;
  creatorBaseFee: string;
  creatorQuoteFee: string;
  totalTradingBaseFee: string;
  totalTradingQuoteFee: string;
};
export type ConfigFacts = {
  quoteMint: string;
  feeClaimer: string;
  migrationOption: number;
  activationType: number;
  tokenDecimal: number;
  migrationQuoteThreshold: string;
  creatorTradingFeePercentage: number;
  collectFeeMode: number;
};

export type Condition = {
  name: string;
  met: boolean | null;
  evidence: EvidenceClass;
  detail: string;
};
export type Stage =
  "pre-activation" | "trading" | "curve-complete-awaiting-migration" | "migrated" | "unknown";

export const MIGRATION_PROGRESS_LABEL: Record<number, string> = {
  0: "PreBondingCurve",
  1: "PostBondingCurve",
  2: "LockedVesting",
  3: "CreatedPool",
};
export const MIGRATION_OPTION_LABEL: Record<number, string> = { 0: "DAMM v1", 1: "DAMM v2" };

/** Lifecycle stage from on-chain fields only. "Awaiting migration" requires every condition met. */
export function deriveStage(
  p: Pick<PoolFacts, "quoteReserve" | "activationPoint" | "isMigrated" | "migrationProgress">,
  c: Pick<ConfigFacts, "migrationQuoteThreshold">,
  currentPoint: string | null,
): { stage: Stage; conditions: Condition[] } {
  const threshold = BigInt(c.migrationQuoteThreshold);
  const reserve = BigInt(p.quoteReserve);
  const reached = threshold > 0n && reserve >= threshold;
  const active = currentPoint === null ? null : BigInt(currentPoint) >= BigInt(p.activationPoint);
  const conditions: Condition[] = [
    {
      name: "Activation point passed",
      met: active,
      evidence: active === null ? "unknown" : "derived",
      detail:
        active === null
          ? "Current slot/time could not be read."
          : `current ${currentPoint} vs activation ${p.activationPoint}`,
    },
    {
      name: "Quote reserve reached migration threshold",
      met: threshold > 0n ? reached : null,
      evidence: threshold > 0n ? "on-chain" : "unknown",
      detail: `quote reserve ${p.quoteReserve} / threshold ${c.migrationQuoteThreshold} (atomic)`,
    },
    {
      name: "Program marks curve complete",
      met: p.migrationProgress >= 1,
      evidence: "on-chain",
      detail: `migration_progress = ${p.migrationProgress} (${MIGRATION_PROGRESS_LABEL[p.migrationProgress] ?? "unrecognised"})`,
    },
    {
      name: "Pool already migrated",
      met: p.isMigrated !== 0,
      evidence: "on-chain",
      detail: `is_migrated = ${p.isMigrated}`,
    },
  ];
  let stage: Stage;
  if (p.isMigrated !== 0) stage = "migrated";
  else if (reached && p.migrationProgress >= 1) stage = "curve-complete-awaiting-migration";
  else if (active === false) stage = "pre-activation";
  else if (active === true && !reached) stage = "trading";
  else stage = "unknown";
  return { stage, conditions };
}

export const STAGE_LABEL: Record<Stage, string> = {
  "pre-activation": "Pre-activation — trading not open yet",
  trading: "Bonding curve trading",
  "curve-complete-awaiting-migration": "Curve complete — awaiting migration instruction",
  migrated: "Migrated — bonding curve closed",
  unknown: "Unknown — on-chain conditions are inconsistent or incomplete",
};

/** Progress in parts per million, mirroring the SDK getPoolQuoteTokenCurveProgress clamp [0,1]. */
export function progressPpm(quoteReserve: string, threshold: string): number | null {
  const t = BigInt(threshold);
  if (t <= 0n) return null;
  const r = (BigInt(quoteReserve) * 1_000_000n) / t;
  return Number(r > 1_000_000n ? 1_000_000n : r);
}

export type FeeIntel = {
  unit: "atomic";
  unclaimed: {
    creatorBase: string;
    creatorQuote: string;
    partnerBase: string;
    partnerQuote: string;
    protocolBase: string;
    protocolQuote: string;
  };
  lifetimeTrading: { base: string; quote: string };
  creatorTradingFeePercentage: number;
  /** Derived with the SDK getPoolFeeBreakdown formula; null when the subtraction would underflow. */
  breakdown: {
    creator: {
      totalBase: string;
      totalQuote: string;
      claimedBase: string | null;
      claimedQuote: string | null;
    };
    partner: {
      totalBase: string;
      totalQuote: string;
      claimedBase: string | null;
      claimedQuote: string | null;
    };
  };
  notes: string[];
};

/** Same arithmetic as StateService.getPoolFeeBreakdown in SDK 1.5.13, from one snapshot. */
export function feeIntel(p: PoolFacts, c: ConfigFacts): FeeIntel {
  const tb = BigInt(p.totalTradingBaseFee);
  const tq = BigInt(p.totalTradingQuoteFee);
  const pct = BigInt(c.creatorTradingFeePercentage);
  const cb = pct > 0n ? (tb * pct) / 100n : 0n;
  const cq = pct > 0n ? (tq * pct) / 100n : 0n;
  const pb = tb - cb;
  const pq = tq - cq;
  const sub = (a: bigint, b: string) => (a - BigInt(b) >= 0n ? (a - BigInt(b)).toString() : null);
  const notes = [
    "Unclaimed values are read from the pool account. Claimed values are derived as total minus unclaimed and are not independently observed claim events.",
  ];
  const breakdown = {
    creator: {
      totalBase: cb.toString(),
      totalQuote: cq.toString(),
      claimedBase: sub(cb, p.creatorBaseFee),
      claimedQuote: sub(cq, p.creatorQuoteFee),
    },
    partner: {
      totalBase: pb.toString(),
      totalQuote: pq.toString(),
      claimedBase: sub(pb, p.partnerBaseFee),
      claimedQuote: sub(pq, p.partnerQuoteFee),
    },
  };
  if (
    [breakdown.creator, breakdown.partner].some(
      (x) => x.claimedBase === null || x.claimedQuote === null,
    )
  )
    notes.push(
      "A derived claimed value would be negative; it is reported as null rather than guessed.",
    );
  return {
    unit: "atomic",
    unclaimed: {
      creatorBase: p.creatorBaseFee,
      creatorQuote: p.creatorQuoteFee,
      partnerBase: p.partnerBaseFee,
      partnerQuote: p.partnerQuoteFee,
      protocolBase: p.protocolBaseFee,
      protocolQuote: p.protocolQuoteFee,
    },
    lifetimeTrading: { base: p.totalTradingBaseFee, quote: p.totalTradingQuoteFee },
    creatorTradingFeePercentage: c.creatorTradingFeePercentage,
    breakdown,
    notes,
  };
}

export type QuoteOk = {
  ok: true;
  evidence: "estimate";
  direction: "buy" | "sell";
  amountIn: string;
  slippageBps: number;
  outputAmount: string;
  minimumAmountOut: string;
  includedFeeInputAmount: string;
  excludedFeeInputAmount: string;
  amountLeft: string;
  tradingFee: string;
  protocolFee: string;
  referralFee: string;
  /** Pool price movement (nextSqrtPrice^2 / sqrtPrice^2 - 1) in parts per million. */
  poolPriceMovePpm: number | null;
  currentPoint: string;
  observedSlot: number;
  caveats: string[];
};
export type QuoteFail = {
  ok: false;
  code:
    | "migrated"
    | "curve-complete"
    | "not-activated"
    | "unsupported"
    | "partial-fill"
    | "sdk-error"
    | "stale";
  message: string;
};
export type QuoteResult = QuoteOk | QuoteFail;

export function priceMovePpm(sqrtBefore: string, sqrtAfter: string): number | null {
  const a = BigInt(sqrtBefore);
  const b = BigInt(sqrtAfter);
  if (a === 0n) return null;
  const ppm = ((b * b - a * a) * 1_000_000n) / (a * a);
  return Number(ppm);
}

export type TimelineEvent = {
  index: number;
  name: string;
  evidence: "on-chain";
  fields: Record<string, string>;
};
export type TimelineEntry = {
  signature: string;
  slot: number;
  blockTime: number | null;
  confirmation: string | null;
  failed: boolean;
  instructions: string[];
  events: TimelineEvent[];
};
export type Timeline = {
  entries: TimelineEntry[];
  coverage: {
    requested: number;
    returned: number;
    indexed: number;
    notIndexed: number;
    nextBefore: string | null;
    reachedCreation: boolean;
    note: string;
  };
  creationSignature: string | null;
};

export const TRACKED_EVENTS = [
  "evtInitializePool",
  "evtInitializePoolWithTransferHook",
  "evtSwap",
  "evtSwap2",
  "evtSwap2WithTransferHook",
  "evtCurveComplete",
  "evtCurveCompleteWithTransferHook",
  "evtClaimCreatorTradingFee",
  "evtClaimTradingFee",
  "evtWithdrawMigrationFee",
  "evtCreateMeteoraMigrationMetadata",
] as const;
export const EVENT_LABEL: Record<string, string> = {
  evtInitializePool: "Pool initialized",
  evtInitializePoolWithTransferHook: "Pool initialized (transfer hook)",
  evtSwap: "Swap",
  evtSwap2: "Swap",
  evtSwap2WithTransferHook: "Swap (transfer hook)",
  evtCurveComplete: "Curve complete",
  evtCurveCompleteWithTransferHook: "Curve complete (transfer hook)",
  evtClaimCreatorTradingFee: "Creator fee claim",
  evtClaimTradingFee: "Partner fee claim",
  evtWithdrawMigrationFee: "Migration fee withdrawal",
  evtCreateMeteoraMigrationMetadata: "Migration metadata created",
};
/** Migration emits no dedicated DBC event in the 1.5.13 IDL; the instruction name is the evidence. */
export const MIGRATION_INSTRUCTIONS = ["migrationDammV2", "migrateMeteoraDamm"];

export type Snapshot = {
  version: typeof LIFECYCLE_VERSION;
  network: LifecycleNetwork;
  pool: string;
  programId: string;
  sdk: string;
  genesisVerified: true;
  observedSlot: number;
  configSlot: number;
  observedAt: string;
  currentPoint: { kind: "slot" | "timestamp"; value: string } | null;
  facts: PoolFacts;
  config: ConfigFacts;
  quoteDecimals: number | null;
  progressPpm: number | null;
  stage: Stage;
  conditions: Condition[];
  fees: FeeIntel;
  provenance: { rpc: string; evidence: Record<string, EvidenceClass> };
};

export type IntelFailCode =
  | "invalid-input"
  | "rate-limited"
  | "rpc-unavailable"
  | "wrong-network"
  | "not-found"
  | "not-dbc-pool"
  | "transfer-hook-pool"
  | "decode-failed"
  | "config-mismatch";
export type IntelResult =
  | { ok: true; snapshot: Snapshot; digest: string }
  | { ok: false; code: IntelFailCode; message: string };

export const INTEL_FAIL_TEXT: Record<IntelFailCode, string> = {
  "invalid-input": "Invalid network or pool address. Nothing was looked up.",
  "rate-limited": "RPC or lookup rate limit reached. Nothing was verified; try again shortly.",
  "rpc-unavailable": "Solana RPC unavailable or timed out. Nothing was verified.",
  "wrong-network": "RPC genesis hash does not match the selected network. Refused.",
  "not-found": "No account exists at this address on the selected network.",
  "not-dbc-pool": "This account is not owned by the Meteora DBC program or is not a VirtualPool.",
  "transfer-hook-pool":
    "This is a DBC TransferHookPool (Token-2022 transfer-hook base mint). Lifecycle Intelligence v2 supports VirtualPool only; use Hook Proofs for transfer-hook pools.",
  "decode-failed": "The account could not be decoded with the pinned SDK layout.",
  "config-mismatch": "The pool's config account is missing or not a DBC PoolConfig.",
};

function canonical(v: unknown): string {
  if (v === null || typeof v !== "object") return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(canonical).join(",")}]`;
  const o = v as Record<string, unknown>;
  return `{${Object.keys(o)
    .sort()
    .filter((k) => o[k] !== undefined)
    .map((k) => `${JSON.stringify(k)}:${canonical(o[k])}`)
    .join(",")}}`;
}
/** Domain-separated SHA-256 over canonical JSON. Tamper-evident only; not a signature. */
export async function snapshotDigest(s: Snapshot): Promise<string> {
  const bytes = new TextEncoder().encode(`${SNAPSHOT_DOMAIN}\n${canonical(s)}`);
  const d = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Deterministic, evidence-referenced explanation lines. No model is involved. */
export function explain(s: Snapshot, t?: Timeline | null): string[] {
  const out: string[] = [];
  const ppm = s.progressPpm;
  out.push(
    `${STAGE_LABEL[s.stage]}, observed at slot ${s.observedSlot} on ${s.network} (on-chain account state).`,
  );
  if (ppm !== null)
    out.push(
      `Quote reserve is ${(ppm / 10_000).toFixed(2)}% of the migration threshold (derived from reserve ${s.facts.quoteReserve} and threshold ${s.config.migrationQuoteThreshold}).`,
    );
  if (s.stage === "trading")
    out.push(
      "The curve is open; reaching the threshold requires further buys. No forecast is made about whether or when that happens.",
    );
  if (s.stage === "curve-complete-awaiting-migration")
    out.push(
      `The curve is complete; migration to ${MIGRATION_OPTION_LABEL[s.config.migrationOption] ?? "an unrecognised target"} still requires a separate migration instruction.`,
    );
  if (s.stage === "migrated")
    out.push("The pool is marked migrated; curve quotes no longer apply.");
  out.push(
    `Creator receives ${s.config.creatorTradingFeePercentage}% of trading fees per config; unclaimed creator quote fees are ${s.fees.unclaimed.creatorQuote} atomic units.`,
  );
  if (t) {
    const swaps = t.entries
      .flatMap((e) => e.events)
      .filter((e) => e.name.startsWith("evtSwap")).length;
    out.push(
      `${swaps} swap event(s) were decoded across the ${t.coverage.indexed} most recent indexed transaction(s); older history is ${t.coverage.reachedCreation ? "covered back to pool creation in this window" : "not indexed"}.`,
    );
  }
  return out;
}

export function intelPath(network: LifecycleNetwork, pool: string) {
  return { to: "/meteora-intelligence" as const, search: { network, pool } };
}

/** Anchor account discriminators from the pinned SDK 1.5.13 IDL. */
export const DBC_DISCRIMINATORS = {
  virtualPool: [213, 224, 5, 209, 98, 69, 119, 92],
  transferHookPool: [237, 219, 184, 23, 42, 189, 169, 35],
  poolConfig: [26, 108, 14, 123, 116, 230, 129, 43],
  configWithTransferHook: [40, 220, 194, 251, 41, 199, 123, 253],
} as const;
export function dbcAccountKind(data: Uint8Array): keyof typeof DBC_DISCRIMINATORS | null {
  for (const [k, d] of Object.entries(DBC_DISCRIMINATORS))
    if (data.length >= 8 && d.every((b, i) => data[i] === b))
      return k as keyof typeof DBC_DISCRIMINATORS;
  return null;
}