import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Panel, Field } from "./controls";
import {
  ENFORCEMENT_TEXT,
  TEMPLATES,
  advise,
  buildManifest,
  classifyParams,
  compareScenarios,
  defaultPolicy,
  evaluateRules,
  feeSchedule,
  importManifest,
  launchMappable,
  parseAtomic,
  reviewSummary,
  validatePolicy,
  MIGRATION_FEE_OPTIONS,
  type Enforcement,
  type HookInspection,
  type HookPolicy,
  type Manifest,
  type MonitorRule,
} from "@/lib/qli-core/hook-forge";
import { PLAN_STEPS, planAccounts, signingAllowed } from "@/lib/qli-core/hook-launch-plan";
import { TierLadder } from "./hook-proofs";
import { REPOSITORY_EVIDENCE } from "@/lib/qli-core/hook-proof";
import { inspectTransferHook } from "@/lib/qli-core/hook-forge.functions";
import { getPoolIntelligence, getPoolQuote } from "@/lib/qli-core/lifecycle.functions";
import { isAddress } from "@/lib/qli-core/launch-proof";
import type { Snapshot, QuoteResult } from "@/lib/qli-core/lifecycle";

const TABS = [
  "Policy Library",
  "Configure",
  "Simulator",
  "Hook Inspector",
  "Enforcement",
  "Graduation Proof",
  "Review & Export",
] as const;
type Tab = (typeof TABS)[number];
type Net = "mainnet-beta" | "devnet";
const STORE = "qli-hook-forge-session-v1";

function Badge({ kind }: { kind: Enforcement | "hypothesis" | "sdk-estimate" | "verified" }) {
  const label: Record<string, string> = {
    "meteora-enforced": "METEORA ENFORCED",
    "token2022-executed": "TOKEN-2022 EXECUTED",
    "operator-monitored": "OPERATOR MONITORED",
    "advisory-only": "ADVISORY ONLY",
    hypothesis: "HYPOTHESIS",
    "sdk-estimate": "SDK ESTIMATE",
    verified: "VERIFIED ON-CHAIN",
  };
  return <span className={`hf-badge hf-${kind}`}>{label[kind]}</span>;
}

export function HookForge() {
  const [tab, setTab] = useState<Tab>("Policy Library");
  const [policies, setPolicies] = useState<HookPolicy[]>([defaultPolicy()]);
  const [active, setActive] = useState(0);
  const [restored, setRestored] = useState<"none" | "session">("none");
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(STORE);
      if (raw) {
        const v = JSON.parse(raw) as HookPolicy[];
        if (Array.isArray(v) && v.length) {
          setPolicies(v);
          setRestored("session");
        }
      }
    } catch {
      /* ignore */
    }
  }, []);
  useEffect(() => {
    try {
      sessionStorage.setItem(STORE, JSON.stringify(policies));
    } catch {
      /* ignore */
    }
  }, [policies]);
  const p = policies[Math.min(active, policies.length - 1)]!;
  const update = (np: HookPolicy) => setPolicies((ps) => ps.map((x, i) => (i === active ? np : x)));

  return (
    <div className="hf-root">
      <div className="cs-banner" role="note">
        <strong>Read-only workstation.</strong>
        <span>
          Hook Forge never builds, signs or sends a transaction. Policies are stored in this browser
          tab only{restored === "session" ? " (restored from this tab session)" : ""}; closing the
          tab discards them.
        </span>
      </div>
      <div className="hf-enforce">
        {(
          [
            "meteora-enforced",
            "token2022-executed",
            "operator-monitored",
            "advisory-only",
          ] as Enforcement[]
        ).map((k) => (
          <div key={k}>
            <Badge kind={k} />
            <p>{ENFORCEMENT_TEXT[k]}</p>
          </div>
        ))}
      </div>
      <div className="hf-tabs" role="tablist" aria-label="Hook Forge sections">
        {TABS.map((t) => (
          <button
            key={t}
            role="tab"
            type="button"
            aria-selected={tab === t}
            className={tab === t ? "active" : ""}
            onClick={() => setTab(t)}
          >
            {t}
          </button>
        ))}
      </div>
      <div className="hf-policy-bar">
        <span className="micro">POLICIES</span>
        {policies.map((x, i) => (
          <button
            key={i}
            type="button"
            className={i === active ? "active" : ""}
            onClick={() => setActive(i)}
          >
            {x.name}
          </button>
        ))}
        {policies.length < 4 && (
          <button
            type="button"
            onClick={() => {
              setPolicies((ps) => [...ps, { ...p, name: `${p.name} (copy)` }]);
              setActive(policies.length);
            }}
          >
            + Duplicate
          </button>
        )}
        {policies.length > 1 && (
          <button
            type="button"
            onClick={() => {
              if (window.confirm(`Remove policy "${p.name}"?`)) {
                setPolicies((ps) => ps.filter((_, i) => i !== active));
                setActive(0);
              }
            }}
          >
            Remove
          </button>
        )}
      </div>
      {tab === "Policy Library" && (
        <Library
          onUse={(np) => {
            setPolicies((ps) => [...ps, np].slice(-4));
            setActive(Math.min(policies.length, 3));
            setTab("Configure");
          }}
        />
      )}
      {tab === "Configure" && <Configure p={p} onChange={update} />}
      {tab === "Simulator" && <Simulator policies={policies} />}
      {tab === "Hook Inspector" && <Inspector />}
      {tab === "Enforcement" && <Enforcement />}
      {tab === "Graduation Proof" && <GraduationProof />}
      {tab === "Review & Export" && (
        <Review
          policies={policies}
          onImport={(ps) => {
            setPolicies(ps);
            setActive(0);
          }}
        />
      )}
    </div>
  );
}

