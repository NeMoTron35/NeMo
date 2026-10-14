// Server-only RPC adapter for Meteora Lifecycle Intelligence. Server-owned RPC allowlist,
// 10 s timeouts, bounded pagination, per-isolate cache and limiter. Never signs or sends.
import { Connection, PublicKey } from "@solana/web3.js";
import { resolveServerRpc } from "./agent-v2-core";
import {
  DBC_PROGRAM,
  PROOF_GENESIS,
  base58Decode as base58ToBytes,
  type AccountView,
} from "./launch-proof";
import {
  LIFECYCLE_VERSION,
  SDK_PIN,
  TIMELINE_LIMITS,
  deriveStage,
  dbcAccountKind,
  INTEL_FAIL_TEXT,
  feeIntel,
  progressPpm,
  snapshotDigest,
  type IntelResult,
  type LifecycleNetwork,
  type QuoteResult,
  type Snapshot,
  type Timeline,
} from "./lifecycle";
import {
  decodeConfig,
  decodePool,
  mintDecimals,
  parseTx,
  quoteExactIn,
  type RawTx,
} from "./lifecycle-sdk";

const TIMEOUT_MS = 10_000;
const withTimeout = <T>(p: Promise<T>) =>
  Promise.race([
    p,
    new Promise<T>((_, r) => setTimeout(() => r(new Error("rpc timeout")), TIMEOUT_MS)),
  ]);

export type SigInfo = {
  signature: string;
  slot: number;
  blockTime: number | null;
  err: unknown;
  confirmationStatus: string | null;
};
export type LifecycleRpc = {
  provider: string;
  genesis(): Promise<string>;
  accounts(
    addrs: string[],
    minContextSlot?: number,
  ): Promise<{ slot: number; values: AccountView[] }>;
  currentPoint(kind: number): Promise<string>;
  signatures(pool: string, limit: number, before?: string): Promise<SigInfo[]>;
  transactions(sigs: string[]): Promise<(RawTx | null)[]>;
};

export function connectionRpc(conn: Connection, provider: string): LifecycleRpc {
  return {
    provider,
    genesis: () => withTimeout(conn.getGenesisHash()),
    async accounts(addrs, minContextSlot) {
      const r = await withTimeout(
        conn.getMultipleAccountsInfoAndContext(
          addrs.map((a) => new PublicKey(a)),
          minContextSlot === undefined
            ? { commitment: "confirmed" }
            : { commitment: "confirmed", minContextSlot },
        ),
      );
      return {
        slot: r.context.slot,
        values: r.value.map((a) =>
          a ? { owner: a.owner.toBase58(), lamports: a.lamports, data: a.data } : null,
        ),
      };
    },
    async currentPoint(kind) {
      const slot = await withTimeout(conn.getSlot("confirmed"));
      if (kind === 0) return String(slot);
      const t = await withTimeout(conn.getBlockTime(slot));
      if (t === null) throw new Error("block time unavailable");
      return String(t);
    },
    async signatures(pool, limit, before) {
      const r = await withTimeout(
        conn.getSignaturesForAddress(
          new PublicKey(pool),
          before
            ? { limit: Math.min(limit, TIMELINE_LIMITS.max), before }
            : { limit: Math.min(limit, TIMELINE_LIMITS.max) },
          "confirmed",
        ),
      );
      return r.map((x) => ({
        signature: x.signature,
        slot: x.slot,
        blockTime: x.blockTime ?? null,
        err: x.err,
        confirmationStatus: x.confirmationStatus ?? null,
      }));
    },
    async transactions(sigs) {
      // Fetched one by one (bounded concurrency) so each result is bound to its own signature;
      // batched JSON-RPC responses are not relied on for ordering.
      const out: (RawTx | null)[] = [];
      for (let i = 0; i < sigs.length; i += 5) {
        const chunk = await Promise.all(
          sigs.slice(i, i + 5).map((sig) =>
            withTimeout(
              conn.getTransaction(sig, {
                commitment: "confirmed",
                maxSupportedTransactionVersion: 0,
              }),
            ).catch(() => null),
          ),
        );
        chunk.forEach((tx, j) => {
          if (!tx || !tx.meta || tx.transaction.signatures[0] !== sigs[i + j])
            return void out.push(null);
          const msg = tx.transaction.message;
          const keys = msg
            .getAccountKeys({ accountKeysFromLookups: tx.meta.loadedAddresses ?? null })
            .keySegments()
            .flat()
            .map((k) => k.toBase58());
          out.push({
            slot: tx.slot,
            blockTime: tx.blockTime ?? null,
            err: tx.meta.err,
            accountKeys: keys,
            top: msg.compiledInstructions.map((ix) => ({
              programIndex: ix.programIdIndex,
              accounts: [...ix.accountKeyIndexes],
              data: new Uint8Array(ix.data),
            })),
            inner: (tx.meta.innerInstructions ?? []).flatMap((g) =>
              g.instructions.map((ix) => ({
                programIndex: ix.programIdIndex,
                accounts: ix.accounts,
                data: base58ToBytes(ix.data),
              })),
            ),
          });
        });
      }
      return out;
    },
  };
}

