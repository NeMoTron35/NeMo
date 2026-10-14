// Server-only adapters for the Launch Proof Engine: trusted RPC endpoints, SDK decoding,
// bounded caching and per-isolate rate limiting. Read-only; never signs or sends.
import { Connection, PublicKey } from "@solana/web3.js";
import {
  DynamicBondingCurveClient,
  deriveDbcPoolAddress,
} from "@meteora-ag/dynamic-bonding-curve-sdk";
import { resolveServerRpc } from "./agent-v2-core";
import {
  verifyLaunch,
  type ProofDecoder,
  type ProofNetwork,
  type ProofResult,
  type ProofRpc,
  type TxView,
} from "./launch-proof";

const TIMEOUT_MS = 10_000;
function withTimeout<T>(p: Promise<T>): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, r) => setTimeout(() => r(new Error("rpc timeout")), TIMEOUT_MS)),
  ]);
}

export function rpcAdapter(conn: Connection): ProofRpc {
  return {
    genesis: () => withTimeout(conn.getGenesisHash()),
    async status(sig) {
      const v = (
        await withTimeout(conn.getSignatureStatuses([sig], { searchTransactionHistory: true }))
      ).value[0];
      return v
        ? { confirmationStatus: v.confirmationStatus ?? null, err: v.err, slot: v.slot }
        : null;
    },
    async transaction(sig) {
      const tx = await withTimeout(
        conn.getTransaction(sig, { commitment: "confirmed", maxSupportedTransactionVersion: 0 }),
      );
      if (!tx || !tx.meta) return null;
      const msg = tx.transaction.message;
      const keys = msg.getAccountKeys({ accountKeysFromLookups: tx.meta.loadedAddresses ?? null });
      const all = keys.keySegments().flat();
      const accountKeys = all.map((k: PublicKey, i: number) => ({
        pubkey: k.toBase58(),
        signer: msg.isAccountSigner(i),
        writable: msg.isAccountWritable(i),
      }));
      const instructions = [
        ...msg.compiledInstructions.map((ix) => ({
          programIndex: ix.programIdIndex,
          accounts: [...ix.accountKeyIndexes],
        })),
        ...(tx.meta.innerInstructions ?? []).flatMap((g) =>
          g.instructions.map((ix) => ({ programIndex: ix.programIdIndex, accounts: ix.accounts })),
        ),
      ];
      const view: TxView = {
        slot: tx.slot,
        blockTime: tx.blockTime ?? null,
        err: tx.meta.err,
        accountKeys,
        preBalances: tx.meta.preBalances,
        postBalances: tx.meta.postBalances,
        logs: tx.meta.logMessages ?? [],
        instructions,
      };
      return view;
    },
    async accounts(addrs) {
      const r = await withTimeout(
        conn.getMultipleAccountsInfoAndContext(
          addrs.map((a) => new PublicKey(a)),
          "confirmed",
        ),
      );
      return {
        slot: r.context.slot,
        values: r.value.map((a) =>
          a ? { owner: a.owner.toBase58(), lamports: a.lamports, data: a.data } : null,
        ),
      };
    },
  };
}

export function sdkDecoder(conn: Connection): ProofDecoder {
  const coder = new DynamicBondingCurveClient(conn, "confirmed").state.program.coder.accounts;
  const s = (k: unknown) => (k as PublicKey).toBase58();
  return {
    pool(data) {
      try {
        // The SDK IDL wraps the pool layout in a single `poolState` field.
        const raw = coder.decode("virtualPool", Buffer.from(data));
        const p = raw?.poolState ?? raw;
        return {
          config: s(p.config),
          creator: s(p.creator),
          baseMint: s(p.baseMint),
          baseReserve: p.baseReserve.toString(),
          quoteReserve: p.quoteReserve.toString(),
        };
      } catch {
        return null;
      }
    },
    config(data) {
      try {
        const c = coder.decode("poolConfig", Buffer.from(data));
        return { quoteMint: s(c.quoteMint), migrationOption: Number(c.migrationOption) };
      } catch {
        return null;
      }
    },
    derivePool: (q, b, c) =>
      deriveDbcPoolAddress(new PublicKey(q), new PublicKey(b), new PublicKey(c)).toBase58(),
  };
}

// Per-isolate best-effort cache and limiter; the RPC provider's own limits remain the hard cap.
const cache = new Map<string, { at: number; v: ProofResult }>();
const hits = new Map<string, number[]>();
export const RATE = { perMinute: 12, cacheMax: 200 };

export function rateLimited(key: string, nowMs = Date.now()) {
  const list = (hits.get(key) ?? []).filter((t) => nowMs - t < 60_000);
  if (list.length >= RATE.perMinute) return true;
  list.push(nowMs);
  hits.set(key, list);
  if (hits.size > 5000) hits.clear();
  return false;
}

export async function lookupLaunchProof(
  network: ProofNetwork,
  signature: string,
): Promise<ProofResult> {
  const key = `${network}:${signature}`;
  const c = cache.get(key);
  const ttl = c && (c.v.ok || c.v.code === "failed" ? 300_000 : 10_000);
  if (c && ttl && Date.now() - c.at < ttl) return c.v;
  const rpc = resolveServerRpc(
    network,
    network === "mainnet-beta"
      ? process.env["QLI_AGENT_RPC_MAINNET"]
      : process.env["QLI_AGENT_RPC_DEVNET"],
  );
  const conn = new Connection(rpc.url, { commitment: "confirmed", disableRetryOnRateLimit: true });
  const v = await verifyLaunch({ network, signature }, rpcAdapter(conn), sdkDecoder(conn));
  if (v.ok || !["rpc-unavailable", "rate-limited"].includes(v.code)) {
    if (cache.size >= RATE.cacheMax) cache.delete(cache.keys().next().value!);
    cache.set(key, { at: Date.now(), v });
  }
  return v;
}
