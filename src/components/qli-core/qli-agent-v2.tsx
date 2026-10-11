import { useCallback, useEffect, useState } from "react";
import { VaultSentinelPanel } from "./vault-sentinel-panel";
import { NeuralWorkspace } from "./neural-workspace";
import { OPERATOR_HELP } from "@/lib/qli-core/neural/status-client";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { LogIn, LogOut, RefreshCw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Panel, Field } from "./controls";
import { useConsole } from "@/lib/qli-core/context";
import { signDerivationMessage } from "@/lib/qli-core/wallet";
import { fromBaseUnits } from "@/lib/qli-core/flywheel-live";
import { defaultProfile, evaluateRules, observePool } from "@/lib/qli-core/qli-agent";
import { V2_LEGEND, settingsDefaults, type V2Settings } from "@/lib/qli-core/agent-v2-core";
import {
  v2Challenge,
  v2DeleteProfile,
  v2ProposalStatus,
  v2RegisterPool,
  v2RemovePool,
  v2SaveProfile,
  v2SignOut,
  v2State,
  v2Verify,
  v2HostedConsent,
} from "@/lib/qli-core/agent-v2.functions";

type State = Awaited<ReturnType<typeof v2State>>;
const ts = (s: string | null | undefined) => (s ? new Date(s).toLocaleString() : "—");

