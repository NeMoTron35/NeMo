// SDK-backed decoding, quoting and event parsing for Lifecycle Intelligence.
// Imported only by server modules and tests. Pure with respect to RPC: callers supply bytes.
import { Connection, PublicKey } from "@solana/web3.js";
import BN from "bn.js";
import {
  DynamicBondingCurveClient,
  SwapMode,
  deriveDbcEventAuthority,
  type PoolConfig,
  type VirtualPool,
} from "@meteora-ag/dynamic-bonding-curve-sdk";
import {
  MIGRATION_INSTRUCTIONS,
  TRACKED_EVENTS,
  priceMovePpm,
  type ConfigFacts,
  type PoolFacts,
  type QuoteResult,
  type TimelineEntry,
} from "./lifecycle";
import { DBC_PROGRAM } from "./launch-proof";

const EVENT_IX_TAG = "e445a52e51cb9a1d";
let cached: DynamicBondingCurveClient | null = null;
/** Offline client: the connection is never used for coding or quote math. */
function offline() {
  cached ??= new DynamicBondingCurveClient(new Connection("http://127.0.0.1:1"), "confirmed");
  return cached;
}
const s = (k: unknown) => (k as PublicKey).toBase58();
const n = (v: unknown) => (v as BN).toString();

export type RawPool = { poolState: VirtualPool["poolState"] };
export function decodePool(data: Uint8Array): { raw: RawPool; facts: PoolFacts } | null {
  try {
    const raw = offline().state.program.coder.accounts.decode(
      "virtualPool",
      Buffer.from(data),
    ) as RawPool;
    const p = raw.poolState;
    if (!p || !p.config) return null;
    return {
      raw,
      facts: {
        config: s(p.config),
        creator: s(p.creator),
        baseMint: s(p.baseMint),
        baseVault: s(p.baseVault),
        quoteVault: s(p.quoteVault),
        baseReserve: n(p.baseReserve),
        quoteReserve: n(p.quoteReserve),
        sqrtPrice: n(p.sqrtPrice),
        activationPoint: n(p.activationPoint),
        isMigrated: Number(p.isMigrated),
        migrationProgress: Number(p.migrationProgress),
        finishCurveTimestamp: n(p.finishCurveTimestamp),
        hasSwap: Number(p.hasSwap) !== 0,
        protocolBaseFee: n(p.protocolBaseFee),
        protocolQuoteFee: n(p.protocolQuoteFee),
        partnerBaseFee: n(p.partnerBaseFee),
        partnerQuoteFee: n(p.partnerQuoteFee),
        creatorBaseFee: n(p.creatorBaseFee),
        creatorQuoteFee: n(p.creatorQuoteFee),
        totalTradingBaseFee: n(p.metrics.totalTradingBaseFee),
        totalTradingQuoteFee: n(p.metrics.totalTradingQuoteFee),
      },
    };
  } catch {
    return null;
  }
}

export function decodeConfig(data: Uint8Array): { raw: PoolConfig; facts: ConfigFacts } | null {
  try {
    const c = offline().state.program.coder.accounts.decode(
      "poolConfig",
      Buffer.from(data),
    ) as PoolConfig;
    if (!c || !c.quoteMint) return null;
    return {
      raw: c,
      facts: {
        quoteMint: s(c.quoteMint),
        feeClaimer: s(c.feeClaimer),
        migrationOption: Number(c.migrationOption),
        activationType: Number(c.activationType),
        tokenDecimal: Number(c.tokenDecimal),
        migrationQuoteThreshold: n(c.migrationQuoteThreshold),
        creatorTradingFeePercentage: Number(c.creatorTradingFeePercentage),
        collectFeeMode: Number(c.collectFeeMode),
      },
    };
  } catch {
    return null;
  }
}

/** SPL / Token-2022 mint decimals live at byte 44 of the base mint layout. */
export function mintDecimals(data: Uint8Array | null | undefined): number | null {
  return data && data.length >= 82 ? data[44]! : null;
}

