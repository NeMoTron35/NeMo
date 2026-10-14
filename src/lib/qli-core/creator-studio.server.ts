// Creator Studio server logic. Every call verifies a wallet-signed session and scopes every
// query by that session's wallet + network. Tables are service-role only (no browser grants).
// Nothing here builds, signs or sends transactions, or posts to any social platform.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { requireSession } from "./agent-v2.server";
import { intelligence } from "./lifecycle.server";
import {
  canTransition,
  draftPack,
  evidenceCards,
  groundedAnswer,
  provenanceHash,
  scanClaims,
  type PackContent,
  type PackStatus,
  type PersonaInput,
  type WorkflowKind,
  type WorkflowStep,
} from "./creator-studio";
import type { Snapshot } from "./lifecycle";

const db = () => supabaseAdmin;
const fail = (m: string): never => {
  throw new Error(m);
};
/** Throw an explicit error for any failed or zero-row write; never report silent success. */
function must<T extends { error: unknown; data?: unknown }>(r: T, what: string): T {
  if (r.error) fail(`Could not ${what}. Nothing was changed.`);
  if ("data" in r && Array.isArray(r.data) && r.data.length === 0)
    fail(`Could not ${what}: not found for this wallet.`);
  return r;
}
const recent = new Map<string, number[]>();
function throttle(wallet: string, perMin = 30) {
  const now = Date.now();
  const list = (recent.get(wallet) ?? []).filter((t) => now - t < 60_000);
  if (list.length >= perMin) fail("Too many Creator Studio actions. Wait a minute.");
  list.push(now);
  recent.set(wallet, list);
}
async function owner(token: string) {
  const s = await requireSession(token);
  throttle(s.wallet);
  return s;
}
async function ownPersona(o: { wallet: string; network: string }, id: string) {
  const { data } = await db()
    .from("qli_creator_personas")
    .select("*")
    .eq("id", id)
    .eq("owner_wallet", o.wallet)
    .eq("network", o.network)
    .maybeSingle();
  return data ?? fail("Persona not found for this wallet.");
}

export async function state(token: string) {
  const o = await owner(token);
  const scope = <T extends { eq: (k: string, v: string) => T }>(q: T) =>
    q.eq("owner_wallet", o.wallet).eq("network", o.network);
  const [p, k, w, q] = await Promise.all([
    scope(db().from("qli_creator_personas").select("*")).order("created_at").limit(10),
    scope(db().from("qli_creator_packs").select("*"))
      .order("updated_at", { ascending: false })
      .limit(50),
    scope(db().from("qli_creator_workflows").select("*"))
      .order("created_at", { ascending: false })
      .limit(20),
    scope(db().from("qli_creator_qa").select("*"))
      .order("created_at", { ascending: false })
      .limit(50),
  ]);
  if (p.error || k.error || w.error || q.error)
    fail("Creator Studio storage is unavailable. Nothing was loaded; try again.");
  return {
    wallet: o.wallet,
    network: o.network,
    personas: p.data ?? [],
    packs: k.data ?? [],
    workflows: w.data ?? [],
    qa: q.data ?? [],
  };
}

export async function savePersona(token: string, id: string | null, input: PersonaInput) {
  const o = await owner(token);
  const { pool, poolNetwork, handle, ...rest } = input;
  if ((pool === null) !== (poolNetwork === null))
    fail("Pool and pool network must be set together.");
  const row = {
    handle,
    data: rest,
    pool,
    pool_network: poolNetwork,
    updated_at: new Date().toISOString(),
  };
  if (id) {
    await ownPersona(o, id);
    must(
      await db()
        .from("qli_creator_personas")
        .update(row)
        .eq("id", id)
        .eq("owner_wallet", o.wallet)
        .eq("network", o.network)
        .select("id"),
      "save the persona (handle may already be used)",
    );
    return { id };
  }
  const { data, error } = await db()
    .from("qli_creator_personas")
    .insert({ ...row, owner_wallet: o.wallet, network: o.network })
    .select("id")
    .single();
  if (error || !data)
    fail(
      error?.message.includes("quota")
        ? "Persona quota (10) reached."
        : error?.code === "23505"
          ? "Handle already used."
          : "Could not save persona.",
    );
  return { id: data!.id };
}
export async function archivePersona(token: string, id: string, archived: boolean) {
  const o = await owner(token);
  await ownPersona(o, id);
  must(
    await db()
      .from("qli_creator_personas")
      .update({ archived })
      .eq("id", id)
      .eq("owner_wallet", o.wallet)
      .eq("network", o.network)
      .select("id"),
    "save the change",
  );
}
export async function deletePersona(token: string, id: string) {
  const o = await owner(token);
  await ownPersona(o, id);
  must(
    await db()
      .from("qli_creator_personas")
      .delete()
      .eq("id", id)
      .eq("owner_wallet", o.wallet)
      .eq("network", o.network)
      .select("id"),
    "save the change",
  );
}

async function verifiedSnapshot(pool: string | null, network: string | null) {
  if (!pool || !network)
    return {
      snap: null as Snapshot | null,
      digest: null as string | null,
      err: null as string | null,
    };
  const r = await intelligence(network as "devnet" | "mainnet-beta", pool);
  return r.ok
    ? { snap: r.snapshot, digest: r.digest, err: null }
    : { snap: null, digest: null, err: r.message };
}