function classify(e: unknown): IntelResult {
  const m = e instanceof Error ? e.message : String(e);
  if (/\b(403|429)\b|too many/i.test(m))
    return {
      ok: false,
      code: "rate-limited",
      message: "Solana RPC rate-limited this request (HTTP 403/429). Nothing was verified.",
    };
  return {
    ok: false,
    code: "rpc-unavailable",
    message: "Solana RPC unavailable or timed out. Nothing was verified.",
  };
}

type Loaded = {
  snapshot: Snapshot;
  raw: {
    pool: ReturnType<typeof decodePool> & object;
    config: ReturnType<typeof decodeConfig> & object;
  };
};

export async function loadSnapshot(
  network: LifecycleNetwork,
  pool: string,
  rpc: LifecycleRpc,
  now = () => new Date(),
): Promise<{ ok: true; loaded: Loaded } | Exclude<IntelResult, { ok: true }>> {
  try {
    if ((await rpc.genesis()) !== PROOF_GENESIS[network])
      return {
        ok: false,
        code: "wrong-network",
        message: "RPC genesis hash does not match the selected network. Refused.",
      };
    const a = await rpc.accounts([pool]);
    const acc = a.values[0];
    if (!acc)
      return {
        ok: false,
        code: "not-found",
        message: "No account exists at this address on the selected network.",
      };
    if (acc.owner !== DBC_PROGRAM)
      return {
        ok: false,
        code: "not-dbc-pool",
        message: "This account is not owned by the Meteora DBC program.",
      };
    if (dbcAccountKind(acc.data) === "transferHookPool")
      return {
        ok: false,
        code: "transfer-hook-pool",
        message: INTEL_FAIL_TEXT["transfer-hook-pool"],
      };
    const p = decodePool(acc.data);
    if (!p)
      return {
        ok: false,
        code: "not-dbc-pool",
        message: "Account is DBC-owned but is not a VirtualPool.",
      };
    const b = await rpc.accounts([p.facts.config], a.slot);
    const cAcc = b.values[0];
    const c = cAcc && cAcc.owner === DBC_PROGRAM ? decodeConfig(cAcc.data) : null;
    if (!c)
      return {
        ok: false,
        code: "config-mismatch",
        message: "The pool's config account is missing or not a DBC PoolConfig.",
      };
    const m = await rpc.accounts([c.facts.quoteMint], a.slot).catch(() => null);
    let currentPoint: string | null = null;
    try {
      currentPoint = await rpc.currentPoint(c.facts.activationType);
    } catch {
      currentPoint = null;
    }
    const { stage, conditions } = deriveStage(p.facts, c.facts, currentPoint);
    const snapshot: Snapshot = {
      version: LIFECYCLE_VERSION,
      network,
      pool,
      programId: DBC_PROGRAM,
      sdk: SDK_PIN,
      genesisVerified: true,
      observedSlot: a.slot,
      configSlot: b.slot,
      observedAt: now().toISOString(),
      currentPoint:
        currentPoint === null
          ? null
          : { kind: c.facts.activationType === 0 ? "slot" : "timestamp", value: currentPoint },
      facts: p.facts,
      config: c.facts,
      quoteDecimals: mintDecimals(m?.values[0]?.data),
      progressPpm: progressPpm(p.facts.quoteReserve, c.facts.migrationQuoteThreshold),
      stage,
      conditions,
      fees: feeIntel(p.facts, c.facts),
      provenance: {
        rpc: rpc.provider,
        evidence: {
          facts: "on-chain",
          config: "on-chain",
          progressPpm: "derived",
          stage: "derived",
          fees: "on-chain",
          "fees.breakdown": "derived",
          currentPoint: currentPoint === null ? "unknown" : "on-chain",
        },
      },
    };
    return { ok: true, loaded: { snapshot, raw: { pool: p, config: c } } };
  } catch (e) {
    return classify(e) as Exclude<IntelResult, { ok: true }>;
  }
}

