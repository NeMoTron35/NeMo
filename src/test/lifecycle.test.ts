// @vitest-environment node
// Offline tests. The fixture holds raw bytes captured read-only from a third-party devnet
// DBC pool; it is a fixture, not live chain state.
import { describe, expect, it } from "vitest";
import BN from "bn.js";
import { Connection, PublicKey } from "@solana/web3.js";
import { DynamicBondingCurveClient, SwapMode } from "@meteora-ag/dynamic-bonding-curve-sdk";
import fx from "./fixtures/dbc-devnet-pool.json";
import {
  deriveStage,
  explain,
  feeIntel,
  lookupSchema,
  progressPpm,
  quoteSchema,
  snapshotDigest,
  timelineSchema,
  type Snapshot,
} from "@/lib/qli-core/lifecycle";
import {
  decodeConfig,
  decodePool,
  mintDecimals,
  parseTx,
  quoteExactIn,
} from "@/lib/qli-core/lifecycle-sdk";
import { loadSnapshot, type LifecycleRpc } from "@/lib/qli-core/lifecycle.server";
import { PROOF_GENESIS } from "@/lib/qli-core/launch-proof";

const b = (s: string) => new Uint8Array(Buffer.from(s, "base64"));
const pool = decodePool(b(fx.poolData))!;
const cfg = decodeConfig(b(fx.configData))!;

function fakeRpc(over: Partial<LifecycleRpc> = {}): LifecycleRpc {
  const accounts: Record<string, { owner: string; data: Uint8Array }> = {
    [fx.pool]: { owner: fx.poolOwner, data: b(fx.poolData) },
    [fx.config]: { owner: fx.configOwner, data: b(fx.configData) },
    [fx.quoteMint]: { owner: fx.quoteMintOwner, data: b(fx.quoteMintData) },
  };
  return {
    provider: "fixture",
    genesis: async () => PROOF_GENESIS.devnet,
    accounts: async (a) => ({
      slot: fx.slot,
      values: a.map((k) => (accounts[k] ? { ...accounts[k]!, lamports: 1 } : null)),
    }),
    currentPoint: async () => String(2_000_000_000),
    signatures: async () => [],
    transactions: async () => [],
    ...over,
  };
}

describe("decoding with the pinned SDK coder", () => {
  it("decodes the VirtualPool and PoolConfig fixture", () => {
    expect(pool.facts.config).toBe(fx.config);
    expect(cfg.facts.quoteMint).toBe(fx.quoteMint);
    expect(mintDecimals(b(fx.quoteMintData))).toBe(9);
  });
  it("rejects garbage and wrong layouts", () => {
    expect(decodePool(new Uint8Array(40))).toBeNull();
    expect(decodePool(b(fx.configData))).toBeNull();
    expect(decodeConfig(b(fx.poolData))).toBeNull();
  });
});