/** Exact-in quote via the SDK's own PoolService.swapQuote2 against decoded live state. */
export function quoteExactIn(args: {
  pool: RawPool;
  facts: PoolFacts;
  config: PoolConfig;
  configFacts: ConfigFacts;
  direction: "buy" | "sell";
  amountIn: string;
  slippageBps: number;
  currentPoint: string;
  observedSlot: number;
}): QuoteResult {
  const { facts: p, configFacts: c } = args;
  if (p.isMigrated !== 0)
    return {
      ok: false,
      code: "migrated",
      message: "Pool is migrated; the bonding curve no longer quotes.",
    };
  const t = BigInt(c.migrationQuoteThreshold);
  if (t > 0n && BigInt(p.quoteReserve) >= t)
    return {
      ok: false,
      code: "curve-complete",
      message: "Curve has reached its migration threshold; no further curve swaps.",
    };
  if (BigInt(args.currentPoint) < BigInt(p.activationPoint))
    return {
      ok: false,
      code: "not-activated",
      message: `Pool activates at ${c.activationType === 0 ? "slot" : "timestamp"} ${p.activationPoint}; current is ${args.currentPoint}.`,
    };
  try {
    const q = offline().pool.swapQuote2({
      virtualPool: args.pool as never,
      config: args.config as never,
      swapBaseForQuote: args.direction === "sell",
      hasReferral: false,
      eligibleForFirstSwapWithMinFee: false,
      currentPoint: new BN(args.currentPoint),
      slippageBps: args.slippageBps,
      swapMode: SwapMode.ExactIn,
      amountIn: new BN(args.amountIn),
    });
    if (!q.amountLeft.isZero())
      return {
        ok: false,
        code: "partial-fill",
        message: `Input exceeds remaining curve capacity; ${q.amountLeft.toString()} atomic units would be unfilled. Reduce the amount.`,
      };
    return {
      ok: true,
      evidence: "estimate",
      direction: args.direction,
      amountIn: args.amountIn,
      slippageBps: args.slippageBps,
      outputAmount: q.outputAmount.toString(),
      minimumAmountOut: (q.minimumAmountOut ?? new BN(0)).toString(),
      includedFeeInputAmount: q.includedFeeInputAmount.toString(),
      excludedFeeInputAmount: q.excludedFeeInputAmount.toString(),
      amountLeft: q.amountLeft.toString(),
      tradingFee: q.tradingFee.toString(),
      protocolFee: q.protocolFee.toString(),
      referralFee: q.referralFee.toString(),
      poolPriceMovePpm: priceMovePpm(p.sqrtPrice, q.nextSqrtPrice.toString()),
      currentPoint: args.currentPoint,
      observedSlot: args.observedSlot,
      caveats: [
        "Estimate from account state at the observed slot; any later swap changes the result.",
        "Not a guaranteed exchange outcome. No transaction is built on this page.",
        "Assumes no referral and no first-swap minimum-fee eligibility.",
      ],
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message.slice(0, 160) : "unknown";
    return { ok: false, code: "sdk-error", message: `SDK quote failed: ${msg}` };
  }
}

function flat(v: unknown, depth = 0): string {
  if (v instanceof PublicKey) return v.toBase58();
  if (BN.isBN(v)) return v.toString();
  if (typeof v === "bigint" || typeof v === "number" || typeof v === "boolean") return String(v);
  if (typeof v === "string") return v.slice(0, 120);
  if (v && typeof v === "object" && depth < 2)
    return `{${Object.entries(v)
      .slice(0, 16)
      .map(([k, x]) => `${k}:${flat(x, depth + 1)}`)
      .join(",")}}`;
  return "…";
}

export type RawIx = { programIndex: number; accounts: number[]; data: Uint8Array };
export type RawTx = {
  slot: number;
  blockTime: number | null;
  err: unknown;
  accountKeys: string[];
  top: RawIx[];
  inner: RawIx[];
};

/** Decode DBC instruction names and event-CPI events that are verifiably linked to `pool`. */
export function parseTx(
  pool: string,
  sig: { signature: string; confirmationStatus: string | null },
  tx: RawTx,
): TimelineEntry {
  const coder = offline().state.program.coder;
  const eventAuthority = deriveDbcEventAuthority().toBase58();
  const keys = tx.accountKeys;
  const isDbc = (ix: RawIx) => keys[ix.programIndex] === DBC_PROGRAM;
  const instructions: string[] = [];
  for (const ix of [...tx.top, ...tx.inner].filter(isDbc)) {
    if (!ix.accounts.some((a) => keys[a] === pool)) continue;
    try {
      const d = (
        coder.instruction as unknown as { decode(b: Buffer): { name: string } | null }
      ).decode(Buffer.from(ix.data));
      if (d) instructions.push(d.name);
    } catch {
      /* not an instruction (event CPI) */
    }
  }
  const events: TimelineEntry["events"] = [];
  if (!tx.err) {
    tx.inner.filter(isDbc).forEach((ix, i) => {
      const hex = Buffer.from(ix.data.slice(0, 8)).toString("hex");
      if (hex !== EVENT_IX_TAG || keys[ix.accounts[0] ?? -1] !== eventAuthority) return;
      try {
        const ev = coder.events.decode(Buffer.from(ix.data.slice(8)).toString("base64"));
        if (!ev || !(TRACKED_EVENTS as readonly string[]).includes(ev.name)) return;
        const data = ev.data as Record<string, unknown>;
        if (!(data["pool"] instanceof PublicKey) || data["pool"].toBase58() !== pool) return;
        const fields: Record<string, string> = {};
        for (const [k, v] of Object.entries(data).slice(0, 12)) fields[k] = flat(v);
        events.push({ index: i, name: ev.name, evidence: "on-chain", fields });
      } catch {
        /* undecodable event bytes are skipped, never guessed */
      }
    });
  }
  return {
    signature: sig.signature,
    slot: tx.slot,
    blockTime: tx.blockTime,
    confirmation: sig.confirmationStatus,
    failed: !!tx.err,
    instructions: [...new Set(instructions)].slice(0, 8),
    events: events.slice(0, 8),
  };
}
export const isMigrationIx = (name: string) => MIGRATION_INSTRUCTIONS.includes(name);

/** Decode poolState from a DBC VirtualPool OR TransferHookPool (same layout, distinct discriminator). */
export function decodePoolStateAny(data: Uint8Array): {
  baseMint: string;
  config: string;
  isMigrated: number;
  kind: "virtualPool" | "transferHookPool";
} | null {
  for (const kind of ["transferHookPool", "virtualPool"] as const) {
    try {
      const raw = offline().state.program.coder.accounts.decode(kind, Buffer.from(data)) as RawPool;
      const p = raw.poolState;
      if (p && p.config)
        return {
          baseMint: s(p.baseMint),
          config: s(p.config),
          isMigrated: Number(p.isMigrated),
          kind,
        };
    } catch {
      /* try next */
    }
  }
  return null;
}

/** DBC instruction name via the SDK coder, or null when the bytes are not a DBC instruction. */
export function decodeDbcIxName(data: Uint8Array): string | null {
  try {
    const d = (
      offline().state.program.coder.instruction as unknown as {
        decode(b: Buffer): { name: string } | null;
      }
    ).decode(Buffer.from(data));
    return d?.name ?? null;
  } catch {
    return null;
  }
}