export async function loadTimeline(
  network: LifecycleNetwork,
  pool: string,
  rpc: LifecycleRpc,
  limit: number,
  before?: string,
): Promise<Timeline | null> {
  try {
    if ((await rpc.genesis()) !== PROOF_GENESIS[network]) return null;
    const sigs = await rpc.signatures(pool, limit, before);
    const txs = sigs.length ? await rpc.transactions(sigs.map((s) => s.signature)) : [];
    const entries = sigs.flatMap((s, i) => (txs[i] ? [parseTx(pool, s, txs[i]!)] : []));
    const creation = entries.find((e) =>
      e.events.some((v) => v.name.startsWith("evtInitializePool")),
    );
    return {
      entries,
      coverage: {
        requested: limit,
        returned: sigs.length,
        indexed: entries.length,
        notIndexed: sigs.length - entries.length,
        nextBefore: sigs.length === limit ? sigs[sigs.length - 1]!.signature : null,
        reachedCreation: !!creation,
        note: "Bounded window of the most recent signatures that reference this pool. This is not full historical coverage.",
      },
      creationSignature: creation?.signature ?? null,
    };
  } catch {
    return null;
  }
}

// Per-isolate best-effort cache and limiter. The RPC provider's limits remain the hard cap.
const cache = new Map<string, { at: number; v: unknown }>();
const hits = new Map<string, number[]>();
export const LIFECYCLE_RATE = { perMinute: 20, cacheMs: 15_000, cacheMax: 300 };
export function lifecycleRateLimited(key: string, nowMs = Date.now()) {
  const list = (hits.get(key) ?? []).filter((t) => nowMs - t < 60_000);
  if (list.length >= LIFECYCLE_RATE.perMinute) return true;
  list.push(nowMs);
  hits.set(key, list);
  if (hits.size > 5000) hits.clear();
  return false;
}
async function cached<T>(key: string, f: () => Promise<T>, keep: (v: T) => boolean): Promise<T> {
  const c = cache.get(key);
  if (c && Date.now() - c.at < LIFECYCLE_RATE.cacheMs) return c.v as T;
  const v = await f();
  if (keep(v)) {
    if (cache.size >= LIFECYCLE_RATE.cacheMax) cache.delete(cache.keys().next().value!);
    cache.set(key, { at: Date.now(), v });
  }
  return v;
}

export function serverRpc(network: LifecycleNetwork): LifecycleRpc {
  const r = resolveServerRpc(
    network,
    network === "mainnet-beta"
      ? process.env["QLI_AGENT_RPC_MAINNET"]
      : process.env["QLI_AGENT_RPC_DEVNET"],
  );
  return connectionRpc(
    new Connection(r.url, { commitment: "confirmed", disableRetryOnRateLimit: true }),
    r.provider,
  );
}

export async function intelligence(
  network: LifecycleNetwork,
  pool: string,
  rpc = serverRpc(network),
): Promise<IntelResult> {
  return cached(
    `s:${network}:${pool}`,
    async () => {
      const r = await loadSnapshot(network, pool, rpc);
      if (!r.ok) return r;
      return {
        ok: true as const,
        snapshot: r.loaded.snapshot,
        digest: await snapshotDigest(r.loaded.snapshot),
      };
    },
    (v) => v.ok || !["rpc-unavailable", "rate-limited"].includes(v.code),
  );
}

export async function quote(
  q: {
    network: LifecycleNetwork;
    pool: string;
    direction: "buy" | "sell";
    amountIn: string;
    slippageBps: number;
  },
  rpc = serverRpc(q.network),
): Promise<QuoteResult | Exclude<IntelResult, { ok: true }>> {
  const r = await loadSnapshot(q.network, q.pool, rpc);
  if (!r.ok) return r;
  const s = r.loaded.snapshot;
  if (!s.currentPoint)
    return {
      ok: false,
      code: "stale",
      message:
        "Current slot/time could not be read; quote refused rather than computed against an unknown clock.",
    };
  return quoteExactIn({
    pool: r.loaded.raw.pool.raw,
    facts: s.facts,
    config: r.loaded.raw.config.raw,
    configFacts: s.config,
    direction: q.direction,
    amountIn: q.amountIn,
    slippageBps: q.slippageBps,
    currentPoint: s.currentPoint.value,
    observedSlot: s.observedSlot,
  });
}

export async function timeline(
  network: LifecycleNetwork,
  pool: string,
  limit: number,
  before?: string,
  rpc = serverRpc(network),
): Promise<Timeline | null> {
  return cached(
    `t:${network}:${pool}:${limit}:${before ?? ""}`,
    () => loadTimeline(network, pool, rpc, limit, before),
    (v) => v !== null,
  );
}