describe("SDK oracle parity", () => {
  it("progress and fee breakdown match StateService methods", async () => {
    const client = new DynamicBondingCurveClient(new Connection("http://127.0.0.1:1"), "confirmed");
    client.state.getPool = async () => pool.raw as never;
    client.state.getPoolConfig = async () => cfg.raw as never;
    const sdkProgress = await client.state.getPoolQuoteTokenCurveProgress(fx.pool);
    expect(
      Math.abs(
        progressPpm(pool.facts.quoteReserve, cfg.facts.migrationQuoteThreshold)! / 1e6 -
          sdkProgress,
      ),
    ).toBeLessThan(1e-6);
    const br = await client.state.getPoolFeeBreakdown(fx.pool);
    const ours = feeIntel(pool.facts, cfg.facts);
    expect(ours.breakdown.creator.totalQuote).toBe(br.creator.totalQuoteFee.toString());
    expect(ours.breakdown.partner.claimedQuote).toBe(br.partner.claimedQuoteFee.toString());
  });
  it("quote equals a direct SDK swapQuote2 call", () => {
    const client = new DynamicBondingCurveClient(new Connection("http://127.0.0.1:1"), "confirmed");
    const point = String(2_000_000_000);
    const direct = client.pool.swapQuote2({
      virtualPool: pool.raw as never,
      config: cfg.raw as never,
      swapBaseForQuote: false,
      hasReferral: false,
      eligibleForFirstSwapWithMinFee: false,
      currentPoint: new BN(point),
      slippageBps: 100,
      swapMode: SwapMode.ExactIn,
      amountIn: new BN(10_000_000),
    });
    const r = quoteExactIn({
      pool: pool.raw,
      facts: pool.facts,
      config: cfg.raw,
      configFacts: cfg.facts,
      direction: "buy",
      amountIn: "10000000",
      slippageBps: 100,
      currentPoint: point,
      observedSlot: fx.slot,
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.outputAmount).toBe(direct.outputAmount.toString());
      expect(r.minimumAmountOut).toBe(direct.minimumAmountOut!.toString());
      expect(BigInt(r.minimumAmountOut)).toBeLessThanOrEqual(BigInt(r.outputAmount));
      expect(r.evidence).toBe("estimate");
    }
  });
});

describe("quote negative cases", () => {
  const base = {
    pool: pool.raw,
    config: cfg.raw,
    configFacts: cfg.facts,
    direction: "buy" as const,
    amountIn: "1000",
    slippageBps: 100,
    observedSlot: 1,
  };
  it("refuses before activation", () => {
    const r = quoteExactIn({
      ...base,
      facts: { ...pool.facts, activationPoint: "999" },
      currentPoint: "1",
    });
    expect(r.ok === false && r.code).toBe("not-activated");
  });
  it("refuses migrated and complete curves", () => {
    expect(
      quoteExactIn({ ...base, facts: { ...pool.facts, isMigrated: 1 }, currentPoint: "2000000000" })
        .ok,
    ).toBe(false);
    const r = quoteExactIn({
      ...base,
      facts: { ...pool.facts, quoteReserve: cfg.facts.migrationQuoteThreshold },
      currentPoint: "2000000000",
    });
    expect(r.ok === false && r.code).toBe("curve-complete");
  });
  it("validates amount and slippage bounds", () => {
    const ok = { network: "devnet", pool: fx.pool, direction: "buy", slippageBps: 100 };
    expect(quoteSchema.safeParse({ ...ok, amountIn: "0" }).success).toBe(false);
    expect(quoteSchema.safeParse({ ...ok, amountIn: "18446744073709551616" }).success).toBe(false);
    expect(quoteSchema.safeParse({ ...ok, amountIn: "-1" }).success).toBe(false);
    expect(quoteSchema.safeParse({ ...ok, amountIn: "1", slippageBps: 5001 }).success).toBe(false);
    expect(lookupSchema.safeParse({ network: "testnet", pool: fx.pool }).success).toBe(false);
    expect(lookupSchema.safeParse({ network: "devnet", pool: "not-an-address" }).success).toBe(
      false,
    );
    expect(
      lookupSchema.safeParse({ network: "devnet", pool: fx.pool, rpc: "https://evil" }).success,
    ).toBe(false);
    expect(timelineSchema.safeParse({ network: "devnet", pool: fx.pool, limit: 500 }).success).toBe(
      false,
    );
  });
});