function Library({ onUse }: { onUse: (p: HookPolicy) => void }) {
  return (
    <Panel title="Policy Library" tag="SDK 1.5.13">
      <div className="hf-list">
        {TEMPLATES.map((t) => (
          <article key={t.id} className="hf-item">
            <header>
              <strong>{t.title}</strong>
              <Badge kind={t.enforcement} />
            </header>
            <p>{t.summary}</p>
            {t.policy ? (
              <button
                type="button"
                className="hf-btn"
                onClick={() => onUse(structuredClone(t.policy!))}
              >
                Use template
              </button>
            ) : (
              <small>
                {t.enforcement === "advisory-only"
                  ? "Disabled: requires audited program, independent review and devnet evidence."
                  : "Configure in Simulator (rules) or Hook Inspector."}
              </small>
            )}
          </article>
        ))}
      </div>
    </Panel>
  );
}

function num(v: string) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function Configure({ p, onChange }: { p: HookPolicy; onChange: (p: HookPolicy) => void }) {
  const findings = validatePolicy(p);
  const f = p.baseFee;
  const setFee = (k: keyof HookPolicy["baseFee"], v: string | number) =>
    onChange({ ...p, baseFee: { ...f, [k]: k === "mode" ? v : Math.trunc(num(String(v))) } });
  const sched = findings.some((x) => x.field === "baseFee" && x.severity === "error")
    ? []
    : feeSchedule(p);
  const maxBps = Math.max(1, ...sched.map((s) => Number(s.bps)));
  return (
    <div className="hf-grid">
      <Panel title="Configure DBC policy" tag="METEORA ENFORCED">
        <div className="instrument-body form-grid">
          <Field label="Policy name">
            <input
              value={p.name}
              maxLength={60}
              onChange={(e) => onChange({ ...p, name: e.target.value })}
            />
          </Field>
          <Field label="Base fee mode">
            <select value={f.mode} onChange={(e) => setFee("mode", e.target.value)}>
              <option value="flat">Flat</option>
              <option value="linear">Linear scheduler</option>
              <option value="exponential">Exponential scheduler</option>
            </select>
          </Field>
          <Field label="Starting fee (bps)" hint="SDK range 25 to 9900">
            <input
              type="number"
              value={f.startingBps}
              onChange={(e) => setFee("startingBps", e.target.value)}
            />
          </Field>
          <Field label="Ending fee (bps)">
            <input
              type="number"
              value={f.endingBps}
              onChange={(e) => setFee("endingBps", e.target.value)}
            />
          </Field>
          <Field label="Number of periods">
            <input
              type="number"
              value={f.numberOfPeriod}
              onChange={(e) => setFee("numberOfPeriod", e.target.value)}
            />
          </Field>
          <Field label={`Total duration (${p.activationType === "slot" ? "slots" : "seconds"})`}>
            <input
              type="number"
              value={f.totalDuration}
              onChange={(e) => setFee("totalDuration", e.target.value)}
            />
          </Field>
          <Field label="Activation type">
            <select
              value={p.activationType}
              onChange={(e) =>
                onChange({ ...p, activationType: e.target.value as "slot" | "timestamp" })
              }
            >
              <option value="timestamp">Timestamp</option>
              <option value="slot">Slot</option>
            </select>
          </Field>
          <Field label="Dynamic fee">
            <select
              value={p.dynamicFee ? "on" : "off"}
              onChange={(e) => onChange({ ...p, dynamicFee: e.target.value === "on" })}
            >
              <option value="on">Enabled</option>
              <option value="off">Disabled</option>
            </select>
          </Field>
          <Field label="Creator fee share (%)">
            <input
              type="number"
              min={0}
              max={100}
              value={p.creatorTradingFeePercent}
              onChange={(e) =>
                onChange({ ...p, creatorTradingFeePercent: Math.trunc(num(e.target.value)) })
              }
            />
          </Field>
          <Field label="Collect fee in">
            <select
              value={p.collectFeeMode}
              onChange={(e) =>
                onChange({ ...p, collectFeeMode: e.target.value as "quote" | "output" })
              }
            >
              <option value="quote">Quote token</option>
              <option value="output">Output token</option>
            </select>
          </Field>
          <Field label="Initial market cap (quote units)">
            <input
              type="number"
              value={p.initialMarketCap}
              onChange={(e) => onChange({ ...p, initialMarketCap: num(e.target.value) })}
            />
          </Field>
          <Field label="Migration market cap (quote units)">
            <input
              type="number"
              value={p.migrationMarketCap}
              onChange={(e) => onChange({ ...p, migrationMarketCap: num(e.target.value) })}
            />
          </Field>
          <Field label="Migration fee option (DAMM v2)">
            <select
              value={p.migrationFeeOption}
              onChange={(e) =>
                onChange({
                  ...p,
                  migrationFeeOption: e.target.value as HookPolicy["migrationFeeOption"],
                })
              }
            >
              {Object.keys(MIGRATION_FEE_OPTIONS).map((k) => (
                <option key={k}>{k}</option>
              ))}
            </select>
          </Field>
          <Field label="Token program">
            <select
              value={p.tokenType}
              onChange={(e) => onChange({ ...p, tokenType: e.target.value as "spl" | "token2022" })}
            >
              <option value="spl">SPL Token</option>
              <option value="token2022">Token-2022</option>
            </select>
          </Field>
          <Field label="Locked vesting amount (tokens)">
            <input
              type="number"
              value={p.lockedVesting.totalLockedVestingAmount}
              onChange={(e) =>
                onChange({
                  ...p,
                  lockedVesting: {
                    ...p.lockedVesting,
                    totalLockedVestingAmount: Math.trunc(num(e.target.value)),
                  },
                })
              }
            />
          </Field>
          <Field label="Transfer constraint (advisory)">
            <select
              value={p.advisory.transferConstraint ? "on" : "off"}
              onChange={(e) =>
                onChange({
                  ...p,
                  advisory: { ...p.advisory, transferConstraint: e.target.value === "on" },
                })
              }
            >
              <option value="off">None</option>
              <option value="on">Request (not enforceable)</option>
            </select>
          </Field>
          <Field label="Custom transfer hook (advisory)">
            <select
              value={p.advisory.customTransferHook ? "on" : "off"}
              onChange={(e) =>
                onChange({
                  ...p,
                  advisory: { ...p.advisory, customTransferHook: e.target.value === "on" },
                })
              }
            >
              <option value="off">None</option>
              <option value="on">Request (blocked)</option>
            </select>
          </Field>
        </div>
      </Panel>
      <div className="hf-side">
        <Panel
          title="Validation"
          tag={findings.some((x) => x.severity === "error") ? "BLOCKED" : "VALID"}
        >
          <ul className="hf-findings" aria-live="polite">
            {findings.length === 0 && <li className="info">No findings. SDK rules satisfied.</li>}
            {findings.map((x, i) => (
              <li key={i} className={x.severity}>
                <strong>{x.severity.toUpperCase()}</strong> {x.message}
              </li>
            ))}
          </ul>
        </Panel>
        <Panel title="Base fee schedule" tag="DERIVED, SDK MATH">
          {sched.length === 0 ? (
            <p className="hf-empty">Fix fee errors to see the schedule.</p>
          ) : (
            <div className="hf-chart" role="img" aria-label="Base fee per period">
              {sched.map((s) => (
                <div
                  key={s.period}
                  title={`Period ${s.period}: ${s.bps} bps`}
                  style={{ height: `${(Number(s.bps) / maxBps) * 100}%` }}
                />
              ))}
            </div>
          )}
          <small>Base fee only. Dynamic fee adds a volatility component not modelled here.</small>
        </Panel>
      </div>
    </div>
  );
}