export function QliAgentV2() {
  const c = useConsole();
  const navigate = useNavigate();
  const fns = {
    challenge: useServerFn(v2Challenge),
    verify: useServerFn(v2Verify),
    state: useServerFn(v2State),
    save: useServerFn(v2SaveProfile),
    register: useServerFn(v2RegisterPool),
    remove: useServerFn(v2RemovePool),
    status: useServerFn(v2ProposalStatus),
    del: useServerFn(v2DeleteProfile),
    out: useServerFn(v2SignOut),
    consent: useServerFn(v2HostedConsent),
  };
  const wallet = c.account?.address ?? null;
  const [token, setToken] = useState<string | null>(null);
  const [st, setSt] = useState<State | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [poolInput, setPoolInput] = useState("");
  const [name, setName] = useState("QLi Agent");
  const [settings, setSettings] = useState<V2Settings>(settingsDefaults);
  const [filter, setFilter] = useState<"all" | "warning" | "info">("all");
  const [open, setOpen] = useState<string | null>(null);

  // Session is bound to wallet + network; any change signs out locally.
  useEffect(() => {
    setToken(null);
    setSt(null);
  }, [wallet, c.network]);

  const refresh = useCallback(
    async (t = token) => {
      if (!t) return;
      try {
        const s = await fns.state({ data: { token: t } });
        setSt(s);
        if (s.profile) {
          setName(s.profile.name);
          setSettings(s.profile.settings);
        }
        setErr("");
      } catch (e) {
        setErr((e as Error).message);
        if (/Session|signed in/i.test((e as Error).message)) setToken(null);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [token],
  );
  const run = async (f: () => Promise<unknown>) => {
    setBusy(true);
    setErr("");
    try {
      await f();
      await refresh();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  async function signIn() {
    if (!wallet || !c.wallet || !c.account) return;
    setBusy(true);
    setErr("");
    try {
      const ch = await fns.challenge({ data: { wallet, network: c.network } });
      const sig = await signDerivationMessage(c.wallet, c.account, ch.message);
      const b64 = btoa(String.fromCharCode(...sig));
      const s = await fns.verify({ data: { wallet, nonce: ch.nonce, signature: b64 } });
      if (s.wallet !== wallet || s.network !== c.network) throw new Error("Session mismatch.");
      setToken(s.token);
      await refresh(s.token);
    } catch (e) {
      setErr(`Wallet sign-in failed: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  async function reviewLive(p: State["proposals"][number]) {
    const pool = st?.pools.find((x) => x.id === p.pool_id);
    if (!pool || !wallet || !token) return;
    await run(async () => {
      // Fresh client live read; the persisted proposal is evidence only.
      const o = await observePool(c.rpc, pool.pool, wallet, c.network);
      const prof = { ...defaultProfile(wallet, c.network), ...settings, pools: [pool.pool] };
      const fresh = evaluateRules(o, prof, Math.floor(Date.now() / 1000)).proposals.find(
        (x) => x.step === p.step,
      );
      if (!fresh) throw new Error("Fresh live read no longer supports this proposal.");
      const now = Math.floor(Date.now() / 1000);
      c.setAgentHandoff({ ...fresh, id: p.id.slice(0, 32), createdAt: now, status: "open" });
      await fns.status({ data: { token, id: p.id, status: "handed-off" } });
      void navigate({ to: "/flywheel" });
    });
  }

  const health = st?.health;
  const alerts = (st?.alerts ?? []).filter((a) => filter === "all" || a.level === filter);
  const num = (k: keyof V2Settings, label: string, step = "any") => (
    <Field label={label}>
      <input
        type="number"
        step={step}
        value={settings[k] as number}
        onChange={(e) => setSettings((s) => ({ ...s, [k]: e.target.valueAsNumber }))}
      />
    </Field>
  );

  return (
    <section className="agent-v2" aria-label="QLi Agent v2">
      <div className="agent-warning" role="note">
        {V2_LEGEND}
      </div>
      <div className="agent-badges">
        <span className={`v2-health ${health?.state ?? "unknown"}`}>
          {health ? health.label : "Worker status shown after wallet sign-in."}
        </span>
        <span>{token ? "Persistent (backend, wallet-signed session)" : "Not signed in"}</span>
      </div>

      <div className="agent-v2-grid">
        <Panel title="Agent profile" tag="v2">
          <div className="instrument-body agent-profile">
            <img
              src="/quantum-qli-hero-anime.webp"
              alt="Quantum QLi agent character"
              width={160}
              height={160}
              loading="lazy"
            />
            <div>
              <strong>{st?.profile?.name ?? "QLi Agent"}</strong>
              <p className="micro">
                Read-only. Hosted inference requires configuration and owner opt-in.
              </p>
              {!wallet ? (
                <p className="micro">Connect a wallet to sign in.</p>
              ) : !token ? (
                <Button size="sm" onClick={signIn} disabled={busy}>
                  <LogIn /> Sign in with wallet (message only)
                </Button>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    void run(async () => {
                      await fns.out({ data: { token } });
                      setToken(null);
                      setSt(null);
                    })
                  }
                >
                  <LogOut /> Sign out
                </Button>
              )}
            </div>
          </div>
        </Panel>

        {token && <VaultSentinelPanel token={token} />}
        {token && st?.profile ? (
          <>
            <Panel title="Hosted inference consent" tag="Owner controlled">
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={st.profile.hostedInferenceEnabled}
                  disabled={busy}
                  onChange={(e) =>
                    void run(() => fns.consent({ data: { token, enabled: e.target.checked } }))
                  }
                />
                Allow optional hosted analysis for this wallet and network (charges may apply)
              </label>
              <p className="micro">
                Each request still requires explicit opt-in. Disabling prevents new reservations;
                already reserved requests may finish. No wallet spending authority is granted.
              </p>
            </Panel>
            <NeuralWorkspace
              token={token}
              pools={st.pools}
              hostedConsent={st.profile.hostedInferenceEnabled}
            />
          </>
        ) : (
          <Panel title="QLi Agent v3 — Neural workspace" tag="Sign in required">
            <p className="micro" data-testid="operator-help">
              {OPERATOR_HELP}. Sign in with your wallet and create a profile to open the workspace;
              until then only deterministic tools are available.
            </p>
          </Panel>
        )}

        {token && st && (
          <Panel title="Monitoring settings" tag={st.session.network.toUpperCase()}>
            <div className="instrument-body">
              <div className="form-grid">
                <Field label="Name">
                  <input maxLength={40} value={name} onChange={(e) => setName(e.target.value)} />
                </Field>
                {num("minClaimSol", "Claim threshold (SOL)")}
                {num("buybackPct", "Buyback share (%)", "1")}
                {num("maxProposalSol", "Max proposal (≤2 SOL)")}
                {num("slippageBps", "Slippage (bps)", "1")}
                {num("minSolReserve", "SOL reserve")}
                {num("migrationAlertPct", "Migration alert (%)")}
                {num("cooldownHours", "Alert cooldown (h)", "1")}
              </div>
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={settings.proposeBurn}
                  onChange={(e) => setSettings((s) => ({ ...s, proposeBurn: e.target.checked }))}
                />
                Propose burns
              </label>
              <div className="agent-actions">
                <Button
                  size="sm"
                  disabled={busy}
                  onClick={() =>
                    void run(() =>
                      fns.save({
                        data: {
                          token,
                          name,
                          active: st.profile?.active ?? true,
                          identityRoot: st.profile?.identityRoot ?? c.identity?.root ?? null,
                          settings,
                        },
                      }),
                    )
                  }
                >
                  {st.profile ? "Save settings" : "Create persistent agent"}
                </Button>
                {st.profile && (
                  <>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      onClick={() =>
                        void run(() =>
                          fns.save({
                            data: {
                              token,
                              name,
                              active: !st.profile!.active,
                              identityRoot: st.profile!.identityRoot,
                              settings,
                            },
                          }),
                        )
                      }
                    >
                      {st.profile.active ? "Pause monitoring" : "Resume monitoring"}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={busy}
                      onClick={() => {
                        if (confirm("Delete this agent and all its stored history?"))
                          void run(() => fns.del({ data: { token } }));
                      }}
                    >
                      <Trash2 /> Delete agent & history
                    </Button>
                  </>
                )}
              </div>
            </div>
          </Panel>
        )}
      </div>

      {err && (
        <div className="error-message" role="alert">
          {err}
        </div>
      )}

      {token && st?.profile && (
        <>
          <Panel title="Monitored pools" tag={`${st.pools.length}/5`}>
            <div className="instrument-body">
              <div className="agent-actions">
                <input
                  aria-label="Pool address"
                  placeholder="Your DBC pool address"
                  value={poolInput}
                  onChange={(e) => setPoolInput(e.target.value.trim())}
                />
                <Button
                  size="sm"
                  disabled={busy || !poolInput}
                  onClick={() =>
                    void run(async () => {
                      await fns.register({ data: { token, pool: poolInput } });
                      setPoolInput("");
                    })
                  }
                >
                  Verify creator & register
                </Button>
                <Button size="sm" variant="outline" disabled={busy} onClick={() => void refresh()}>
                  <RefreshCw /> Refresh
                </Button>
              </div>
              <ul className="agent-list">
                {st.pools.map((p) => (
                  <li key={p.id} className={p.last_error ? "warning" : ""}>
                    <span className="mono">
                      {p.pool.slice(0, 8)}…{p.pool.slice(-4)}
                    </span>{" "}
                    · last scheduled read {ts(p.last_observed_at)} · slot {p.last_slot ?? "—"} ·
                    next ≈ {health?.state === "verified" ? ts(p.next_check_at) : "not scheduled"}
                    {p.last_error && <small> · error: {p.last_error}</small>}
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => void run(() => fns.remove({ data: { token, poolId: p.id } }))}
                    >
                      Remove
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
          </Panel>

          <Panel title="Persisted proposals" tag="NON-EXECUTABLE">
            {st.proposals.length === 0 ? (
              <div className="empty-state">No stored proposals yet.</div>
            ) : (
              <ul className="agent-list">
                {st.proposals.map((p) => (
                  <li key={p.id} className={p.status}>
                    <strong>{p.step.toUpperCase()}</strong> {p.amount}{" "}
                    {p.step === "buyback" ? "SOL" : p.step === "burn" ? "tokens" : ""} · {p.status}
                    <p>{p.rationale}</p>
                    <small>
                      scheduled read {ts(p.observed_at)} · slot {p.slot}
                    </small>
                    {p.status === "open" && (
                      <div className="agent-actions">
                        <Button size="sm" disabled={busy} onClick={() => void reviewLive(p)}>
                          Re-read live & review in Flywheel
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            void run(() =>
                              fns.status({ data: { token, id: p.id, status: "denied" } }),
                            )
                          }
                        >
                          Deny
                        </Button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel title="Alert timeline" tag="RULES">
            <div className="instrument-body">
              <div className="segmented" role="group" aria-label="Filter alerts">
                {(["all", "warning", "info"] as const).map((f) => (
                  <Button
                    key={f}
                    size="sm"
                    variant="ghost"
                    aria-pressed={filter === f}
                    className={filter === f ? "selected" : ""}
                    onClick={() => setFilter(f)}
                  >
                    {f}
                  </Button>
                ))}
              </div>
              {alerts.length === 0 ? (
                <div className="empty-state">No stored alerts.</div>
              ) : (
                <ul className="agent-list">
                  {alerts.map((a) => (
                    <li key={a.id} className={a.level}>
                      <button
                        type="button"
                        className="link-button"
                        aria-expanded={open === a.id}
                        onClick={() => setOpen(open === a.id ? null : a.id)}
                      >
                        <strong>{a.ability}</strong> · {a.title} · {ts(a.observed_at)}
                      </button>
                      {open === a.id && (
                        <pre className="agent-evidence">
                          {`logic: ${a.logic}\nslot: ${a.slot}\n${JSON.stringify(a.evidence, null, 2)}`}
                        </pre>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </Panel>

          <Panel title="Observation history" tag={`${st.observations.length}`}>
            {st.observations.length === 0 ? (
              <div className="empty-state">
                No stored observations. They appear after the scheduled worker runs.
              </div>
            ) : (
              <ul className="agent-list">
                {st.observations.map((o) => {
                  const d = o.data as { claimableQuote?: string; progressPct?: number | null };
                  return (
                    <li key={o.id}>
                      <small>
                        {ts(o.observed_at)} · {o.mode} · slot {o.slot} · fees{" "}
                        {d.claimableQuote ? fromBaseUnits(d.claimableQuote, 9) : "?"} SOL · curve{" "}
                        {d.progressPct == null ? "Unknown" : `${d.progressPct.toFixed(2)}%`} ·{" "}
                        {o.source}
                      </small>
                    </li>
                  );
                })}
              </ul>
            )}
            {st.lastRun && (
              <p className="micro">
                Last worker run {ts(st.lastRun.started_at)} · {st.lastRun.status} ·{" "}
                {st.lastRun.pools_checked} checked · {st.lastRun.errors} errors
              </p>
            )}
          </Panel>
        </>
      )}
    </section>
  );
}