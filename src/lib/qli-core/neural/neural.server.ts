// Server-only Neural Engine bridge. Every call requires a wallet-signed session; data is scoped
// to that session's wallet + network. Hosted calls send only a fixed task enum + numeric evidence,
// and every single hosted request is pre-reserved atomically against durable DB budgets.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { requireSession } from "../agent-v2.server";
import {
  NEURAL_VERSION,
  deterministicAnswer,
  safeTask,
  toSnapshot,
  validateModelOutput,
} from "./engine";
import { buildRecord } from "./proof";
import { sha256HexOf } from "./canonical";
import { runShadow, observedDrift, type ShadowConfig } from "./shadow";
import { buildGraph } from "./threat-graph";
import { FIXTURES, runBaseline, scoreAnswer, summarize } from "./arena";
import { hfChat, isModelId, routableModels, type SafeTask } from "./hf-client";

const SAFE_FIXTURES = FIXTURES.filter((f) => safeTask(f.question) !== null).length;
const MAX_CONCURRENT = 2;
let inflight = 0;
let routeCache: { at: number; key: string; models: string[] } | null = null;
const db = () => supabaseAdmin;
const int = (v: string | undefined, d: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, Number.isFinite(Number(v)) && v ? Math.trunc(Number(v)) : d));

/** No defaults: hosted inference is disabled unless the operator sets both HF_TOKEN and HF_MODEL_ALLOWLIST. */
export function hfConfig() {
  const token = process.env["HF_TOKEN"];
  const allow = (process.env["HF_MODEL_ALLOWLIST"] ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(isModelId)
    .slice(0, 2);
  return {
    configured: !!token && allow.length > 0,
    token,
    allow,
    timeoutMs: int(process.env["HF_TIMEOUT_MS"], 12_000, 2_000, 20_000),
    maxTokens: 300,
    hourly: int(process.env["HF_HOURLY_CAP"], 10, 0, 100),
    daily: int(process.env["HF_DAILY_CAP"], 30, 0, 500),
    globalDaily: int(process.env["HF_GLOBAL_DAILY_CAP"], 200, 0, 5000),
  };
}

async function usableModels() {
  const c = hfConfig();
  if (!c.configured || !c.token) return [];
  const key = c.allow.join(",");
  if (routeCache && routeCache.key === key && Date.now() - routeCache.at < 600_000)
    return routeCache.models;
  const models = await routableModels(fetch, c.token, c.allow, c.timeoutMs);
  routeCache = { at: Date.now(), key, models };
  return models;
}

export async function neuralStatus() {
  const c = hfConfig();
  const models = c.configured ? await usableModels() : [];
  return {
    engine: NEURAL_VERSION,
    hf: !c.configured
      ? "not-configured"
      : models.length
        ? "routable-unverified"
        : "configured-unroutable",
    models,
    caps: { hourly: c.hourly, daily: c.daily, globalDaily: c.globalDaily },
    arenaRequests: models.length * SAFE_FIXTURES,
    timeoutMs: c.timeoutMs,
  };
}

async function ctx(token: string) {
  const s = await requireSession(token);
  const { data: profile } = await db()
    .from("qli_agent_profiles")
    .select("id, hosted_inference_enabled")
    .eq("wallet", s.wallet)
    .eq("network", s.network)
    .maybeSingle();
  if (!profile) throw new Error("Create your QLi Agent profile first.");
  return { ...s, profileId: profile.id, hostedConsent: profile.hosted_inference_enabled };
}

async function localQuota(profileId: string) {
  const since = new Date(Date.now() - 3600_000).toISOString();
  const { count } = await db()
    .from("qli_neural_runs")
    .select("id", { count: "exact", head: true })
    .eq("profile_id", profileId)
    .gte("created_at", since);
  if ((count ?? 0) >= 120) throw new Error("Hourly Neural Engine quota reached. Try again later.");
}

/** Atomic all-or-nothing reservation (advisory-locked SQL). Reserved calls count even if they fail. */
async function reserve(profileId: string, n: number) {
  const c = hfConfig();
  const { data, error } = await db().rpc("qli_reserve_model_calls", {
    _profile: profileId,
    _n: n,
    _hourly: c.hourly,
    _daily: c.daily,
    _global_daily: c.globalDaily,
  });
  return !error && data === true;
}

async function log(
  profileId: string,
  kind: string,
  engine: "deterministic" | "hf",
  model: string | null,
  hash: string | null,
  latency: number,
  status: string,
) {
  await db().from("qli_neural_runs").insert({
    profile_id: profileId,
    kind,
    engine,
    model,
    record_hash: hash,
    latency_ms: latency,
    status,
  });
}

async function callHf(
  model: string,
  snapshot: Parameters<typeof hfChat>[0]["snapshot"],
  task: SafeTask,
) {
  const c = hfConfig();
  if (!c.configured || !c.token)
    return { ok: false as const, reason: "not-configured", latency: 0 };
  if (inflight >= MAX_CONCURRENT) return { ok: false as const, reason: "busy", latency: 0 };
  inflight++;
  try {
    return await hfChat({
      fetchImpl: fetch,
      token: c.token,
      model,
      snapshot,
      task,
      timeoutMs: c.timeoutMs,
      maxTokens: c.maxTokens,
    });
  } finally {
    inflight--;
  }
}

async function poolSnapshot(c: Awaited<ReturnType<typeof ctx>>, poolId: string) {
  const { data: pools } = await db()
    .from("qli_monitored_pools")
    .select("id")
    .eq("profile_id", c.profileId)
    .eq("network", c.network)
    .order("created_at");
  const idx = (pools ?? []).findIndex((p) => p.id === poolId);
  if (idx < 0) throw new Error("Pool is not registered to this wallet on this network.");
  const { data: obs } = await db()
    .from("qli_observations")
    .select("slot, observed_at, data")
    .eq("pool_id", poolId)
    .order("observed_at", { ascending: false })
    .limit(20);
  if (!obs?.length)
    throw new Error("No verified observation for this pool yet. Wait for the worker or refresh.");
  const latest = obs[0]!;
  const d = latest.data as Record<string, unknown>;
  const str = (k: string) => (typeof d[k] === "string" ? (d[k] as string) : undefined);
  const snapshot = toSnapshot(
    {
      network: c.network,
      slot: String(latest.slot),
      observedAt: Math.floor(Date.parse(latest.observed_at) / 1000),
      quoteIsSol: typeof d["quoteIsSol"] === "boolean" ? (d["quoteIsSol"] as boolean) : undefined,
      isMigrated: typeof d["isMigrated"] === "boolean" ? (d["isMigrated"] as boolean) : undefined,
      claimableQuote: str("claimableQuote"),
      quoteReserve: str("quoteReserve") ?? null,
      migrationThreshold: str("migrationThreshold") ?? null,
      progressPct: typeof d["progressPct"] === "number" ? (d["progressPct"] as number) : null,
      walletSol: str("walletSol"),
    },
    idx,
    Math.floor(Date.now() / 1000),
  );
  const history = obs.map((o) => {
    const q = (o.data as Record<string, unknown>)["quoteReserve"];
    return { slot: String(o.slot), quoteReserve: typeof q === "string" ? q : null };
  });
  return { snapshot, history };
}

export async function analyze(token: string, poolId: string, question: string, useModel: boolean) {
  const c = await ctx(token);
  await localQuota(c.profileId);
  const { snapshot } = await poolSnapshot(c, poolId);
  const det = deterministicAnswer(snapshot, question);
  const task = safeTask(question); // raw question is used locally only, never stored or sent
  let model: {
    model: string;
    status: string;
    answer: ReturnType<typeof deterministicAnswer> | null;
    latencyMs: number | null;
  } | null = null;
  if (useModel) {
    const models = c.hostedConsent && task ? await usableModels() : [];
    if (!c.hostedConsent)
      model = {
        model: "-",
        status: "not-sent:owner-consent-required",
        answer: null,
        latencyMs: null,
      };
    else if (!task)
      model = {
        model: "-",
        status: "not-sent:unsafe-or-unsupported-task",
        answer: null,
        latencyMs: null,
      };
    else if (!models.length)
      model = { model: "-", status: "not-sent:hosted-unavailable", answer: null, latencyMs: null };
    else if (!(await reserve(c.profileId, 1)))
      model = {
        model: models[0]!,
        status: "not-sent:budget-exhausted",
        answer: null,
        latencyMs: null,
      };
    else {
      const r = await callHf(models[0]!, snapshot, task);
      if (r.ok) {
        const v = validateModelOutput(r.raw, snapshot);
        model = {
          model: models[0]!,
          status: v.ok ? "validated" : `rejected:${v.reason}`,
          answer: v.ok ? v.answer : null,
          latencyMs: r.latency,
        };
      } else
        model = {
          model: models[0]!,
          status: `unavailable:${r.reason}`,
          answer: null,
          latencyMs: r.latency,
        };
    }
  }
  const record = await buildRecord({
    snapshot,
    engine: model?.answer
      ? { kind: "hf", id: model.model, version: "router-v1", provider: "huggingface" }
      : {
          kind: "deterministic",
          id: "qli-deterministic",
          version: NEURAL_VERSION,
          provider: "local",
        },
    answerHash: model?.answer ? await sha256HexOf(JSON.stringify(model.answer)) : null,
    validated: !!model?.answer,
    createdAt: Math.floor(Date.now() / 1000),
  });
  const sent = !!model && !model.status.startsWith("not-sent");
  await log(
    c.profileId,
    "analyze",
    sent ? "hf" : "deterministic",
    sent ? model!.model : null,
    record.hash,
    model?.latencyMs ?? 0,
    model?.status ?? "ok",
  );
  return { snapshot, task, deterministic: det, model, record };
}

export async function shadow(
  token: string,
  poolId: string,
  cfg: Omit<ShadowConfig, "quoteReserve" | "model">,
) {
  const c = await ctx(token);
  await localQuota(c.profileId);
  const { snapshot, history } = await poolSnapshot(c, poolId);
  const q = history[0]?.quoteReserve;
  if (!q || !/^\d+$/.test(q) || q === "0")
    throw new Error("Observed quote reserve unknown; Shadow needs a verified reserve.");
  const full: ShadowConfig = { ...cfg, model: "constant-product-hypothetical", quoteReserve: q };
  const result = runShadow(full);
  const record = await buildRecord({
    snapshot,
    engine: { kind: "deterministic", id: "qli-shadow", version: result.version, provider: "local" },
    answerHash: null,
    validated: false,
    simulationConfig: full,
    createdAt: Math.floor(Date.now() / 1000),
  });
  await log(c.profileId, "shadow", "deterministic", null, record.hash, 0, "ok");
  const age = snapshot.evidence.find((e) => e.kind === "age");
  return {
    result,
    drift: observedDrift(history),
    anchor: {
      quoteReserve: q,
      slot: snapshot.slot,
      observedAt: snapshot.observedAt,
      ageSeconds: age?.kind === "age" ? age.seconds : null,
      status: "observed-by-worker",
    },
    assumptions: full,
    record,
  };
}

export async function graph(token: string) {
  const c = await ctx(token);
  await localQuota(c.profileId);
  const [{ data: pools }, { data: vaults }] = await Promise.all([
    db()
      .from("qli_monitored_pools")
      .select(
        "id, pool, creator, base_mint, quote_mint, last_slot, last_observed_at, consecutive_errors, network",
      )
      .eq("profile_id", c.profileId),
    db()
      .from("qli_monitored_vaults")
      .select(
        "id, vault, owner, mint, program_id, program_sha256, upgrade_authority, last_slot, last_observed_at",
      )
      .eq("profile_id", c.profileId),
  ]);
  await log(c.profileId, "graph", "deterministic", null, null, 0, "ok");
  return buildGraph(c.wallet, c.network, pools ?? [], vaults ?? []);
}

export async function arena(token: string, confirmCharges: boolean) {
  const c = await ctx(token);
  const baseline = runBaseline();
  if (!confirmCharges) throw new Error("Hosted comparison requires explicit confirmation.");
  if (!c.hostedConsent)
    throw new Error(
      "Enable hosted inference consent in your authenticated operator profile first.",
    );
  const models = await usableModels();
  if (!models.length) return { baseline, hosted: [], requested: 0 };
  const total = models.length * SAFE_FIXTURES;
  if (!(await reserve(c.profileId, total)))
    throw new Error(`Budget does not allow ${total} hosted requests now. No requests were sent.`);
  const hosted = [];
  for (const m of models) {
    const scores = [];
    for (const f of FIXTURES) {
      const task = safeTask(f.question);
      if (!task) {
        // Refusal fixtures are scored locally; nothing is sent for unsafe tasks.
        scores.push({
          ...scoreAnswer(f, JSON.stringify(deterministicAnswer(f.snapshot, f.question)), 0),
          id: `${f.id} (local refusal)`,
        });
        continue;
      }
      const r = await callHf(m, f.snapshot, task);
      scores.push(
        r.ok
          ? scoreAnswer(f, r.raw, r.latency)
          : {
              id: f.id,
              valid: false,
              correct: false,
              cited: false,
              hallucination: false,
              refusalOk: false,
              latencyMs: r.latency,
            },
      );
    }
    hosted.push(summarize(m, scores));
    await log(c.profileId, "arena", "hf", m, null, 0, "ok");
  }
  return { baseline, hosted, requested: total };
}