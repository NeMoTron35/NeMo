import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Download, LogIn, Pause, Play, RefreshCw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Panel, Field } from "./controls";
import { useConsole } from "@/lib/qli-core/context";
import { signDerivationMessage } from "@/lib/qli-core/wallet";
import { v2Challenge, v2Verify } from "@/lib/qli-core/agent-v2.functions";
import { getPoolIntelligence } from "@/lib/qli-core/lifecycle.functions";
import type { Snapshot } from "@/lib/qli-core/lifecycle";
import {
  AI_DISCLOSURE,
  SAFETY_TEXT,
  draftPack,
  evidenceCards,
  personaSchema,
  personaTheme,
  provenanceHash,
  scanClaims,
  scanText,
  type EvidenceCard,
  type PackContent,
  type PackStatus,
  type PersonaInput,
} from "@/lib/qli-core/creator-studio";
import {
  csArchivePersona,
  csAsk,
  csDeletePack,
  csDeletePersona,
  csModerate,
  csPackStatus,
  csRunWorkflow,
  csSavePersona,
  csState,
  csUpdatePack,
} from "@/lib/qli-core/creator-studio.functions";

type St = Awaited<ReturnType<typeof csState>>;
type Tab = "persona" | "media" | "proof" | "community";
const blank: PersonaInput = {
  name: "",
  handle: "",
  personality: "",
  aesthetic: "",
  voice: "",
  bible: "",
  avatarRef: "monogram",
  pool: null,
  poolNetwork: null,
};
const ago = (s: string) => {
  const m = Math.round((Date.now() - Date.parse(s)) / 60000);
  return m < 1 ? "just now" : m < 60 ? `${m} min ago` : `${Math.round(m / 60)} h ago`;
};

function Avatar({ handle, art: r }: { handle: string; art?: "hero" | "monogram" }) {
  const t = personaTheme(handle);
  return (
    <div
      className="cs-avatar"
      aria-label={`Template avatar for ${handle || "new persona"}`}
      style={{
        background:
          r === "hero"
            ? `url(/quantum-qli-hero.webp) center/cover`
            : `radial-gradient(circle at 30% 25%, ${t.primary}, ${t.secondary} 60%, ${t.accent})`,
      }}
    >
      {r !== "hero" && <span>{t.monogram}</span>}
    </div>
  );
}

function Storyboard({ content, handle }: { content: PackContent; handle: string }) {
  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(false);
  const total = content.shots.reduce((m, s) => Math.max(m, s.t + s.dur), 0);
  const reduce =
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  const raf = useRef<number | null>(null);
  useEffect(() => {
    if (!playing) return;
    let last = performance.now();
    const tick = (now: number) => {
      setT((x) => {
        const n = x + (now - last) / 1000;
        last = now;
        if (n >= total) {
          setPlaying(false);
          return total;
        }
        return n;
      });
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current);
    };
  }, [playing, total]);
  const shot = content.shots.find((s) => t >= s.t && t < s.t + s.dur) ?? content.shots.at(-1);
  const theme = personaTheme(handle);
  return (
    <div className="cs-story">
      <div
        className={`cs-frame ${reduce ? "" : "cs-fade"}`}
        key={shot?.t}
        style={{ borderColor: theme.primary }}
        aria-live="polite"
      >
        <Avatar handle={handle} />
        <p className="cs-frame-text">{shot?.text}</p>
        <small className="cs-frame-visual">{shot?.visual}</small>
        <span className="cs-disclosure">
          {AI_DISCLOSURE} · @{handle || "persona"}
        </span>
      </div>
      <div className="cs-timeline">
        <Button
          size="sm"
          variant="outline"
          onClick={() => (t >= total ? (setT(0), setPlaying(true)) : setPlaying(!playing))}
        >
          {playing ? <Pause size={14} /> : <Play size={14} />} {playing ? "Pause" : "Preview"}
        </Button>
        <input
          type="range"
          min={0}
          max={total}
          step={0.1}
          value={t}
          onChange={(e) => setT(Number(e.target.value))}
          aria-label="Storyboard time"
        />
        <span className="micro">
          {t.toFixed(1)}s / {total}s
        </span>
      </div>
      <ol className="cs-shots">
        {content.shots.map((s, i) => (
          <li key={i} className={s === shot ? "active" : ""}>
            <button type="button" onClick={() => setT(s.t)}>
              <b>
                {s.t}s–{s.t + s.dur}s
              </b>{" "}
              {s.text}
              {s.evidenceRef && <span className="cs-chip derived">{s.evidenceRef}</span>}
            </button>
          </li>
        ))}
      </ol>
      <p className="micro">
        MP4 export not configured. Use the 9:16 storyboard JSON or script export.
      </p>
    </div>
  );
}

