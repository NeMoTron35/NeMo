import { useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Bot, Pause, Play, RefreshCw, ShieldAlert, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeading, Panel, Field } from "./controls";
import { QliAgentV2 } from "./qli-agent-v2";
import { useConsole } from "@/lib/qli-core/context";
import { useWalletDialog } from "@/components/qli/wallet-dialog-context";
import { explainTransactionError } from "@/lib/qli-core/dbc";
import { fromBaseUnits } from "@/lib/qli-core/flywheel-live";
import {
  AGENT_ANALYSIS_LABEL,
  AGENT_MAX_PROPOSAL_SOL,
  AGENT_RUNTIME_LABEL,
  AGENT_WARNING,
  MAX_AGENT_POOLS,
  MAX_CADENCE_S,
  MIN_CADENCE_S,
  agentProfileSchema,
  defaultProfile,
  evaluateRules,
  observePool,
  profileContextIssue,
  runtimeStatus,
  shouldPoll,
  type AgentProfile,
  type Alert,
  type Observation,
  type Proposal,
} from "@/lib/qli-core/qli-agent";

const time = (s: number) => new Date(s * 1000).toLocaleTimeString();

export function QliAgentPage() {
  const c = useConsole();
  const openWallet = useWalletDialog();
  const navigate = useNavigate();
  const wallet = c.account?.address ?? null;
  const [draft, setDraft] = useState<AgentProfile | null>(null);
  const [poolsText, setPoolsText] = useState("");
  const [profile, setProfile] = useState<AgentProfile | null>(null);
  const [active, setActive] = useState(false);
  const [visible, setVisible] = useState(true);
  const [busy, setBusy] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);
  const [formError, setFormError] = useState("");
  const [obs, setObs] = useState<Record<string, Observation>>({});
  const [history, setHistory] = useState<Observation[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [now, setNow] = useState(0);
  const runId = useRef(0);

  const ctxIssue = profile ? profileContextIssue(profile, { wallet, network: c.network }) : null;

  useEffect(() => {
    if (wallet && !draft) setDraft(defaultProfile(wallet, c.network));
  }, [wallet, c.network, draft]);
  useEffect(() => {
    const on = () => setVisible(document.visibilityState === "visible");
    on();
    document.addEventListener("visibilitychange", on);
    return () => document.removeEventListener("visibilitychange", on);
  }, []);
  useEffect(() => {
    setNow(Math.floor(Date.now() / 1000));
    const t = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 5000);
    return () => clearInterval(t);
  }, []);
  // Wallet/network/RPC change: invalidate in-flight reads, drop proposals, pause.
  useEffect(() => {
    runId.current++;
    setActive(false);
    setProposals([]);
  }, [wallet, c.network, c.rpc]);

  async function observe() {
    if (!profile || busy || ctxIssue || !wallet) return;
    const id = ++runId.current;
    setBusy(true);
    try {
      const results: Observation[] = [];
      for (const p of profile.pools) results.push(await observePool(c.rpc, p, wallet, c.network));
      if (id !== runId.current) return; // stale request
      const t = Math.floor(Date.now() / 1000);
      const nextAlerts: Alert[] = [];
      const nextProps: Proposal[] = [];
      for (const o of results) {
        const r = evaluateRules(o, profile, t);
        nextAlerts.push(...r.alerts);
        r.proposals.forEach((p, i) =>
          nextProps.push({
            ...p,
            id: `${o.pool.slice(0, 6)}-${p.step}-${t}-${i}`,
            createdAt: t,
            status: "open",
          }),
        );
      }
      setObs(Object.fromEntries(results.map((o) => [o.pool, o])));
      setHistory((h) => [...results, ...h].slice(0, 50));
      setAlerts((a) => [...nextAlerts, ...a].slice(0, 50));
      setProposals((old) =>
        [...nextProps, ...old.filter((p) => p.status === "denied")].slice(0, 30),
      );
      setLastError(null);
      if (nextAlerts.some((a) => a.level === "warning"))
        c.log(
          `QLi Agent: ${nextAlerts.filter((a) => a.level === "warning").length} warning(s)`,
          "Agent",
        );
    } catch (e) {
      if (id !== runId.current) return;
      setLastError(explainTransactionError(e));
      setActive(false); // stop on error
    } finally {
      if (id === runId.current) setBusy(false);
    }
  }
  const observeRef = useRef(observe);
  observeRef.current = observe;
  const polling = shouldPoll({ active, visible, contextIssue: ctxIssue, lastError });
  useEffect(() => {
    if (!polling || !profile) return;
    void observeRef.current();
    const t = setInterval(() => void observeRef.current(), profile.cadenceSeconds * 1000);
    return () => clearInterval(t);
  }, [polling, profile]);

  function create() {
    if (!draft || !wallet) return;
    const pools = [...new Set(poolsText.split(/[\s,]+/).filter(Boolean))];
    const r = agentProfileSchema.safeParse({
      ...draft,
      wallet,
      network: c.network,
      identityRoot: draft.identityRoot ? (c.identity?.root ?? null) : null,
      pools,
    });
    if (!r.success) {
      setFormError(r.error.issues[0]?.message ?? "Invalid profile.");
      return;
    }
    setFormError("");
    setProfile(r.data);
    setObs({});
    setHistory([]);
    setAlerts([]);
    setProposals([]);
    setLastError(null);
    setActive(true);
    c.log(`QLi Agent created · ${r.data.pools.length} pool(s)`, "Agent", "—", AGENT_RUNTIME_LABEL);
  }
  function deny(id: string) {
    setProposals((l) => l.map((p) => (p.id === id ? { ...p, status: "denied" } : p)));
  }
  function review(p: Proposal) {
    setProposals((l) => l.map((x) => (x.id === p.id ? { ...x, status: "handed-off" } : x)));
    c.setAgentHandoff({ ...p, status: "open" });
    void navigate({ to: "/flywheel" });
  }
  const set = <K extends keyof AgentProfile>(k: K, v: AgentProfile[K]) =>
    setDraft((d) => (d ? { ...d, [k]: v } : d));
  const status = runtimeStatus({ active, visible, paused: ctxIssue ?? lastError });

  return (
    <div className="qli-agent">
      <PageHeading
        eyebrow="OBSERVABILITY / DECISION SUPPORT"
        title="QLi Agent"
        description="Live read-only monitoring of your own DBC pools with rule-based alerts and non-executable Flywheel proposals."
      />
      <div className="agent-warning" role="note">
        <ShieldAlert size={16} aria-hidden /> {AGENT_WARNING}
      </div>
      <div className="agent-badges">
        <span>{AGENT_RUNTIME_LABEL}</span>
        <span>{AGENT_ANALYSIS_LABEL}</span>
      </div>
      <QliAgentV2 />
      <h2 className="agent-section-title">v1 · Live session observer (this tab only)</h2>

      {!wallet ? (
        <Panel title="Connect a wallet">
          <div className="instrument-body">
            <p>The agent binds to your public wallet and current network. It never signs.</p>
            <Button className="mt-4" onClick={() => openWallet()}>
              Connect wallet
            </Button>
          </div>
        </Panel>
      ) : !profile ? (
        <Panel title="Create QLi Agent" tag={c.network.toUpperCase()}>
          {draft && (
            <div className="instrument-body">
              <p className="micro">
                Wallet {wallet} · {c.network}. Read-only scope. Settings live in this tab only.
              </p>
              <div className="form-grid mt-4">
                <Field label="Agent name">
                  <input
                    maxLength={40}
                    value={draft.name}
                    onChange={(e) => set("name", e.target.value)}
                  />
                </Field>
                <Field label={`Cadence (${MIN_CADENCE_S}–${MAX_CADENCE_S} s)`}>
                  <input
                    type="number"
                    min={MIN_CADENCE_S}
                    max={MAX_CADENCE_S}
                    value={draft.cadenceSeconds}
                    onChange={(e) => set("cadenceSeconds", e.target.valueAsNumber)}
                  />
                </Field>
                <Field label="Claim alert threshold (SOL)">
                  <input
                    type="number"
                    step="any"
                    min={0}
                    value={draft.minClaimSol}
                    onChange={(e) => set("minClaimSol", e.target.valueAsNumber)}
                  />
                </Field>
                <Field label="Buyback share of fees (%)">
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={draft.buybackPct}
                    onChange={(e) => set("buybackPct", e.target.valueAsNumber)}
                  />
                </Field>
                <Field label={`Max proposal (≤ ${AGENT_MAX_PROPOSAL_SOL} SOL)`}>
                  <input
                    type="number"
                    step="any"
                    min={0}
                    max={AGENT_MAX_PROPOSAL_SOL}
                    value={draft.maxProposalSol}
                    onChange={(e) => set("maxProposalSol", e.target.valueAsNumber)}
                  />
                </Field>
                <Field label="Slippage (bps)">
                  <input
                    type="number"
                    min={1}
                    max={1000}
                    value={draft.slippageBps}
                    onChange={(e) => set("slippageBps", e.target.valueAsNumber)}
                  />
                </Field>
                <Field label="Min SOL reserve">
                  <input
                    type="number"
                    step="any"
                    min={0}
                    value={draft.minSolReserve}
                    onChange={(e) => set("minSolReserve", e.target.valueAsNumber)}
                  />
                </Field>
                <Field label="Migration alert (%)">
                  <input
                    type="number"
                    min={1}
                    max={100}
                    value={draft.migrationAlertPct}
                    onChange={(e) => set("migrationAlertPct", e.target.valueAsNumber)}
                  />
                </Field>
                <Field label="Stale read limit (s)">
                  <input
                    type="number"
                    min={30}
                    max={3600}
                    value={draft.staleSeconds}
                    onChange={(e) => set("staleSeconds", e.target.valueAsNumber)}
                  />
                </Field>
              </div>
              <Field label={`Your DBC pool addresses (up to ${MAX_AGENT_POOLS}, creator-owned)`}>
                <textarea
                  rows={3}
                  value={poolsText}
                  onChange={(e) => setPoolsText(e.target.value)}
                  placeholder="Pool address, one per line"
                />
              </Field>
              <label className="checkbox-label mt-3">
                <input
                  type="checkbox"
                  checked={draft.proposeBurn}
                  onChange={(e) => set("proposeBurn", e.target.checked)}
                />
                Propose burns of held own-pool tokens
              </label>
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  disabled={!c.identity}
                  checked={!!draft.identityRoot}
                  onChange={(e) =>
                    set("identityRoot", e.target.checked ? (c.identity?.root ?? null) : null)
                  }
                />
                Bind open Quantum Identity root {c.identity ? "" : "(none open)"}
              </label>
              {formError && (
                <div className="error-message" role="alert">
                  {formError}
                </div>
              )}
              <Button className="mt-4" onClick={create}>
                <Bot /> Create and start agent
              </Button>
            </div>
          )}
        </Panel>
      ) : (
        <>
          <Panel title={profile.name} tag={status}>
            <div className="instrument-body agent-controls">
              <span className={`agent-dot ${polling ? "on" : ""}`} aria-hidden />
              <span>{status}</span>
              <Button
                size="sm"
                variant="outline"
                disabled={!!ctxIssue}
                onClick={() => {
                  setLastError(null);
                  setActive((a) => !a);
                }}
              >
                {active ? (
                  <>
                    <Pause /> Pause
                  </>
                ) : (
                  <>
                    <Play /> Start
                  </>
                )}
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={busy || !!ctxIssue}
                onClick={() => void observe()}
              >
                <RefreshCw /> Read now
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  runId.current++;
                  setProfile(null);
                  setActive(false);
                }}
              >
                <X /> Delete agent
              </Button>
              <small>
                Every {profile.cadenceSeconds}s · {profile.pools.length} pool(s) · {profile.network}
              </small>
            </div>
            {(ctxIssue || lastError) && (
              <div className="error-message" role="alert">
                {ctxIssue ?? lastError} Fix and press Start.
              </div>
            )}
          </Panel>

          <Panel title="Live observations" tag="ON-CHAIN">
            {Object.keys(obs).length === 0 ? (
              <div className="empty-state">
                {busy ? "Reading on-chain state…" : "No reads yet."}
              </div>
            ) : (
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Pool</th>
                      <th>Claimable</th>
                      <th>Curve</th>
                      <th>Wallet SOL</th>
                      <th>Tokens held</th>
                      <th>Read</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.values(obs).map((o) => (
                      <tr key={o.pool}>
                        <td className="mono">
                          {o.pool.slice(0, 6)}…{o.pool.slice(-4)}
                          {o.isMigrated ? " · migrated" : ""}
                        </td>
                        <td>
                          {fromBaseUnits(o.claimableQuote, 9)} {o.quoteIsSol ? "SOL" : "quote"}
                        </td>
                        <td>
                          {o.progressPct === null ? "Unknown" : `${o.progressPct.toFixed(2)}%`}
                        </td>
                        <td>{fromBaseUnits(o.walletSol, 9)}</td>
                        <td>{fromBaseUnits(o.walletToken, o.baseDecimals)}</td>
                        <td>
                          {time(o.observedAt)}
                          {now - o.observedAt > profile.staleSeconds ? " · STALE" : ""}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p className="micro">
              Source: Meteora DBC pool/config, SPL mint and wallet balances via your selected RPC.
              No price or APY is inferred.
            </p>
          </Panel>

          <Panel title="Proposals" tag="NON-EXECUTABLE">
            {proposals.length === 0 ? (
              <div className="empty-state">
                No proposals. Rules fire only on fresh, verified reads.
              </div>
            ) : (
              <ul className="agent-list">
                {proposals.map((p) => (
                  <li key={p.id} className={p.status}>
                    <strong>{p.step.toUpperCase()}</strong>{" "}
                    {p.amount && (
                      <span>
                        {p.amount} {p.step === "buyback" ? "SOL" : "tokens"}
                      </span>
                    )}
                    {p.slippageBps > 0 && <span> · {p.slippageBps} bps</span>}
                    <p>{p.rationale}</p>
                    <small>
                      {p.pool.slice(0, 8)}… · {p.network} · read {time(p.observedAt)} · {p.status}
                    </small>
                    {p.status === "open" && (
                      <div className="agent-actions">
                        <Button size="sm" onClick={() => review(p)}>
                          Review in Flywheel
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => deny(p.id)}>
                          Deny
                        </Button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel title="Alerts" tag="RULES">
            {alerts.length === 0 ? (
              <div className="empty-state">No alerts.</div>
            ) : (
              <ul className="agent-list">
                {alerts.map((a, i) => (
                  <li key={i} className={a.level}>
                    <strong>{a.ability}</strong> · {a.title}
                    <small>
                      {" "}
                      · logic: {a.logic} · {time(a.observedAt)}
                    </small>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
          <Panel title="Monitor history" tag={`${history.length}`}>
            {history.length === 0 ? (
              <div className="empty-state">No history in this tab.</div>
            ) : (
              <ul className="agent-list">
                {history.map((o, i) => (
                  <li key={i}>
                    <small>
                      {time(o.observedAt)} · {o.pool.slice(0, 8)}… · fees{" "}
                      {fromBaseUnits(o.claimableQuote, 9)} · curve{" "}
                      {o.progressPct === null ? "unknown" : `${o.progressPct.toFixed(2)}%`}
                    </small>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </>
      )}
    </div>
  );
}
