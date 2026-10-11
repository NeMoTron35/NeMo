import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Panel, Field } from "./controls";
import { neAnalyze, neArena, neGraph, neShadow } from "@/lib/qli-core/neural/neural.functions";
import {
  fetchNeuralStatus,
  hfLabel,
  isRoutable,
  OPERATOR_HELP,
  type NeuralStatus,
} from "@/lib/qli-core/neural/status-client";
import { verifyRecord, type VerifyResult } from "@/lib/qli-core/neural/proof";
import { runShadow } from "@/lib/qli-core/neural/shadow";
import { runBaseline, ARENA_VERSION } from "@/lib/qli-core/neural/arena";
import { useConsole } from "@/lib/qli-core/context";
import { useNavigate } from "@tanstack/react-router";
import { Connection } from "@solana/web3.js";
import { GENESIS } from "@/lib/qli-core/dbc-launch";
import { defaultProfile, evaluateRules, observePool } from "@/lib/qli-core/qli-agent";
import { reviewEvidence } from "@/lib/qli-core/neural/integration";

type Pool = { id: string; pool: string; network: string };
const TABS = ["Neural Engine", "Proof", "Shadow", "Threat Graph", "Model Arena"] as const;
type Tab = (typeof TABS)[number];
const short = (a: string) => `${a.slice(0, 4)}…${a.slice(-4)}`;