function Simulator({ policies }: { policies: HookPolicy[] }) {
  const [amount, setAmount] = useState("1000000000");
  const [periodsText, setPeriodsText] = useState("0,5,10");
  const atomic = parseAtomic(amount);
  const periods = periodsText
    .split(",")
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isInteger(n) && n >= 0 && n <= 65_535)
    .slice(0, 6);
  const valid = policies.filter(
    (p) => !validatePolicy(p).some((f) => f.severity === "error" && f.field === "baseFee"),
  );
  const rows = atomic !== null && periods.length ? compareScenarios(valid, atomic, periods) : [];
  return (
    <div className="settings-stack">
      <Panel title="Scenario comparison" tag="HYPOTHESIS">
        <div className="instrument-body form-grid">
          <Field label="Input amount (atomic units)" hint="Integer, up to u64">
            <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="numeric" />
          </Field>
          <Field label="Periods (comma separated)">
            <input value={periodsText} onChange={(e) => setPeriodsText(e.target.value)} />
          </Field>
        </div>
        {atomic === null && (
          <p className="hf-findings error">Amount must be a positive integer within u64.</p>
        )}
        <p className="hf-note">
          <Badge kind="hypothesis" /> Exact SDK base-fee arithmetic (fee rounded up, 20% protocol
          share rounded down). Excludes dynamic fee, curve price impact and referral. Not an
          execution.
        </p>
        <div className="hf-table-wrap">
          <table className="hf-table">
            <thead>
              <tr>
                <th>Policy</th>
                <th>Period</th>
                <th>Fee bps</th>
                <th>Total fee</th>
                <th>Protocol</th>
                <th>Creator</th>
                <th>Partner</th>
                <th>After fee</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={8}>No valid scenarios.</td>
                </tr>
              )}
              {rows.map((r, i) => (
                <tr key={i}>
                  <td>{r.policy}</td>
                  <td>{r.period}</td>
                  <td>{r.feeBps}</td>
                  <td>{r.totalFee}</td>
                  <td>{r.protocolFee}</td>
                  <td>{r.creatorShare}</td>
                  <td>{r.partnerShare}</td>
                  <td>{r.amountAfterFee}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
      <LivePool />
    </div>
  );
}

function LivePool() {
  const [net, setNet] = useState<Net>("devnet");
  const [pool, setPool] = useState("");
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [quote, setQuote] = useState<QuoteResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [rules, setRules] = useState<MonitorRule[]>([
    { id: "r1", kind: "curve-progress", threshold: "80" },
    { id: "r2", kind: "migration-flag", threshold: "1" },
  ]);
  const intel = useServerFn(getPoolIntelligence);
  const quoteFn = useServerFn(getPoolQuote);
  const evals = evaluateRules(rules, snap);
  const load = async () => {
    setBusy(true);
    setMsg(null);
    setQuote(null);
    try {
      const r = await intel({ data: { network: net, pool: pool.trim() } });
      if (r.ok) setSnap(r.snapshot);
      else {
        setSnap(null);
        setMsg(r.message);
      }
    } catch {
      setSnap(null);
      setMsg("Lookup failed. Nothing was verified.");
    }
    setBusy(false);
  };
  return (
    <Panel title="Verified pool and monitor rule proposals" tag="READ-ONLY">
      <form
        className="instrument-body form-grid"
        onSubmit={(e) => {
          e.preventDefault();
          if (isAddress(pool.trim())) void load();
        }}
      >
        <Field label="Network">
          <select value={net} onChange={(e) => setNet(e.target.value as Net)}>
            <option value="devnet">devnet</option>
            <option value="mainnet-beta">mainnet-beta</option>
          </select>
        </Field>
        <Field label="DBC pool address">
          <input
            value={pool}
            onChange={(e) => setPool(e.target.value)}
            placeholder="Base58 pool address"
          />
        </Field>
        <button className="hf-btn" type="submit" disabled={busy || !isAddress(pool.trim())}>
          {busy ? "Reading…" : "Load verified snapshot"}
        </button>
      </form>
      {msg && (
        <p className="hf-findings error" role="status">
          {msg}
        </p>
      )}
      {snap && (
        <div className="hf-note">
          <Badge kind="verified" /> Pool {snap.pool.slice(0, 6)}… on {snap.network}, slot{" "}
          {snap.observedSlot}, progress {snap.facts.migrationProgress}, migrated flag{" "}
          {snap.facts.isMigrated}, quote fees {snap.facts.totalTradingQuoteFee}.
          <button
            className="hf-btn"
            type="button"
            onClick={async () => {
              const r = await quoteFn({
                data: {
                  network: net,
                  pool: snap.pool,
                  direction: "buy",
                  amountIn: "100000000",
                  slippageBps: 100,
                },
              });
              setQuote(r as QuoteResult);
            }}
          >
            SDK quote 0.1 SOL buy
          </button>
          {quote &&
            (quote.ok ? (
              <span>
                {" "}
                <Badge kind="sdk-estimate" /> Output {quote.outputAmount}, trading fee{" "}
                {quote.tradingFee}, protocol fee {quote.protocolFee} (slot {quote.observedSlot}).
              </span>
            ) : (
              <span> Quote unavailable.</span>
            ))}
        </div>
      )}
      <div className="hf-table-wrap">
        <table className="hf-table">
          <thead>
            <tr>
              <th>Rule</th>
              <th>Threshold</th>
              <th>Observed</th>
              <th>Dry-run status</th>
              <th>Source</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {evals.map((e, i) => (
              <tr key={e.rule.id}>
                <td>
                  <select
                    aria-label="Rule kind"
                    value={e.rule.kind}
                    onChange={(ev) =>
                      setRules((rs) =>
                        rs.map((r, j) =>
                          j === i ? { ...r, kind: ev.target.value as MonitorRule["kind"] } : r,
                        ),
                      )
                    }
                  >
                    <option value="quote-fee-threshold">Quote fee ≥</option>
                    <option value="curve-progress">Curve progress ≥</option>
                    <option value="migration-flag">Migrated flag ≥</option>
                  </select>
                </td>
                <td>
                  <input
                    aria-label="Threshold"
                    value={e.rule.threshold}
                    onChange={(ev) =>
                      /^[0-9]{0,20}$/.test(ev.target.value) &&
                      setRules((rs) =>
                        rs.map((r, j) =>
                          j === i ? { ...r, threshold: ev.target.value || "0" } : r,
                        ),
                      )
                    }
                  />
                </td>
                <td>{e.observed ?? "N/A"}</td>
                <td>{e.status}</td>
                <td>{e.source}</td>
                <td>
                  <button
                    type="button"
                    className="hf-btn"
                    onClick={() => setRules((rs) => rs.filter((_, j) => j !== i))}
                  >
                    Remove
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rules.length < 6 && (
        <button
          type="button"
          className="hf-btn"
          onClick={() =>
            setRules((rs) => [
              ...rs,
              { id: `r${Date.now()}`, kind: "quote-fee-threshold", threshold: "0" },
            ])
          }
        >
          Add rule proposal
        </button>
      )}
      <small>
        Dry-run only, evaluated when you load a snapshot. No background scheduler runs these rules
        and nothing is triggered automatically.
      </small>
    </Panel>
  );
}

function Inspector() {
  const [net, setNet] = useState<Net>("devnet");
  const [kind, setKind] = useState<"mint" | "pool">("mint");
  const [addr, setAddr] = useState("");
  const [r, setR] = useState<HookInspection | null>(null);
  const [busy, setBusy] = useState(false);
  const fn = useServerFn(inspectTransferHook);
  const ok = isAddress(addr.trim());
  return (
    <div className="hf-grid">
      <Panel title="Token-2022 TransferHook inspector" tag="SERVER-TRUSTED RPC">
        <form
          className="instrument-body form-grid"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!ok) return;
            setBusy(true);
            try {
              setR(await fn({ data: { network: net, address: addr.trim(), kind } }));
            } catch {
              setR(null);
            }
            setBusy(false);
          }}
        >
          <Field label="Network">
            <select value={net} onChange={(e) => setNet(e.target.value as Net)}>
              <option value="devnet">devnet</option>
              <option value="mainnet-beta">mainnet-beta</option>
            </select>
          </Field>
          <Field label="Address type">
            <select value={kind} onChange={(e) => setKind(e.target.value as "mint" | "pool")}>
              <option value="mint">Token mint</option>
              <option value="pool">DBC pool</option>
            </select>
          </Field>
          <Field label="Address">
            <input
              value={addr}
              onChange={(e) => setAddr(e.target.value)}
              placeholder="Base58 address"
            />
          </Field>
          <button type="submit" className="hf-btn" disabled={!ok || busy}>
            {busy ? "Inspecting…" : "Inspect"}
          </button>
        </form>
        <small>
          Transfer hooks are Token-2022 token transfer callbacks. They are not Meteora swap
          callbacks and not EVM-style pool hooks.
        </small>
      </Panel>
      <Panel title="Inspection result" tag={r ? r.code.toUpperCase() : "EMPTY"}>
        {!r ? (
          <p className="hf-empty">
            Enter a mint or DBC pool. Nothing is assumed compatible until inspected.
          </p>
        ) : (
          <div className="instrument-body hf-result">
            <p role="status">
              {r.message}
              {r.observedSlot !== null ? ` Observed slot ${r.observedSlot}.` : ""}
            </p>
            {r.mint && (
              <p>
                Mint: <code>{r.mint}</code> · Program: {r.tokenProgram ?? "unknown"}
              </p>
            )}
            {r.extensions.length > 0 && <p>Extensions: {r.extensions.join(", ")}</p>}
            {r.transferHook && (
              <dl className="hf-dl">
                <dt>Hook program</dt>
                <dd>{r.transferHook.programId ?? "Disabled (default key)"}</dd>
                <dt>Executable</dt>
                <dd>
                  {r.transferHook.programExecutable === null
                    ? "unknown"
                    : String(r.transferHook.programExecutable)}
                </dd>
                <dt>Upgradeable</dt>
                <dd>
                  {r.transferHook.upgradeable === null
                    ? "unknown"
                    : String(r.transferHook.upgradeable)}
                </dd>
                <dt>Extra-account-meta PDA</dt>
                <dd>
                  {r.transferHook.extraMetaPda ?? "n/a"}{" "}
                  {r.transferHook.extraMetaExists === null
                    ? ""
                    : r.transferHook.extraMetaExists
                      ? "(exists, hook-owned)"
                      : "(missing)"}
                </dd>
                <dt>Meta contents</dt>
                <dd>Not validated: QLi does not simulate hook runtime behaviour.</dd>
              </dl>
            )}
            {r.permissions.length > 0 && (
              <table className="hf-table">
                <thead>
                  <tr>
                    <th>Permission</th>
                    <th>Value</th>
                    <th>Status</th>
                    <th>Source</th>
                  </tr>
                </thead>
                <tbody>
                  {r.permissions.map((x) => (
                    <tr key={x.label}>
                      <td>{x.label}</td>
                      <td>
                        <code>{x.value ?? "none"}</code>
                      </td>
                      <td>{x.status}</td>
                      <td>{x.source}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {r.risks.length > 0 && (
              <ul className="hf-findings">
                {r.risks.map((x, i) => (
                  <li
                    key={i}
                    className={
                      x.level === "high" ? "error" : x.level === "medium" ? "warning" : "info"
                    }
                  >
                    <strong>{x.level.toUpperCase()}</strong> {x.text}
                  </li>
                ))}
              </ul>
            )}
            {r.ok && (
              <dl className="hf-dl">
                <dt>DBC SDK path</dt>
                <dd>{r.compatibility.dbcSdkPath}</dd>
                <dt>Launch Forge</dt>
                <dd>{r.compatibility.launchForge}</dd>
                <dt>DAMM v2 migration</dt>
                <dd>{r.compatibility.dammV2Migration}</dd>
                <dt>Verdict</dt>
                <dd>
                  <strong>{r.compatibility.verdict.toUpperCase()}</strong> · never reported as
                  compatible without devnet evidence. Not an audit.
                </dd>
              </dl>
            )}
          </div>
        )}
      </Panel>
    </div>
  );
}

function Review({
  policies,
  onImport,
}: {
  policies: HookPolicy[];
  onImport: (p: HookPolicy[]) => void;
}) {
  const [m, setM] = useState<Manifest | null>(null);
  const [imp, setImp] = useState<string | null>(null);
  const key = useMemo(() => JSON.stringify(policies), [policies]);
  useEffect(() => {
    let live = true;
    void buildManifest(policies).then((x) => live && setM(x));
    return () => {
      live = false;
    };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  const download = () => {
    if (!m) return;
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(m, null, 2)], { type: "application/json" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `qli-hook-forge-${m.digest.slice(0, 12)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };
  return (
    <div className="settings-stack">
      {policies.map((p, i) => (
        <Panel
          key={i}
          title={`Review: ${p.name}`}
          tag={launchMappable(p) ? "LAUNCH FORGE MAPPABLE" : "EXPORT PLAN ONLY"}
        >
          <div className="instrument-body">
            <ul>
              {reviewSummary(p).map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ul>
            <div className="hf-table-wrap">
              <table className="hf-table">
                <thead>
                  <tr>
                    <th>Parameter</th>
                    <th>Enforcement</th>
                    <th>Launch Forge</th>
                    <th>Note</th>
                  </tr>
                </thead>
                <tbody>
                  {classifyParams(p).map((c) => (
                    <tr key={c.field}>
                      <td>{c.field}</td>
                      <td>
                        <Badge kind={c.enforcement} />
                      </td>
                      <td>{c.launchForge}</td>
                      <td>{c.note}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <h3 className="micro">QLi Operator advisor</h3>
            <ul className="hf-findings">
              {advise(p).map((a) => (
                <li key={a.id} className="info">
                  <strong>{a.title}.</strong> {a.detail} <em>Human review: {a.humanReview}</em>
                </li>
              ))}
            </ul>
            {launchMappable(p) ? (
              <p>
                Enter these exact values in{" "}
                <Link to="/launch" className="desk-link">
                  Launch Forge
                </Link>
                : fee {p.baseFee.startingBps} bps, creator fee {p.creatorTradingFeePercent}%, market
                cap {p.initialMarketCap} to {p.migrationMarketCap}. Launch Forge re-validates,
                simulates and asks your wallet to approve. Nothing is transferred automatically: you
                re-enter and review every value yourself.
              </p>
            ) : (
              <p>
                Not applied to Launch Forge: one or more values are not wired into the verified
                launch path.
              </p>
            )}
          </div>
        </Panel>
      ))}
      <Panel title="Policy manifest" tag="INTEGRITY CHECKSUM">
        <div className="instrument-body">
          <p>
            SHA-256 digest (domain separated, canonical JSON). This is an integrity checksum, not a
            signature or on-chain proof.
          </p>
          <code className="hf-digest">{m?.digest ?? "computing…"}</code>
          <div className="hf-actions">
            <button type="button" className="hf-btn" onClick={download} disabled={!m}>
              Download JSON manifest
            </button>
            <label className="hf-btn">
              Import manifest
              <input
                type="file"
                accept="application/json"
                hidden
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  const r = await importManifest(await f.text());
                  if (r.ok) {
                    onImport(r.manifest.policies);
                    setImp("Imported and digest verified.");
                  } else setImp(r.error);
                }}
              />
            </label>
          </div>
          {imp && <p role="status">{imp}</p>}
        </div>
      </Panel>
    </div>
  );
}

function Enforcement() {
  const [mint, setMint] = useState("");
  const [hook, setHook] = useState("");
  const plan = planAccounts(mint.trim(), hook.trim());
  const gate = signingAllowed("devnet");
  return (
    <div className="settings-stack">
      <Panel title="Enforcement status" tag="RESEARCH HOOK">
        <div className="instrument-body">
          <ul className="hf-findings">
            <li className="info">
              <strong>CONFIG-ONLY</strong> DBC fee, curve and migration values: enforced by Meteora
              DBC once a config exists.
            </li>
            <li className={REPOSITORY_EVIDENCE.unitTests === "PASSED" ? "info" : "warning"}>
              <strong>LOCALLY TESTED</strong> Research hook (pause / receiver allowlist) unit tests:{" "}
              {REPOSITORY_EVIDENCE.unitTests}. Local Token-2022 CPI test:{" "}
              {REPOSITORY_EVIDENCE.localValidatorCpi} (see docs).
            </li>
            <li className="warning">
              <strong>DEVNET DEMONSTRATED</strong> Not yet. Requires an owner deployment and
              evidence on Hook Proofs.
            </li>
            <li className="error">
              <strong>AUDITED</strong> No. The research hook has no audit or independent review.
            </li>
          </ul>
        </div>
      </Panel>
      <Panel title="Devnet account plan" tag="DETERMINISTIC, NO TRANSACTION">
        <div className="instrument-body form-grid">
          <Field label="Token-2022 mint">
            <input
              value={mint}
              onChange={(e) => setMint(e.target.value)}
              placeholder="Base58 mint"
            />
          </Field>
          <Field label="Your deployed hook program">
            <input
              value={hook}
              onChange={(e) => setHook(e.target.value)}
              placeholder="Base58 program id"
            />
          </Field>
        </div>
        {plan ? (
          <dl className="hf-dl instrument-body">
            <dt>ExtraAccountMetaList PDA</dt>
            <dd>
              <code>{plan.extraAccountMetaList}</code>
            </dd>
            <dt>QLi policy config PDA</dt>
            <dd>
              <code>{plan.qliPolicyConfig}</code>
            </dd>
            <dt>Note</dt>
            <dd>{plan.note}</dd>
          </dl>
        ) : (
          <p className="hf-empty">Enter both addresses to derive the hook accounts.</p>
        )}
        <div className="hf-table-wrap">
          <table className="hf-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Step</th>
                <th>Program</th>
                <th>Signer</th>
                <th>SDK / CLI</th>
                <th>Evidence</th>
              </tr>
            </thead>
            <tbody>
              {PLAN_STEPS.map((s) => (
                <tr key={s.n}>
                  <td>{s.n}</td>
                  <td>{s.title}</td>
                  <td>{s.program}</td>
                  <td>{s.signer}</td>
                  <td>
                    <code>{s.sdkOrCli}</code>
                  </td>
                  <td>{s.evidence}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="instrument-body">
          <button type="button" className="hf-btn" disabled aria-describedby="hf-sign-blocked">
            Build and sign devnet transaction
          </button>
          <ul id="hf-sign-blocked" className="hf-findings">
            {gate.reasons.map((r) => (
              <li key={r} className="error">
                {r}
              </li>
            ))}
          </ul>
        </div>
      </Panel>
    </div>
  );
}

const SAMPLE_PROOF = JSON.stringify(
  {
    network: "devnet",
    mint: "<Token-2022 mint>",
    hookProgram: "<your deployed hook>",
    dbcPool: "<DBC TransferHookPool>",
    dammPool: "<DAMM v2 pool>",
    txs: [
      { signature: "<allowed transfer>", claim: "transfer-allow" },
      { signature: "<denied transfer>", claim: "transfer-deny" },
      { signature: "<swap>", claim: "dbc-swap" },
      { signature: "<migration>", claim: "migration" },
    ],
  },
  null,
  2,
);

function GraduationProof() {
  return (
    <Panel title="Graduation proof" tag="EVIDENCE TIERS">
      <div className="instrument-body">
        <TierLadder
          tier={
            REPOSITORY_EVIDENCE.localValidatorCpi === "PASSED"
              ? "LOCAL_VALIDATOR_TESTED"
              : REPOSITORY_EVIDENCE.unitTests === "PASSED"
                ? "LOCAL_UNIT_TESTED"
                : null
          }
        />
        <p>
          Higher tiers are granted only by{" "}
          <Link to="/hook-proofs" className="desk-link">
            Hook Proofs
          </Link>{" "}
          ·{" "}
          <Link to="/hook-devnet" className="desk-link">
            Hook Devnet Console
          </Link>{" "}
          from real devnet RPC evidence. A migrated flag alone never proves the DAMM v2 link: the
          migrationDammV2 instruction must bind the DBC pool, DAMM v2 pool and base mint.
        </p>
        <h3 className="micro">Sample proof request (placeholders, not real transactions)</h3>
        <pre className="hf-digest">{SAMPLE_PROOF}</pre>
      </div>
    </Panel>
  );
}