function EvidenceList({ cards }: { cards: EvidenceCard[] }) {
  if (!cards.length)
    return (
      <p className="cs-empty">
        No verified pool evidence. Cards appear only after a successful Solana RPC read of a Meteora
        DBC pool.
      </p>
    );
  const t = cards[0]!.trace!;
  return (
    <div>
      <p className="micro">
        Verified on {t.network} · slot {t.slot} · source {t.rpc} · program {t.program.slice(0, 8)}…
        · snapshot digest {t.digest.slice(0, 16)}…
      </p>
      <ul className="cs-cards">
        {cards.map((c) => (
          <li key={c.id}>
            <span className={`cs-chip ${c.kind}`}>
              {c.kind === "confirmed" ? "A · confirmed" : "B · derived"}
            </span>
            <b>{c.id}</b> {c.label}
            <code>{c.value}</code>
          </li>
        ))}
        <li>
          <span className="cs-chip estimate">C · estimate</span> Quote estimates live in{" "}
          <Link to="/meteora-intelligence">DBC Lifecycle Intelligence</Link>; never copied as fact.
        </li>
        <li>
          <span className="cs-chip creative">D · creative</span> All story, captions and posts are
          creative copy, never labelled verified.
        </li>
      </ul>
    </div>
  );
}

export function CreatorStudio() {
  const c = useConsole();
  const fns = {
    challenge: useServerFn(v2Challenge),
    verify: useServerFn(v2Verify),
    state: useServerFn(csState),
    save: useServerFn(csSavePersona),
    archive: useServerFn(csArchivePersona),
    delPersona: useServerFn(csDeletePersona),
    run: useServerFn(csRunWorkflow),
    update: useServerFn(csUpdatePack),
    status: useServerFn(csPackStatus),
    delPack: useServerFn(csDeletePack),
    ask: useServerFn(csAsk),
    moderate: useServerFn(csModerate),
    intel: useServerFn(getPoolIntelligence),
  };
  const wallet = c.account?.address ?? null;
  const [token, setToken] = useState<string | null>(null);
  const [st, setSt] = useState<St | null>(null);
  const [tab, setTab] = useState<Tab>("persona");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [sel, setSel] = useState<string | null>(null);
  const [form, setForm] = useState<PersonaInput>(blank);
  const [packId, setPackId] = useState<string | null>(null);
  const [edit, setEdit] = useState<PackContent | null>(null);
  const [question, setQuestion] = useState("");
  const [confirmDel, setConfirmDel] = useState<string | null>(null);
  // Tour mode (signed out): local, in-memory only, never persisted.
  const [tourPack, setTourPack] = useState<PackContent | null>(null);
  const [snap, setSnap] = useState<{ s: Snapshot; digest: string } | null>(null);
  const [snapErr, setSnapErr] = useState("");
  const [hash, setHash] = useState("");

  useEffect(() => {
    setToken(null);
    setSt(null);
  }, [wallet, c.network]);

  const refresh = useCallback(
    async (t = token) => {
      if (!t) return;
      const s = await fns.state({ data: { token: t } });
      setSt(s);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [token],
  );
  const act = async (f: () => Promise<unknown>, ok?: string) => {
    setBusy(true);
    setMsg("");
    try {
      await f();
      await refresh();
      if (ok) setMsg(ok);
    } catch (e) {
      setMsg((e as Error).message);
      if (/Session|signed in/i.test((e as Error).message)) setToken(null);
    } finally {
      setBusy(false);
    }
  };

  async function signIn() {
    if (!wallet || !c.wallet || !c.account) return;
    await act(async () => {
      const ch = await fns.challenge({ data: { wallet, network: c.network } });
      // Off-chain message signature only; this is not a transaction.
      const sig = await signDerivationMessage(c.wallet!, c.account!, ch.message);
      const s = await fns.verify({
        data: { wallet, nonce: ch.nonce, signature: btoa(String.fromCharCode(...sig)) },
      });
      if (s.wallet !== wallet || s.network !== c.network) throw new Error("Session mismatch.");
      setToken(s.token);
      await refresh(s.token);
    });
  }

  const persona = st?.personas.find((p) => p.id === sel) ?? null;
  const packs = useMemo(
    () => (st?.packs ?? []).filter((p) => !sel || p.persona_id === sel),
    [st, sel],
  );
  const pack = st?.packs.find((p) => p.id === packId) ?? null;
  const content: PackContent | null =
    edit ?? (pack?.content as PackContent | undefined) ?? tourPack;
  const cards = useMemo<EvidenceCard[]>(() => {
    if (pack) return (pack.evidence as { cards?: EvidenceCard[] } | null)?.cards ?? [];
    return evidenceCards(snap?.s ?? null, snap?.digest ?? null);
  }, [pack, snap]);
  const findings = useMemo(
    () =>
      content ? scanClaims([content.script, ...content.captions, ...content.xPosts], cards) : [],
    [content, cards],
  );
  useEffect(() => {
    if (content) void provenanceHash(content, cards).then(setHash);
    else setHash("");
  }, [content, cards]);

  function pick(id: string | null) {
    setSel(id);
    setPackId(null);
    setEdit(null);
    const p = st?.personas.find((x) => x.id === id);
    setForm(
      p
        ? {
            ...blank,
            ...(p.data as Partial<PersonaInput>),
            handle: p.handle,
            pool: p.pool,
            poolNetwork: p.pool_network as PersonaInput["poolNetwork"],
          }
        : blank,
    );
  }

  const parsed = personaSchema.safeParse(form);
  const issues = [
    ...new Set(Object.values(form).flatMap((v) => (typeof v === "string" ? scanText(v) : []))),
  ];

  async function verifyPool() {
    setSnap(null);
    setSnapErr("");
    if (!form.pool || !form.poolNetwork) return setSnapErr("Enter a pool address and network.");
    setBusy(true);
    try {
      const r = await fns.intel({ data: { network: form.poolNetwork, pool: form.pool } });
      if (r.ok) setSnap({ s: r.snapshot, digest: r.digest });
      else setSnapErr(r.message);
    } catch {
      setSnapErr("Lookup failed. Nothing was verified.");
    } finally {
      setBusy(false);
    }
  }

  function exportJson() {
    if (!content) return;
    const blob = new Blob(
      [
        JSON.stringify(
          {
            format: "qli-creator-storyboard-v1",
            aspect: "9:16",
            persona: form.handle || persona?.handle,
            disclosure: AI_DISCLOSURE,
            content,
            evidence: cards,
            claims: findings,
            provenance: {
              hash,
              note: "Integrity checksum only; not a signature or on-chain attestation.",
            },
          },
          null,
          2,
        ),
      ],
      { type: "application/json" },
    );
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `qli-storyboard-${form.handle || "draft"}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  const signedIn = !!token && !!st;
  const handle = form.handle || persona?.handle || "";

  return (
    <div className="cs-root">
      <div className="cs-banner" role="note">
        <b>{signedIn ? "Owner workspace" : "Tour mode"}</b>{" "}
        {signedIn
          ? `Signed in as ${st!.wallet.slice(0, 4)}…${st!.wallet.slice(-4)} on ${st!.network}. Drafts persist to your wallet-scoped workspace.`
          : "Drafts stay in this tab only and are never saved. Sign in with a wallet message (not a transaction) to persist personas and packs."}
        {!signedIn && (
          <Button
            size="sm"
            onClick={signIn}
            disabled={!wallet || busy}
            title={!wallet ? "Connect a wallet first" : undefined}
          >
            <LogIn size={14} /> {wallet ? "Sign in with wallet" : "Connect wallet to sign in"}
          </Button>
        )}
        <span className="micro">
          Model status: deterministic templates only. Hosted Hugging Face generation not enabled for
          Creator Studio.
        </span>
      </div>

      <div className="cs-layout">
        <aside className="cs-sources" aria-label="Creator Studio sections">
          {(["persona", "media", "proof", "community"] as Tab[]).map((t) => (
            <button
              key={t}
              type="button"
              className={tab === t ? "active" : ""}
              onClick={() => setTab(t)}
              aria-pressed={tab === t}
            >
              {
                {
                  persona: "Persona",
                  media: "Media & Reels",
                  proof: "Proof",
                  community: "Community",
                }[t]
              }
            </button>
          ))}
          <div className="cs-personas">
            <span className="micro">PERSONAS</span>
            {signedIn ? (
              <>
                {st!.personas.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    className={p.id === sel ? "active" : ""}
                    onClick={() => pick(p.id)}
                  >
                    @{p.handle}
                    {p.archived ? " (archived)" : ""}
                  </button>
                ))}
                <button type="button" onClick={() => pick(null)}>
                  + New persona
                </button>
              </>
            ) : (
              <span className="cs-empty">Sign in to list saved personas.</span>
            )}
          </div>
        </aside>

        <main className="cs-main">
          {tab === "persona" && (
            <Panel title="Agentic Identity" tag="ORIGINAL CHARACTERS ONLY">
              <div className="cs-persona-head">
                <Avatar handle={handle} art={form.avatarRef} />
                <div>
                  <b>{form.name || "Unnamed persona"}</b>{" "}
                  <span className="micro">@{handle || "handle"}</span>
                  <p className="micro">
                    Preview generated from templates, not model media. {AI_DISCLOSURE}.
                  </p>
                </div>
              </div>
              <div className="cs-grid">
                <Field label="Name">
                  <input
                    value={form.name}
                    maxLength={40}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                  />
                </Field>
                <Field label="Handle" hint="3-24 lowercase letters, digits, underscore">
                  <input
                    value={form.handle}
                    maxLength={24}
                    onChange={(e) => setForm({ ...form, handle: e.target.value.toLowerCase() })}
                  />
                </Field>
                <Field label="Personality">
                  <textarea
                    rows={2}
                    maxLength={400}
                    value={form.personality}
                    onChange={(e) => setForm({ ...form, personality: e.target.value })}
                  />
                </Field>
                <Field label="Aesthetic direction">
                  <textarea
                    rows={2}
                    maxLength={300}
                    value={form.aesthetic}
                    onChange={(e) => setForm({ ...form, aesthetic: e.target.value })}
                  />
                </Field>
                <Field label="Content voice">
                  <textarea
                    rows={2}
                    maxLength={300}
                    value={form.voice}
                    onChange={(e) => setForm({ ...form, voice: e.target.value })}
                  />
                </Field>
                <Field label="Character bible">
                  <textarea
                    rows={4}
                    maxLength={2000}
                    value={form.bible}
                    onChange={(e) => setForm({ ...form, bible: e.target.value })}
                  />
                </Field>
                <Field label="Avatar">
                  <select
                    value={form.avatarRef}
                    onChange={(e) =>
                      setForm({ ...form, avatarRef: e.target.value as "hero" | "monogram" })
                    }
                  >
                    <option value="monogram">Template monogram</option>
                    <option value="hero">QuantumQLi cosmic artwork</option>
                  </select>
                </Field>
                <Field label="Palette (template)">
                  <div className="cs-palette">
                    {(["primary", "secondary", "accent"] as const).map((k) => (
                      <span key={k} style={{ background: personaTheme(handle)[k] }} title={k} />
                    ))}
                  </div>
                </Field>
                <Field label="Meteora DBC pool (optional)">
                  <input
                    value={form.pool ?? ""}
                    maxLength={44}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        pool: e.target.value.trim() || null,
                        poolNetwork: e.target.value.trim() ? (form.poolNetwork ?? "devnet") : null,
                      })
                    }
                  />
                </Field>
                <Field label="Pool network">
                  <select
                    value={form.poolNetwork ?? ""}
                    disabled={!form.pool}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        poolNetwork: (e.target.value || null) as PersonaInput["poolNetwork"],
                      })
                    }
                  >
                    <option value="devnet">devnet</option>
                    <option value="mainnet-beta">mainnet-beta</option>
                  </select>
                </Field>
              </div>
              {issues.map((i) => (
                <p key={i} className="cs-warn">
                  {SAFETY_TEXT[i]}
                </p>
              ))}
              {!parsed.success && form.handle && (
                <p className="cs-warn">{parsed.error.issues[0]?.message}</p>
              )}
              <div className="cs-actions">
                <Button variant="outline" onClick={verifyPool} disabled={busy || !form.pool}>
                  <RefreshCw size={14} /> Verify pool on-chain
                </Button>
                <Button
                  variant="outline"
                  disabled={!parsed.success}
                  onClick={() => {
                    setPackId(null);
                    setEdit(null);
                    setTourPack(draftPack("launch-pack", form, snap?.s ?? null));
                    setTab("media");
                  }}
                >
                  Draft locally (tour)
                </Button>
                <Button
                  disabled={!signedIn || !parsed.success || busy}
                  title={!signedIn ? "Sign in with your wallet to save" : undefined}
                  onClick={() =>
                    act(async () => {
                      const r = await fns.save({
                        data: { token: token!, id: sel, persona: parsed.data! },
                      });
                      setSel(r.id);
                    }, "Persona saved.")
                  }
                >
                  Save persona
                </Button>
                {signedIn && persona && (
                  <>
                    <Button
                      variant="outline"
                      onClick={() =>
                        act(() =>
                          fns.archive({
                            data: { token: token!, id: persona.id, archived: !persona.archived },
                          }),
                        )
                      }
                    >
                      {persona.archived ? "Restore" : "Archive"}
                    </Button>
                    {confirmDel === persona.id ? (
                      <Button
                        variant="destructive"
                        onClick={() =>
                          act(async () => {
                            await fns.delPersona({ data: { token: token!, id: persona.id } });
                            pick(null);
                            setConfirmDel(null);
                          }, "Persona deleted.")
                        }
                      >
                        Confirm delete with all drafts
                      </Button>
                    ) : (
                      <Button variant="outline" onClick={() => setConfirmDel(persona.id)}>
                        <Trash2 size={14} /> Delete
                      </Button>
                    )}
                  </>
                )}
              </div>
              {snapErr && <p className="cs-warn">{snapErr}</p>}
              {snap && (
                <p className="micro">
                  Pool verified at slot {snap.s.observedSlot} ({snap.s.network}). Evidence cards
                  available on the Proof tab.
                </p>
              )}
            </Panel>
          )}

          {tab === "media" && (
            <Panel title="Media & Reels" tag="9:16 STORYBOARD">
              {signedIn && persona && (
                <div className="cs-actions">
                  <Button
                    disabled={busy || persona.archived}
                    onClick={() =>
                      act(
                        () =>
                          fns.run({
                            data: { token: token!, personaId: persona.id, kind: "launch-pack" },
                          }),
                        "Workflow finished. See the activity log.",
                      )
                    }
                  >
                    Prepare launch announcement pack
                  </Button>
                  <Button
                    variant="outline"
                    disabled={busy || persona.archived}
                    onClick={() =>
                      act(
                        () =>
                          fns.run({
                            data: { token: token!, personaId: persona.id, kind: "weekly-update" },
                          }),
                        "Workflow finished.",
                      )
                    }
                  >
                    Prepare this week's pool updates
                  </Button>
                </div>
              )}
              {signedIn && packs.length > 0 && (
                <ul className="cs-packs">
                  {packs.map((p) => (
                    <li key={p.id}>
                      <button
                        type="button"
                        className={p.id === packId ? "active" : ""}
                        onClick={() => {
                          setPackId(p.id);
                          setEdit(null);
                        }}
                      >
                        {p.title} <span className={`cs-chip ${p.status}`}>{p.status}</span>{" "}
                        <span className="micro">{ago(p.updated_at)}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {!content ? (
                <p className="cs-empty">
                  {signedIn
                    ? persona
                      ? "Run a workflow to create the first draft pack."
                      : "Select or save a persona first."
                    : "Fill in a persona and choose Draft locally to preview a storyboard."}
                </p>
              ) : (
                <div className="cs-media">
                  <Storyboard content={content} handle={handle} />
                  <div className="cs-editor">
                    <Field label="Script">
                      <textarea
                        rows={8}
                        value={content.script}
                        onChange={(e) =>
                          pack
                            ? setEdit({ ...content, script: e.target.value })
                            : setTourPack({ ...content, script: e.target.value })
                        }
                      />
                    </Field>
                    {content.xPosts.map((x, i) => (
                      <Field key={i} label={`X post draft ${i + 1} (${x.length}/280)`}>
                        <textarea
                          rows={3}
                          maxLength={280}
                          value={x}
                          onChange={(e) => {
                            const xs = [...content.xPosts];
                            xs[i] = e.target.value;
                            const n = { ...content, xPosts: xs };
                            if (pack) setEdit(n);
                            else setTourPack(n);
                          }}
                        />
                      </Field>
                    ))}
                    <fieldset className="cs-check">
                      <legend>Review checklist</legend>
                      {content.checklist.map((x, i) => (
                        <label key={i}>
                          <input
                            type="checkbox"
                            checked={x.done}
                            onChange={(e) => {
                              const cl = content.checklist.map((y, j) =>
                                j === i ? { ...y, done: e.target.checked } : y,
                              );
                              const n = { ...content, checklist: cl };
                              if (pack) setEdit(n);
                              else setTourPack(n);
                            }}
                          />{" "}
                          {x.item}
                        </label>
                      ))}
                    </fieldset>
                    <div className="cs-actions">
                      <Button variant="outline" onClick={exportJson}>
                        <Download size={14} /> Export storyboard JSON
                      </Button>
                      <Button
                        variant="outline"
                        disabled
                        title="No reliable MP4 encoder is configured"
                      >
                        MP4 export not configured
                      </Button>
                      {pack && edit && (
                        <Button
                          disabled={busy}
                          onClick={() =>
                            act(async () => {
                              await fns.update({
                                data: { token: token!, id: pack.id, content: edit },
                              });
                              setEdit(null);
                            }, "Saved. Status returned to draft.")
                          }
                        >
                          Save edits
                        </Button>
                      )}
                      {pack &&
                        !edit &&
                        (["review", "approved", "ready", "draft"] as PackStatus[])
                          .filter((s) => s !== pack.status)
                          .map((s) => (
                            <Button
                              key={s}
                              variant="outline"
                              disabled={busy}
                              onClick={() =>
                                act(() =>
                                  fns.status({ data: { token: token!, id: pack.id, status: s } }),
                                )
                              }
                            >
                              Move to {s}
                            </Button>
                          ))}
                      {pack &&
                        (confirmDel === pack.id ? (
                          <Button
                            variant="destructive"
                            onClick={() =>
                              act(async () => {
                                await fns.delPack({ data: { token: token!, id: pack.id } });
                                setPackId(null);
                                setConfirmDel(null);
                              })
                            }
                          >
                            Confirm delete
                          </Button>
                        ) : (
                          <Button variant="outline" onClick={() => setConfirmDel(pack.id)}>
                            <Trash2 size={14} /> Delete draft
                          </Button>
                        ))}
                    </div>
                    <p className="micro">
                      "Ready" means approved for manual publishing outside QuantumQLi. Nothing is
                      posted automatically.
                    </p>
                  </div>
                </div>
              )}
            </Panel>
          )}

          {tab === "proof" && (
            <Panel title="On-chain Content Verification" tag="READ-ONLY RPC">
              <EvidenceList cards={cards} />
              <h3 className="cs-sub">Claim scan</h3>
              {findings.length ? (
                <ul className="cs-findings">
                  {findings.map((f, i) => (
                    <li key={i}>
                      <span className={`cs-chip ${f.verdict}`}>{f.verdict}</span> {f.text}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="cs-empty">No draft to scan yet.</p>
              )}
              {hash && (
                <p className="micro">
                  Media provenance hash {hash} — integrity checksum only, not a signature or
                  on-chain attestation.
                </p>
              )}
              <p className="micro">
                Inspect launch receipts in <Link to="/launch-proofs">Launch Proofs</Link>.
              </p>
            </Panel>
          )}

          {tab === "community" && (
            <Panel title="Community Intelligence" tag="OWNER-MODERATED DRAFTS">
              {!signedIn || !persona ? (
                <p className="cs-empty">
                  Sign in and select a persona to draft community Q&A. Nothing here is posted,
                  replied or messaged automatically.
                </p>
              ) : (
                <>
                  <div className="cs-actions">
                    <input
                      className="cs-q"
                      value={question}
                      maxLength={280}
                      placeholder="Add a community question to draft an answer"
                      onChange={(e) => setQuestion(e.target.value)}
                      aria-label="Community question"
                    />
                    <Button
                      disabled={busy || question.trim().length < 5}
                      onClick={() =>
                        act(async () => {
                          await fns.ask({
                            data: { token: token!, personaId: persona.id, question },
                          });
                          setQuestion("");
                        })
                      }
                    >
                      Draft answer
                    </Button>
                  </div>
                  <ul className="cs-qa">
                    {st!.qa
                      .filter((q) => q.persona_id === persona.id)
                      .map((q) => (
                        <li key={q.id}>
                          <b>{q.question}</b>
                          <p>{q.answer}</p>
                          <span className={`cs-chip ${q.grounded ? "derived" : "creative"}`}>
                            {q.grounded ? "grounded in pool state" : "needs owner answer"}
                          </span>{" "}
                          <span className={`cs-chip ${q.status}`}>{q.status}</span>
                          {q.status === "pending" && (
                            <>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() =>
                                  act(() =>
                                    fns.moderate({
                                      data: { token: token!, id: q.id, status: "approved" },
                                    }),
                                  )
                                }
                              >
                                Approve
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() =>
                                  act(() =>
                                    fns.moderate({
                                      data: { token: token!, id: q.id, status: "rejected" },
                                    }),
                                  )
                                }
                              >
                                Reject
                              </Button>
                            </>
                          )}
                        </li>
                      ))}
                  </ul>
                </>
              )}
            </Panel>
          )}
        </main>

        <aside className="cs-inspector" aria-label="Inspector and activity">
          <Panel title="Creator Dashboard" tag="INSPECTOR">
            {signedIn ? (
              <dl className="cs-dl">
                <dt>Personas</dt>
                <dd>{st!.personas.length} / 10</dd>
                <dt>Drafts</dt>
                <dd>{st!.packs.length}</dd>
                <dt>Approved / ready</dt>
                <dd>
                  {st!.packs.filter((p) => p.status === "approved" || p.status === "ready").length}
                </dd>
                <dt>Pending Q&A</dt>
                <dd>{st!.qa.filter((q) => q.status === "pending").length}</dd>
              </dl>
            ) : (
              <p className="cs-empty">Owner metrics appear after wallet sign-in.</p>
            )}
            {snap ? (
              <dl className="cs-dl">
                <dt>Pool stage</dt>
                <dd>{snap.s.stage}</dd>
                <dt>Observed slot</dt>
                <dd>{snap.s.observedSlot}</dd>
                <dt>Freshness</dt>
                <dd>{ago(snap.s.observedAt)}</dd>
                <dt>Creator quote fees (unclaimed)</dt>
                <dd>{snap.s.fees.unclaimed.creatorQuote}</dd>
              </dl>
            ) : (
              <p className="micro">Pool lifecycle: verify a pool to view stage and fees.</p>
            )}
            <dl className="cs-dl">
              <dt>Platform engagement</dt>
              <dd>N/A (no authorized platform API)</dd>
            </dl>
            <p className="micro">
              Fee intelligence is read-only. No claim, buyback or burn is automated here.
            </p>
          </Panel>
          <Panel title="QLi Operator Activity" tag="AUDIT TRAIL">
            {signedIn && st!.workflows.length ? (
              <ul className="cs-activity">
                {st!.workflows.slice(0, 8).map((w) => (
                  <li key={w.id}>
                    <b>{w.kind}</b> <span className={`cs-chip ${w.status}`}>{w.status}</span>{" "}
                    <span className="micro">{ago(w.created_at)}</span>
                    <ol>
                      {(w.steps as { name: string; status: string; detail: string }[]).map(
                        (s, i) => (
                          <li key={i}>
                            <span className={`cs-chip ${s.status}`}>{s.status}</span> {s.name}:{" "}
                            {s.detail}
                          </li>
                        ),
                      )}
                    </ol>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="cs-empty">
                No workflows run yet. Workflows run only when you press a workflow button.
              </p>
            )}
          </Panel>
          {msg && (
            <p className="cs-msg" role="status">
              {msg}
            </p>
          )}
        </aside>
      </div>
    </div>
  );
}
