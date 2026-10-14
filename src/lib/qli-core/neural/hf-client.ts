// Pure Hugging Face router client. The outbound body is built ONLY from a fixed task enum,
// fixed policy text and schema-validated numeric evidence. User text never leaves the server.
import { SYSTEM_PROMPT, snapshotSchema, type Snapshot } from "./engine";

export const HF_ENDPOINT = "https://router.huggingface.co/v1/chat/completions";
export const HF_MODELS_ENDPOINT = "https://router.huggingface.co/v1/models";
export const SAFE_TASKS = ["fees", "migration", "reserve", "freshness"] as const;
export type SafeTask = (typeof SAFE_TASKS)[number];
const TASK_TEXT: Record<SafeTask, string> = {
  fees: "Report claimable quote fees.",
  migration: "Report migration status and progress against the threshold.",
  reserve: "Report the observed quote reserve.",
  freshness: "Report observation slot and age.",
};
const MODEL_ID = /^[A-Za-z0-9][\w.-]{0,63}\/[\w.-]{1,96}(:[\w.-]{1,40})?$/;
const BASE58_LONG = /[1-9A-HJ-NP-Za-km-z]{32,}/;
const EVIDENCE_LABELS = [
  "Claimable quote fees",
  "Pool quote reserve",
  "Migration threshold",
  "Owner wallet SOL",
  "Migration progress %",
  "Pool migrated",
  "Observation age",
] as const;

export function isModelId(m: string) {
  return MODEL_ID.test(m);
}

/** Re-serializes evidence field-by-field from the validated schema; nothing else is copied. */
export function buildHfBody(model: string, snapshot: Snapshot, task: SafeTask, maxTokens: number) {
  if (!isModelId(model)) throw new Error("Invalid model id.");
  if (!(SAFE_TASKS as readonly string[]).includes(task)) throw new Error("Unsupported task.");
  const s = snapshotSchema.parse(snapshot);
  // Even innocuous-looking injected metadata is not allowed across the provider boundary.
  if (
    s.evidence.length !== EVIDENCE_LABELS.length ||
    s.evidence.some(
      (e, i) =>
        e.id !== `E${i + 1}` ||
        e.label !== EVIDENCE_LABELS[i] ||
        (e.kind === "amount" && e.unit !== "SOL"),
    )
  )
    throw new Error("Noncanonical evidence rejected.");
  const evidence = s.evidence.map((e) =>
    e.kind === "amount"
      ? { id: e.id, kind: e.kind, label: e.label, value: e.value, unit: e.unit }
      : e.kind === "ratio" || e.kind === "flag"
        ? { id: e.id, kind: e.kind, label: e.label, value: e.value }
        : e.kind === "age"
          ? { id: e.id, kind: e.kind, label: e.label, seconds: e.seconds }
          : { id: e.id, kind: e.kind, label: e.label },
  );
  const body = {
    model,
    max_tokens: maxTokens,
    temperature: 0,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: `TASK=${task}: ${TASK_TEXT[task]}\nEVIDENCE=${JSON.stringify(evidence)}\nSLOT=${s.slot ?? "unknown"}`,
      },
    ],
  };
  assertSafeOutbound(body, model);
  return body;
}

/** Fails closed if anything address/secret-like appears in the outbound body (model id excluded). */
export function assertSafeOutbound(body: { messages: { content: string }[] }, model: string) {
  for (const m of body.messages) {
    if (BASE58_LONG.test(m.content))
      throw new Error("Outbound payload contains an address-like value.");
    if (
      /seed|mnemonic|private|password|bearer|token|cookie/i.test(
        m.content.replace(SYSTEM_PROMPT, ""),
      )
    )
      throw new Error("Outbound payload contains sensitive wording.");
  }
  if (!isModelId(model)) throw new Error("Invalid model id.");
}

export type HfResult =
  { ok: true; raw: string; latency: number } | { ok: false; reason: string; latency: number };

export async function hfChat(opts: {
  fetchImpl: typeof fetch;
  token: string;
  model: string;
  snapshot: Snapshot;
  task: SafeTask;
  timeoutMs: number;
  maxTokens: number;
}): Promise<HfResult> {
  const body = buildHfBody(opts.model, opts.snapshot, opts.task, opts.maxTokens);
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), opts.timeoutMs);
  const t0 = Date.now();
  try {
    const res = await opts.fetchImpl(HF_ENDPOINT, {
      method: "POST",
      signal: ctl.signal,
      headers: { Authorization: `Bearer ${opts.token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) return { ok: false, reason: `http-${res.status}`, latency: Date.now() - t0 };
    const j = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const raw = j.choices?.[0]?.message?.content;
    if (typeof raw !== "string" || raw.length > 16000)
      return { ok: false, reason: "invalid-response", latency: Date.now() - t0 };
    return { ok: true, raw, latency: Date.now() - t0 };
  } catch {
    return { ok: false, reason: "timeout-or-network", latency: Date.now() - t0 };
  } finally {
    clearTimeout(timer);
  }
}

/** Intersects the operator allowlist with models the router actually lists (no inference cost). */
export async function routableModels(
  fetchImpl: typeof fetch,
  token: string,
  allow: string[],
  timeoutMs: number,
) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetchImpl(HF_MODELS_ENDPOINT, {
      headers: { Authorization: `Bearer ${token}` },
      signal: ctl.signal,
    });
    if (!res.ok) return [];
    const j = (await res.json()) as { data?: { id?: string }[] };
    const listed = new Set((j.data ?? []).map((m) => String(m.id ?? "")));
    // A listed base model does not attest a caller-selected provider suffix.
    return allow.filter((m) => isModelId(m) && listed.has(m));
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}