describe("lifecycle derivation", () => {
  const c = { migrationQuoteThreshold: "100" };
  it("never claims awaiting-migration without all conditions", () => {
    expect(
      deriveStage(
        { quoteReserve: "100", activationPoint: "0", isMigrated: 0, migrationProgress: 0 },
        c,
        "5",
      ).stage,
    ).not.toBe("curve-complete-awaiting-migration");
    expect(
      deriveStage(
        { quoteReserve: "100", activationPoint: "0", isMigrated: 0, migrationProgress: 1 },
        c,
        "5",
      ).stage,
    ).toBe("curve-complete-awaiting-migration");
    expect(
      deriveStage(
        { quoteReserve: "50", activationPoint: "0", isMigrated: 1, migrationProgress: 3 },
        c,
        "5",
      ).stage,
    ).toBe("migrated");
    expect(
      deriveStage(
        { quoteReserve: "50", activationPoint: "10", isMigrated: 0, migrationProgress: 0 },
        c,
        "5",
      ).stage,
    ).toBe("pre-activation");
    expect(
      deriveStage(
        { quoteReserve: "50", activationPoint: "0", isMigrated: 0, migrationProgress: 0 },
        c,
        null,
      ).stage,
    ).toBe("unknown");
  });
  it("progress clamps and handles zero threshold", () => {
    expect(progressPpm("200", "100")).toBe(1_000_000);
    expect(progressPpm("1", "0")).toBeNull();
  });
});

describe("snapshot loading against a fake RPC", () => {
  it("loads and hashes deterministically", async () => {
    const r = await loadSnapshot("devnet", fx.pool, fakeRpc(), () => new Date(0));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const s: Snapshot = r.loaded.snapshot;
    expect(s.stage).toBe("trading");
    const d1 = await snapshotDigest(s);
    expect(d1).toBe(await snapshotDigest(JSON.parse(JSON.stringify(s))));
    expect(await snapshotDigest({ ...s, facts: { ...s.facts, quoteReserve: "1" } })).not.toBe(d1);
    expect(explain(s).join(" ")).not.toMatch(/guarantee|will graduate/i);
  });
  it("fails closed on wrong genesis, foreign owner, missing account, 429", async () => {
    expect((await loadSnapshot("mainnet-beta", fx.pool, fakeRpc())).ok).toBe(false);
    const foreign = fakeRpc({
      accounts: async (a) => ({
        slot: 1,
        values: a.map(() => ({
          owner: PublicKey.default.toBase58(),
          lamports: 1,
          data: b(fx.poolData),
        })),
      }),
    });
    const f = await loadSnapshot("devnet", fx.pool, foreign);
    expect(f.ok === false && f.code).toBe("not-dbc-pool");
    const missing = await loadSnapshot(
      "devnet",
      fx.pool,
      fakeRpc({ accounts: async (a) => ({ slot: 1, values: a.map(() => null) }) }),
    );
    expect(missing.ok === false && missing.code).toBe("not-found");
    const limited = await loadSnapshot(
      "devnet",
      fx.pool,
      fakeRpc({
        genesis: async () => {
          throw new Error("429 Too Many Requests");
        },
      }),
    );
    expect(limited.ok === false && limited.code).toBe("rate-limited");
    const down = await loadSnapshot(
      "devnet",
      fx.pool,
      fakeRpc({
        genesis: async () => {
          throw new Error("rpc timeout");
        },
      }),
    );
    expect(down.ok === false && down.code).toBe("rpc-unavailable");
  });
  it("reports unknown clock instead of guessing", async () => {
    const r = await loadSnapshot(
      "devnet",
      fx.pool,
      fakeRpc({
        currentPoint: async () => {
          throw new Error("x");
        },
      }),
    );
    expect(r.ok && r.loaded.snapshot.currentPoint).toBe(null);
  });
});

describe("timeline parsing", () => {
  it("ignores events from other programs or other pools and never invents events", () => {
    const entry = parseTx(
      fx.pool,
      { signature: "s", confirmationStatus: "confirmed" },
      {
        slot: 1,
        blockTime: null,
        err: null,
        accountKeys: [PublicKey.default.toBase58(), fx.pool],
        top: [{ programIndex: 0, accounts: [1], data: new Uint8Array([1, 2, 3]) }],
        inner: [
          { programIndex: 0, accounts: [1], data: Buffer.from("e445a52e51cb9a1d00000000", "hex") },
        ],
      },
    );
    expect(entry.events).toEqual([]);
    expect(entry.instructions).toEqual([]);
  });
});