/** Explicit user-triggered workflow. Fails closed when a linked pool cannot be verified. */
export async function runWorkflow(token: string, personaId: string, kind: WorkflowKind) {
  const o = await owner(token);
  const persona = await ownPersona(o, personaId);
  const steps: WorkflowStep[] = [];
  const at = () => new Date().toISOString();
  const d = persona.data as Record<string, string>;
  const { snap, digest, err } = await verifiedSnapshot(persona.pool, persona.pool_network);
  if (persona.pool && !snap) {
    steps.push({
      name: "Refresh pool evidence",
      status: "failed",
      detail: err ?? "Unverified.",
      at: at(),
    });
    must(
      await db().from("qli_creator_workflows").insert({
        persona_id: personaId,
        owner_wallet: o.wallet,
        network: o.network,
        kind,
        status: "failed",
        steps,
      }),
      "record the workflow",
    );
    return { ok: false as const, steps };
  }
  steps.push({
    name: "Refresh pool evidence",
    status: snap ? "ok" : "skipped",
    detail: snap
      ? `Verified ${snap.network} slot ${snap.observedSlot}, digest ${digest!.slice(0, 12)}…`
      : "No pool linked; draft contains no on-chain statements.",
    at: at(),
  });
  const content: PackContent = draftPack(
    kind,
    {
      name: d["name"] ?? "",
      handle: persona.handle,
      voice: d["voice"] ?? "",
      aesthetic: d["aesthetic"] ?? "",
    },
    snap,
  );
  steps.push({
    name: "Draft persona story",
    status: "ok",
    detail: "Deterministic templates (no hosted model called).",
    at: at(),
  });
  const cards = evidenceCards(snap, digest);
  const findings = scanClaims([content.script, ...content.captions, ...content.xPosts], cards);
  const flagged = findings.filter(
    (f) => f.verdict === "promotional" || f.verdict === "unsupported-fact",
  ).length;
  steps.push({
    name: "Scan claims",
    status: "ok",
    detail: `${findings.length} sentences, ${flagged} flagged.`,
    at: at(),
  });
  const hash = await provenanceHash(content, cards);
  const { data: pack } = await db()
    .from("qli_creator_packs")
    .insert({
      persona_id: personaId,
      owner_wallet: o.wallet,
      network: o.network,
      title: kind === "launch-pack" ? "Launch announcement pack" : "Weekly pool update",
      content,
      evidence: { cards, findings },
      provenance_hash: hash,
    })
    .select("id")
    .single();
  steps.push({
    name: "Queue for approval",
    status: pack ? "ok" : "failed",
    detail: pack ? "Draft queued; publishing stays manual." : "Could not save draft (quota?).",
    at: at(),
  });
  must(
    await db()
      .from("qli_creator_workflows")
      .insert({
        persona_id: personaId,
        owner_wallet: o.wallet,
        network: o.network,
        kind,
        status: pack ? "completed" : "failed",
        steps,
        pack_id: pack?.id ?? null,
      }),
    "record the workflow",
  );
  return { ok: !!pack, steps };
}

async function ownPack(o: { wallet: string; network: string }, id: string) {
  const { data } = await db()
    .from("qli_creator_packs")
    .select("*")
    .eq("id", id)
    .eq("owner_wallet", o.wallet)
    .eq("network", o.network)
    .maybeSingle();
  return data ?? fail("Draft not found for this wallet.");
}
export async function updatePack(token: string, id: string, content: PackContent) {
  const o = await owner(token);
  const pack = await ownPack(o, id);
  const ev =
    (pack.evidence as { cards?: Parameters<typeof provenanceHash>[1] } | null)?.cards ?? [];
  const findings = scanClaims([content.script, ...content.captions, ...content.xPosts], ev);
  const hash = await provenanceHash(content, ev);
  // Any edit returns the pack to draft: approval always covers the exact bytes.
  must(
    await db()
      .from("qli_creator_packs")
      .update({
        content,
        evidence: { cards: ev, findings },
        provenance_hash: hash,
        status: "draft",
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("owner_wallet", o.wallet)
      .eq("network", o.network)
      .select("id"),
    "save the change",
  );
}
export async function setPackStatus(token: string, id: string, to: PackStatus) {
  const o = await owner(token);
  const pack = await ownPack(o, id);
  if (!canTransition(pack.status as PackStatus, to))
    fail(`Cannot move from ${pack.status} to ${to}.`);
  if (to === "approved") {
    const c = pack.content as PackContent;
    if (!c.checklist.every((x) => x.done)) fail("Complete the review checklist before approving.");
  }
  must(
    await db()
      .from("qli_creator_packs")
      .update({ status: to, updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("owner_wallet", o.wallet)
      .eq("network", o.network)
      .select("id"),
    "save the change",
  );
}
export async function deletePack(token: string, id: string) {
  const o = await owner(token);
  await ownPack(o, id);
  must(
    await db()
      .from("qli_creator_packs")
      .delete()
      .eq("id", id)
      .eq("owner_wallet", o.wallet)
      .eq("network", o.network)
      .select("id"),
    "save the change",
  );
}

export async function askQuestion(token: string, personaId: string, question: string) {
  const o = await owner(token);
  const persona = await ownPersona(o, personaId);
  const { snap } = await verifiedSnapshot(persona.pool, persona.pool_network);
  const a = groundedAnswer(question, snap);
  const { error } = await db().from("qli_creator_qa").insert({
    persona_id: personaId,
    owner_wallet: o.wallet,
    network: o.network,
    question,
    answer: a.answer,
    grounded: a.grounded,
  });
  if (error) fail("Could not save question (quota?).");
}
export async function moderate(token: string, id: string, status: "approved" | "rejected") {
  const o = await owner(token);
  const { data } = await db()
    .from("qli_creator_qa")
    .update({ status })
    .eq("id", id)
    .eq("owner_wallet", o.wallet)
    .eq("network", o.network)
    .select("id")
    .maybeSingle();
  if (!data) fail("Question not found for this wallet.");
}
