// QLi Agent v2 scheduled worker. Read-only: holds no wallet key, builds/signs/sends nothing.
// Bounded batches, concurrency cap, lease lock, retries with jitter, idempotent inserts.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  WORKER_INTERVAL_S,
  backoffSeconds,
  dedupKey,
  resolveServerRpc,
  settingsDefaults,
  sha256Hex,
  type V2Network,
  type V2Settings,
} from "./agent-v2-core";

export const BATCH_LIMIT = 20;
export const CONCURRENCY = 3;
const LEASE_TTL_S = 240;

/** Maps errors to allowlisted categories; raw messages/URLs are never persisted. */
export function errorCategory(e: unknown) {
  const m = e instanceof Error ? e.message : String(e);
  if (/creator/i.test(m)) return "creator-mismatch";
  if (/429|rate/i.test(m)) return "rpc-rate-limited";
  if (/403|401|forbidden/i.test(m)) return "rpc-forbidden";
  if (/genesis/i.test(m)) return "genesis-mismatch";
  if (/not found|not owned/i.test(m)) return "account-not-found";
  if (/fetch|network|timeout|ECONN|5\d\d/i.test(m)) return "rpc-unavailable";
  return "read-failed";
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  attempts = 3,
  sleep = (ms: number) => new Promise((r) => setTimeout(r, ms)),
) {
  let last: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (e) {
      last = e;
      if (errorCategory(e) === "creator-mismatch" || errorCategory(e) === "genesis-mismatch") break;
      if (i < attempts - 1) await sleep(400 * 2 ** i + Math.floor(Math.random() * 250));
    }
  }
  throw last;
}

export async function authorizeWorker(request: Request) {
  const m = /^Bearer ([0-9a-f]{64})$/.exec(request.headers.get("authorization") ?? "");
  if (!m) return false;
  const { data } = await supabaseAdmin
    .from("qli_worker_config")
    .select("token")
    .eq("id", 1)
    .maybeSingle();
  if (!data) return false;
  return (await sha256Hex(m[1]!)) === (await sha256Hex(data.token));
}