function Json({ value }: { value: unknown }) {
  return (
    <pre
      className="mono"
      style={{ whiteSpace: "pre-wrap", fontSize: 11, maxHeight: 320, overflow: "auto" }}
    >
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}

export function NeuralWorkspace({
  token,
  pools = [],
  hostedConsent = false,
}: {
  token?: string | null | undefined;
  pools?: Pool[];
  hostedConsent?: boolean;
}) {
  const [tab, setTab] = useState<Tab>("Neural Engine");
  const [status, setStatus] = useState<NeuralStatus | null>(null);
  useEffect(() => {
    let live = true;
    fetchNeuralStatus().then((s) => live && setStatus(s));
    return () => {
      live = false;
    };
  }, []);
  const [poolId, setPoolId] = useState(pools[0]?.id ?? "");
  useEffect(() => {
    if (!pools.some((p) => p.id === poolId)) setPoolId(pools[0]?.id ?? "");
  }, [pools, poolId]);
  const routable = isRoutable(status) && hostedConsent;
  const [analysis, setAnalysis] = useState<Awaited<ReturnType<typeof neAnalyze>> | null>(null);
  useEffect(() => {
    setAnalysis(null);
  }, [token, poolId]);
  return (
    <Panel title="QLi Agent v3 — Neural workspace" tag="Read-only · no signing">
      <p className="micro" role="status" data-testid="hf-status">
        {hfLabel(status)}
      </p>
      <section aria-label="Operator help" className="micro" data-testid="operator-help">
        <p>{OPERATOR_HELP}.</p>
        <p>
          HF_MODEL_ALLOWLIST takes up to two Hugging Face model ids. Optional limits: HF_HOURLY_CAP,
          HF_DAILY_CAP, HF_GLOBAL_DAILY_CAP, HF_TIMEOUT_MS. Never paste a token into this page.
        </p>
        {status?.ok && (
          <p>
            Request caps: {status.caps.hourly}/hour · {status.caps.daily}/day per profile ·{" "}
            {status.caps.globalDaily}/day workspace. These are request limits, not a guaranteed
            currency spending cap.
          </p>
        )}
      </section>
      <div
        role="tablist"
        aria-label="Neural workspace"
        style={{ display: "flex", flexWrap: "wrap", gap: 4, margin: "8px 0" }}
      >
        {TABS.map((t) => (
          <Button
            key={t}
            role="tab"
            aria-selected={tab === t}
            size="sm"
            variant={tab === t ? "default" : "outline"}
            onClick={() => setTab(t)}
          >
            {t}
          </Button>
        ))}
      </div>
      {token && pools.length > 0 && tab !== "Proof" && tab !== "Model Arena" && (
        <Field label="Verified registered pool">
          <select className="input" value={poolId} onChange={(e) => setPoolId(e.target.value)}>
            {pools.map((p) => (
              <option key={p.id} value={p.id}>
                {short(p.pool)} · {p.network}
              </option>
            ))}
          </select>
        </Field>
      )}
      <div role="tabpanel">
        {tab === "Neural Engine" && (
          <Ask
            token={token}
            poolId={poolId}
            hf={routable}
            onAnalysis={setAnalysis}
            analysis={analysis}
            pools={pools}
            onTab={setTab}
          />
        )}
        {tab === "Proof" && <ProofTab analysis={analysis} />}
        {tab === "Shadow" && <ShadowTab token={token} poolId={poolId} analysis={analysis} />}
        {tab === "Threat Graph" && <GraphTab token={token} analysis={analysis} />}
        {tab === "Model Arena" && (
          <ArenaTab token={token} hf={routable} requests={status?.ok ? status.arenaRequests : 0} />
        )}
      </div>
    </Panel>
  );
}

function needSignIn(token?: string | null | undefined, poolId?: string) {
  if (!token)
    return (
      <p className="micro">
        Sign in on the QLi Agent page with your wallet to analyze your registered pools.
      </p>
    );
  if (poolId === "")
    return (
      <p className="micro">
        Register a creator-verified pool first. Unverified addresses are not accepted.
      </p>
    );
  return null;
}

function Ask({
  token,
  poolId,
  hf,
  analysis,
  onAnalysis,
  pools,
  onTab,
}: {
  token?: string | null | undefined;
  poolId: string;
  hf: boolean;
  analysis: Awaited<ReturnType<typeof neAnalyze>> | null;
  onAnalysis: (a: Awaited<ReturnType<typeof neAnalyze>> | null) => void;
  pools: Pool[];
  onTab: (t: Tab) => void;
}) {
  const fn = useServerFn(neAnalyze);
  const [q, setQ] = useState("How much in fees can I claim?");
  const [useModel, setUseModel] = useState(false);
  const out = analysis;
  const c = useConsole();
  const navigate = useNavigate();
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const gate = needSignIn(token, poolId);
  if (gate) return gate;
  return (
    <div>
      <Field label="Question (fees, migration, reserve, freshness)">
        <input className="input" value={q} maxLength={300} onChange={(e) => setQ(e.target.value)} />
      </Field>
      <label className="micro" style={{ display: "flex", gap: 6, alignItems: "center" }}>
        <input
          type="checkbox"
          checked={useModel}
          disabled={!hf}
          onChange={(e) => setUseModel(e.target.checked)}
        />
        Also ask the hosted model (1 request, charges may apply; only a fixed task ID and numbers
        are sent, never your text){!hf && " — unavailable"}
      </label>
      <Button
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setErr("");
          try {
            if (!token) return;
            onAnalysis(null);
            onAnalysis(
              await fn({ data: { token, poolId, question: q, useModel: useModel && hf } }),
            );
          } catch (e) {
            setErr((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        Analyze
      </Button>
      {err && (
        <p role="alert" className="micro">
          {err}
        </p>
      )}
      {out && (
        <div>
          <h3 className="micro">Deterministic engine (non-AI)</h3>
          <p>{out.deterministic.answer}</p>
          <p className="micro">
            Cites {out.deterministic.citations.join(", ") || "none"} · confidence{" "}
            {out.deterministic.confidence}
          </p>
          {out.model && (
            <>
              <h3 className="micro">
                Hosted model: {out.model.model} · {out.model.status}
                {out.model.latencyMs != null && ` · ${out.model.latencyMs} ms`}
              </h3>
              {out.model.answer ? (
                <p>{out.model.answer.answer}</p>
              ) : (
                <p className="micro">No validated model answer; deterministic result stands.</p>
              )}
            </>
          )}
          <details>
            <summary className="micro">
              Evidence ({out.snapshot.evidence.length}) — slot {out.snapshot.slot}
            </summary>
            <Json value={out.snapshot.evidence} />
          </details>
          <div className="agent-actions">
            <Button size="sm" variant="outline" onClick={() => onTab("Proof")}>
              Inspect provenance
            </Button>
            <Button size="sm" variant="outline" onClick={() => onTab("Threat Graph")}>
              Relationship context
            </Button>
            <Button size="sm" variant="outline" onClick={() => onTab("Shadow")}>
              Counterfactual stress test
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                setErr("");
                try {
                  const pool = pools.find((p) => p.id === poolId);
                  const wallet = c.account?.address;
                  if (!pool || !wallet || !c.wallet || !token)
                    throw new Error("Connect the signed-in owner wallet first.");
                  const now = Math.floor(Date.now() / 1000);
                  const evidence = await reviewEvidence(out.record, out.snapshot, c.network, now);
                  const connection = new Connection(c.rpc, "confirmed");
                  if ((await connection.getGenesisHash()) !== GENESIS[c.network])
                    throw new Error("RPC network mismatch. Review stopped.");
                  const observation = await observePool(c.rpc, pool.pool, wallet, c.network);
                  const fresh = evaluateRules(
                    observation,
                    defaultProfile(wallet, c.network),
                    Math.floor(Date.now() / 1000),
                  ).proposals.find((p) => p.step === "claim");
                  if (!fresh)
                    throw new Error("Fresh on-chain data does not support a fee-claim review.");
                  c.setAgentHandoff({
                    ...fresh,
                    id: crypto.randomUUID(),
                    createdAt: Math.floor(Date.now() / 1000),
                    status: "open",
                    provenance: `Confirmed fresh read; analysis hash ${evidence.proofHash}`,
                  });
                  void navigate({ to: "/flywheel" });
                } catch (e) {
                  setErr((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              Re-read fees & open wallet review
            </Button>
          </div>
          <p className="micro">
            Analysis hashes and model answers grant no authority. Review re-reads creator ownership
            and fees; Flywheel rebuilds and separately requests wallet approval. No transaction is
            signed or sent here.
          </p>
          <details>
            <summary className="micro">
              Proof record {out.record.hash.slice(0, 16)}… · verdict {out.record.verdict}
            </summary>
            <Json value={out.record} />
          </details>
        </div>
      )}
    </div>
  );
}

function ProofTab({ analysis }: { analysis: Awaited<ReturnType<typeof neAnalyze>> | null }) {
  const [rec, setRec] = useState("");
  const [snap, setSnap] = useState("");
  const [res, setRes] = useState<VerifyResult | null>(null);
  const [err, setErr] = useState("");
  useEffect(() => {
    if (analysis) {
      setRec(JSON.stringify(analysis.record));
      setSnap(JSON.stringify(analysis.snapshot));
      setRes(null);
    }
  }, [analysis]);
  return (
    <div>
      <p className="micro">
        Verifies a Proof Engine v3.5 record locally in this browser. Tamper-evident hash only — not
        signed, not on-chain.
      </p>
      <Field label="Record JSON">
        <textarea className="input" rows={5} value={rec} onChange={(e) => setRec(e.target.value)} />
      </Field>
      <Field label="Snapshot JSON (optional, enables deterministic replay)">
        <textarea
          className="input"
          rows={3}
          value={snap}
          onChange={(e) => setSnap(e.target.value)}
        />
      </Field>
      <Button
        onClick={async () => {
          setErr("");
          try {
            setRes(await verifyRecord(JSON.parse(rec), snap.trim() ? JSON.parse(snap) : undefined));
          } catch {
            setErr("Invalid JSON.");
          }
        }}
      >
        Verify
      </Button>
      {err && (
        <p role="alert" className="micro">
          {err}
        </p>
      )}
      {res && (
        <ul className="micro">
          <li>Schema: {res.structure ? "valid" : "invalid"}</li>
          <li>Hash: {res.hashMatches ? "matches" : "MISMATCH"}</li>
          <li>Genesis: {res.genesisMatches ? "matches network" : "MISMATCH"}</li>
          <li>Snapshot replay: {res.snapshotReplayed}</li>
          <li>Verdict replay: {res.verdictReplayed}</li>
          <li>{res.note}</li>
        </ul>
      )}
    </div>
  );
}

function ShadowTab({
  token,
  poolId,
  analysis,
}: {
  token?: string | null | undefined;
  poolId: string;
  analysis: Awaited<ReturnType<typeof neAnalyze>> | null;
}) {
  const fn = useServerFn(neShadow);
  const [base, setBase] = useState("1000000000000000");
  const [quote, setQuote] = useState("30000000000");
  const [fee, setFee] = useState(100);
  const [out, setOut] = useState<unknown>(null);
  const [err, setErr] = useState("");
  const cfg = {
    feeBps: fee,
    maxImpactBps: 300,
    tradeBps: [100, 500, 1000, 2500],
    reserveShockBps: 5000,
  };
  return (
    <div>
      {analysis && (
        <p className="micro">
          Analysis reference: {analysis.record.hash.slice(0, 16)}… · slot {analysis.snapshot.slot}.
          Stress tests obtain a separate snapshot and proof; this reference is not a price quote.
        </p>
      )}
      <p className="micro" role="note" style={{ border: "1px solid currentColor", padding: 6 }}>
        HYPOTHETICAL · UNCALIBRATED · NOT A METEORA DBC QUOTE. Counterfactual stress grid on
        constant-product reserves; not a forecast or an executable price. No transactions.
      </p>
      <Field label="Hypothetical base reserve (base units)">
        <input
          className="input"
          value={base}
          onChange={(e) => setBase(e.target.value.replace(/\D/g, "").slice(0, 20))}
        />
      </Field>
      <Field label="Fee (bps, 0–1000)">
        <input
          className="input"
          type="number"
          min={0}
          max={1000}
          value={fee}
          onChange={(e) => setFee(Math.min(1000, Math.max(0, Math.trunc(Number(e.target.value)))))}
        />
      </Field>
      {token && poolId ? (
        <Button
          onClick={async () => {
            setErr("");
            try {
              setOut(await fn({ data: { token, poolId, baseReserve: base, ...cfg } }));
            } catch (e) {
              setErr((e as Error).message);
            }
          }}
        >
          Run on observed quote reserve
        </Button>
      ) : (
        <>
          <Field label="Hypothetical quote reserve (lamports)">
            <input
              className="input"
              value={quote}
              onChange={(e) => setQuote(e.target.value.replace(/\D/g, "").slice(0, 20))}
            />
          </Field>
          <Button
            onClick={() => {
              setErr("");
              try {
                setOut({
                  result: runShadow({
                    model: "constant-product-hypothetical",
                    baseReserve: base,
                    quoteReserve: quote,
                    ...cfg,
                  }),
                });
              } catch (e) {
                setErr((e as Error).message);
              }
            }}
          >
            Run hypothetical
          </Button>
        </>
      )}
      {err && (
        <p role="alert" className="micro">
          {err}
        </p>
      )}
      {out != null && <Json value={out} />}
    </div>
  );
}

function GraphTab({
  token,
  analysis,
}: {
  token?: string | null | undefined;
  analysis: Awaited<ReturnType<typeof neAnalyze>> | null;
}) {
  const fn = useServerFn(neGraph);
  const [g, setG] = useState<Awaited<ReturnType<typeof neGraph>> | null>(null);
  const [err, setErr] = useState("");
  if (!token) return needSignIn(token);
  return (
    <div>
      {analysis && (
        <p className="micro">
          Analysis reference: {analysis.record.hash.slice(0, 16)}… · {analysis.record.verdict}.
          Relationships are separate registration evidence, not proof of model output.
        </p>
      )}
      <Button
        onClick={async () => {
          setErr("");
          try {
            setG(await fn({ data: { token } }));
          } catch (e) {
            setErr((e as Error).message);
          }
        }}
      >
        Build graph
      </Button>
      {err && (
        <p role="alert" className="micro">
          {err}
        </p>
      )}
      {g && (
        <>
          <p className="micro">{g.scope}</p>
          <h3 className="micro">
            Signals ({g.signals.length}) — patterns with uncertainty, not accusations
          </h3>
          <ul className="micro">
            {g.signals.map((s, i) => (
              <li key={i}>
                [{s.severity} · {s.confidence} confidence] {s.code}: {s.detail}
              </li>
            ))}
            {!g.signals.length && <li>No signals.</li>}
          </ul>
          <div style={{ overflowX: "auto" }}>
            <table className="micro" style={{ width: "100%" }}>
              <caption className="micro">Relationships ({g.edges.length})</caption>
              <thead>
                <tr>
                  <th>From</th>
                  <th>Relation</th>
                  <th>To</th>
                  <th>Source</th>
                  <th>Slot</th>
                </tr>
              </thead>
              <tbody>
                {g.edges.map((e, i) => {
                  const n = (id: string) => g.nodes.find((x) => x.id === id);
                  return (
                    <tr key={i}>
                      <td>
                        {n(e.from)?.kind} {n(e.from)?.label}
                      </td>
                      <td>{e.rel}</td>
                      <td>
                        {n(e.to)?.kind} {n(e.to)?.label}
                      </td>
                      <td>{e.source}</td>
                      <td>{e.slot ?? "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

function ArenaTab({
  token,
  hf,
  requests,
}: {
  token?: string | null | undefined;
  hf: boolean;
  requests: number;
}) {
  const fn = useServerFn(neArena);
  const [confirm, setConfirm] = useState(false);
  const [out, setOut] = useState<{
    baseline: ReturnType<typeof runBaseline>;
    hosted: ReturnType<typeof runBaseline>[];
  } | null>(null);
  const [err, setErr] = useState("");
  const rows = out ? [out.baseline, ...out.hosted] : [];
  return (
    <div>
      <p className="micro">
        {ARENA_VERSION}. Fixtures are openly SYNTHETIC — no user or chain data. Hosted comparison
        requires a configured Hugging Face credential and explicit opt-in.
      </p>
      <Button onClick={() => setOut({ baseline: runBaseline(), hosted: [] })}>
        Run deterministic baseline
      </Button>{" "}
      {token && hf && (
        <label className="micro" style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <input type="checkbox" checked={confirm} onChange={(e) => setConfirm(e.target.checked)} />
          This will invoke {requests} hosted model requests. Charges may apply.
        </label>
      )}
      {token && hf && (
        <Button
          disabled={!confirm}
          variant="outline"
          onClick={async () => {
            setErr("");
            try {
              setOut(await fn({ data: { token, confirmCharges: true } }));
              setConfirm(false);
            } catch (e) {
              setErr((e as Error).message);
            }
          }}
        >
          Compare hosted models
        </Button>
      )}
      {err && (
        <p role="alert" className="micro">
          {err}
        </p>
      )}
      {rows.length > 0 && (
        <div style={{ overflowX: "auto" }}>
          <table className="micro" style={{ width: "100%" }}>
            <thead>
              <tr>
                <th>Engine</th>
                <th>Accuracy</th>
                <th>Valid JSON</th>
                <th>Citations</th>
                <th>Hallucination</th>
                <th>Refusal correct</th>
                <th>Latency</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.engine}>
                  <td>{r.engine}</td>
                  <td>{r.accuracyPct}%</td>
                  <td>{r.validJsonPct}%</td>
                  <td>{r.citationPct}%</td>
                  <td>{r.hallucinationPct}%</td>
                  <td>{r.refusalPct}%</td>
                  <td>{r.meanLatencyMs} ms</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="micro">
        Hugging Face Space export: see the repository folder spaces/qli-model-arena (not published).
      </p>
    </div>
  );
}