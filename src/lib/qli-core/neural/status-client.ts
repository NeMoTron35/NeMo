// Client-safe parsing of the public Neural Engine status. Only booleans,
// enums, numeric caps and allowlisted model ids are accepted; anything else
// (including any token-like field) is dropped. Failures map to "unavailable".
export type HfState = "not-configured" | "configured-unroutable" | "routable-unverified";
export type NeuralStatus =
  | {
      ok: true;
      engine: string;
      hf: HfState;
      models: string[];
      arenaRequests: number;
      caps: { hourly: number; daily: number; globalDaily: number };
    }
  | { ok: false; reason: "unavailable" | "invalid" };

const MODEL_RE = /^[A-Za-z0-9._-]{1,64}\/[A-Za-z0-9._:-]{1,96}$/;
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : 0);

export function parseNeuralStatus(raw: unknown): NeuralStatus {
  if (!raw || typeof raw !== "object") return { ok: false, reason: "invalid" };
  const r = raw as Record<string, unknown>;
  const hf = r["hf"];
  if (hf !== "not-configured" && hf !== "configured-unroutable" && hf !== "routable-unverified")
    return { ok: false, reason: "invalid" };
  const models = Array.isArray(r["models"])
    ? (r["models"] as unknown[])
        .filter((m): m is string => typeof m === "string" && MODEL_RE.test(m))
        .slice(0, 2)
    : [];
  const caps = (r["caps"] ?? {}) as Record<string, unknown>;
  const effective: HfState =
    hf === "routable-unverified" && models.length === 0 ? "configured-unroutable" : hf;
  return {
    ok: true,
    engine: typeof r["engine"] === "string" ? (r["engine"] as string).slice(0, 40) : "unknown",
    hf: effective,
    models: effective === "routable-unverified" ? models : [],
    arenaRequests: effective === "routable-unverified" ? num(r["arenaRequests"]) : 0,
    caps: {
      hourly: num(caps["hourly"]),
      daily: num(caps["daily"]),
      globalDaily: num(caps["globalDaily"]),
    },
  };
}

export async function fetchNeuralStatus(
  f: typeof fetch = fetch,
  timeoutMs = 8000,
): Promise<NeuralStatus> {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await f("/api/public/neural-status", {
      method: "GET",
      cache: "no-store",
      headers: { accept: "application/json" },
      signal: ac.signal,
    });
    if (!res.ok) return { ok: false, reason: "unavailable" };
    return parseNeuralStatus(await res.json());
  } catch {
    return { ok: false, reason: "unavailable" };
  } finally {
    clearTimeout(t);
  }
}

export function hfLabel(s: NeuralStatus | null): string {
  if (s === null) return "Checking status — deterministic tools only";
  if (!s.ok) return "Status unavailable — deterministic tools only";
  if (s.hf === "routable-unverified")
    return `Hugging Face models routable (${s.models.join(", ")}) — no validated answer observed yet`;
  if (s.hf === "configured-unroutable")
    return "Hugging Face configured but no allowlisted model is routable — deterministic engine only";
  return "Hugging Face not configured — deterministic engine only";
}

export const isRoutable = (s: NeuralStatus | null) => !!s && s.ok && s.hf === "routable-unverified";

export const OPERATOR_HELP =
  "For optional hosted inference: configure HF_TOKEN and HF_MODEL_ALLOWLIST in Project Settings > Secrets";