export async function runWorker() {
  const db = supabaseAdmin;
  const holder = crypto.randomUUID();
  const { data: leased } = await db.rpc("qli_try_lease", {
    _holder: holder,
    _ttl_seconds: LEASE_TTL_S,
  });
  if (!leased) {
    await db.from("qli_worker_runs").insert({
      status: "skipped",
      finished_at: new Date().toISOString(),
      note: "lease held by another run",
    });
    return { status: "skipped" as const };
  }
  const { data: run } = await db.from("qli_worker_runs").insert({}).select("id").single();
  let checked = 0;
  let errors = 0;
  try {
    const { data: due } = await db
      .from("qli_monitored_pools")
      .select(
        "id, pool, network, last_slot, consecutive_errors, qli_agent_profiles!inner(wallet, network, active, settings, name)",
      )
      .eq("active", true)
      .eq("qli_agent_profiles.active", true)
      .lte("next_check_at", new Date().toISOString())
      .order("next_check_at")
      .limit(BATCH_LIMIT);
    const pools = due ?? [];
    const [{ Connection }, { GENESIS }, fl, agent] = await Promise.all([
      import("@solana/web3.js"),
      import("./dbc-launch"),
      import("./flywheel-live"),
      import("./qli-agent"),
    ]);
    const genesisOk = new Map<V2Network, boolean>();
    async function checkGenesis(n: V2Network, url: string) {
      if (!genesisOk.has(n)) {
        const g = await withRetry(() => new Connection(url, "confirmed").getGenesisHash());
        genesisOk.set(n, g === GENESIS[n]);
      }
      if (!genesisOk.get(n)) throw new Error("genesis mismatch");
    }
    async function one(row: (typeof pools)[number]) {
      const prof = row.qli_agent_profiles as unknown as {
        wallet: string;
        network: V2Network;
        settings: Partial<V2Settings>;
        name: string;
      };
      const network = row.network as V2Network;
      const rpc = resolveServerRpc(
        network,
        network === "mainnet-beta"
          ? process.env["QLI_AGENT_RPC_MAINNET"]
          : process.env["QLI_AGENT_RPC_DEVNET"],
      );
      const nowIso = new Date().toISOString();
      try {
        if (prof.network !== network) throw new Error("network mismatch");
        await checkGenesis(network, rpc.url);
        const conn = new Connection(rpc.url, "confirmed");
        const slot = await withRetry(() => conn.getSlot("confirmed"));
        const p = await withRetry(() => fl.loadFlywheelPool(rpc.url, row.pool, prof.wallet));
        const bal = await withRetry(() => fl.readFlywheelBalances(rpc.url, p, prof.wallet));
        const observedAt = Math.floor(Date.now() / 1000);
        const obs = agent.toObservation(p, bal, network, prof.wallet, observedAt);
        obs.source = `${obs.source} · ${rpc.provider} · scheduled · slot≥${slot}`;
        const s = { ...settingsDefaults, ...prof.settings };
        const profile = {
          ...agent.defaultProfile(prof.wallet, network),
          ...s,
          name: prof.name,
          pools: [row.pool],
          cadenceSeconds: WORKER_INTERVAL_S,
          staleSeconds: 600,
        };
        // Out-of-order guard: only newer slots are recorded.
        if (row.last_slot === null || slot > Number(row.last_slot)) {
          await db.from("qli_observations").upsert(
            {
              pool_id: row.id,
              slot,
              observed_at: new Date(observedAt * 1000).toISOString(),
              mode: "scheduled",
              source: obs.source,
              data: JSON.parse(JSON.stringify(obs)),
            },
            { onConflict: "pool_id,slot", ignoreDuplicates: true },
          );
          const r = agent.evaluateRules(obs, profile, observedAt);
          const cooldown = Math.max(1, s.cooldownHours) * 3600;
          if (r.alerts.length)
            await db.from("qli_alerts").upsert(
              r.alerts.map((a) => ({
                pool_id: row.id,
                ability: a.ability,
                level: a.level,
                title: a.title,
                logic: a.logic,
                evidence: {
                  observation: obs.source,
                  slot,
                  claimableQuote: obs.claimableQuote,
                  progressPct: obs.progressPct,
                  walletSol: obs.walletSol,
                },
                slot,
                observed_at: new Date(observedAt * 1000).toISOString(),
                dedup_key: dedupKey(
                  `${a.ability}:${a.title.replace(/[\d.]+%/, "")}`,
                  observedAt,
                  cooldown,
                ),
              })),
              { onConflict: "pool_id,dedup_key", ignoreDuplicates: true },
            );
          if (r.proposals.length)
            await db.from("qli_proposals").upsert(
              r.proposals.map((x) => ({
                pool_id: row.id,
                step: x.step,
                amount: x.amount,
                max_spend_sol: x.maxSpendSol,
                slippage_bps: x.slippageBps,
                rationale: x.rationale,
                evidence: {
                  source: obs.source,
                  slot,
                  claimableQuote: obs.claimableQuote,
                  walletToken: obs.walletToken,
                },
                slot,
                observed_at: new Date(observedAt * 1000).toISOString(),
                dedup_key: dedupKey(`proposal:${x.step}`, observedAt, cooldown),
              })),
              { onConflict: "pool_id,dedup_key", ignoreDuplicates: true },
            );
        }
        await db
          .from("qli_monitored_pools")
          .update({
            last_observed_at: nowIso,
            last_slot: slot,
            last_error: null,
            consecutive_errors: 0,
            next_check_at: new Date(Date.now() + WORKER_INTERVAL_S * 1000).toISOString(),
          })
          .eq("id", row.id);
        checked++;
      } catch (e) {
        errors++;
        const n = row.consecutive_errors + 1;
        await db
          .from("qli_monitored_pools")
          .update({
            last_error: errorCategory(e),
            consecutive_errors: n,
            next_check_at: new Date(Date.now() + backoffSeconds(n) * 1000).toISOString(),
          })
          .eq("id", row.id);
      }
    }
    for (let i = 0; i < pools.length; i += CONCURRENCY)
      await Promise.all(pools.slice(i, i + CONCURRENCY).map(one));
    if (Math.random() < 0.1) await db.rpc("qli_prune");
    const status = errors === 0 ? "ok" : checked > 0 ? "partial" : pools.length ? "failed" : "ok";
    await db
      .from("qli_worker_runs")
      .update({
        status,
        finished_at: new Date().toISOString(),
        pools_checked: checked,
        errors,
        note: `${pools.length} due`,
      })
      .eq("id", run!.id);
    return { status, checked, errors };
  } catch (e) {
    await db
      .from("qli_worker_runs")
      .update({
        status: "failed",
        finished_at: new Date().toISOString(),
        errors: errors + 1,
        note: errorCategory(e),
      })
      .eq("id", run!.id);
    return { status: "failed" as const };
  } finally {
    await db.rpc("qli_release_lease", { _holder: holder });
  }
}
