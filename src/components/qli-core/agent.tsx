import { useState } from "react";
import { ArrowUpRight, ShieldCheck, Orbit, FlaskConical, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { PageHeading, Panel, Field } from "./controls";
import { useConsole } from "@/lib/qli-core/context";
import { pools } from "@/lib/qli-core/data";
import { strategySchema } from "@/lib/qli-core/validation";
export function AgentPage() {
  const c = useConsole();
  const [pool, setPool] = useState(c.strategyRepository.load()?.pool ?? c.targetPool);
  const [dry, setDry] = useState(c.strategyRepository.load()?.dryRun ?? true);
  const [values, setValues] = useState(
    c.strategyRepository.load()?.values ?? {
      lower: 40,
      upper: 60,
      threshold: 5,
      slippage: c.settings.slippage,
      trade: 2.5,
      reserve: 0.1,
      cooldown: 120,
      actions: 12,
      harvest: 0.05,
    },
  );
  const [modules, setModules] = useState(
    c.strategyRepository.load()?.modules ?? [
      "Inventory Balancer",
      "Fee Harvester",
      "Migration Watcher",
    ],
  );
  const [conditions, setConditions] = useState(
    c.strategyRepository.load()?.pauseConditions ?? [
      "RPC degradation",
      "Price impact",
      "Migration reached",
      "Wallet disconnect",
    ],
  );
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const selected = pools.find((p) => p.id === pool) ?? pools[0];
  if (!selected) return <div className="empty-state">No target pools available.</div>;
  function plan() {
    if (!selected) return;
    const r = strategySchema.safeParse(values);
    if (!r.success) {
      setError(r.error.issues[0]?.message ?? "Invalid strategy values.");
      return;
    }
    setError("");
    const steps = [
      `Read ${selected.token}/${selected.quote} reserves and validate the ${values.lower}–${values.upper}% inventory band.`,
      `Check ${values.slippage} bps slippage, ${values.reserve} SOL reserve and ${values.actions} actions/hour limit.`,
      ...modules.map((m) =>
        m === "Inventory Balancer"
          ? `Preview inventory rebalance capped at ${values.trade} ${selected.quote}; trigger above ${values.threshold}% deviation.`
          : m === "Fee Harvester"
            ? `Preview fee claim only above ${values.harvest} ${selected.quote}.`
            : m === "Migration Watcher"
              ? `Check quote reserve against ${selected.threshold} ${selected.quote} DAMM v2 threshold.`
              : `Evaluate ${m.toLowerCase()} guardrail.`,
      ),
      `Require client wallet review and signing. Enforce ${values.cooldown}s cooldown; stop on ${conditions.join(", ").toLowerCase() || "manual pause"}.`,
    ];
    c.setPlan({
      title: `${selected.token} · Execution Plan`,
      steps,
      accounts: [
        c.account ? `Wallet fee payer ${c.account.address}` : "Wallet fee payer (not connected)",
        `${selected.token} DBC virtual pool (demo)`,
        `${selected.quote} quote vault`,
        `${selected.token} base vault`,
        "Meteora DBC program",
      ],
      fee: "~0.000015 SOL + pool fees",
      signatures: modules.filter((m) => m === "Inventory Balancer" || m === "Fee Harvester").length,
    });
    c.log(`Execution plan generated: ${selected.token}`, "Agent", selected.token);
  }
  const fields: [keyof typeof values, string, string][] = [
    ["lower", "Inventory lower band", "%"],
    ["upper", "Inventory upper band", "%"],
    ["threshold", "Rebalance threshold", "%"],
    ["slippage", "Max slippage", "bps"],
    ["trade", "Max trade size", selected.quote],
    ["reserve", "Min SOL reserve", "SOL"],
    ["cooldown", "Cooldown", "seconds"],
    ["actions", "Max actions / hour", "actions"],
    ["harvest", "Fee harvesting threshold", selected.quote],
  ];
  return (
    <>
      <PageHeading
        eyebrow="STRATEGY / CONTROL PLANE"
        title="QLi Operator"
        description="Deterministic strategies. Explicit guardrails. Every execution remains wallet-controlled."
        action={
          <Button
            variant="outline"
            onClick={() => {
              const r = strategySchema.safeParse(values);
              if (!r.success) {
                setError(r.error.issues[0]?.message ?? "Invalid strategy values.");
                return;
              }
              c.strategyRepository.save({
                mode: c.mode,
                pool,
                dryRun: dry,
                values: r.data,
                modules,
                pauseConditions: conditions,
              });
              setSaved(true);
              c.log("Strategy snapshot saved in current session");
              setTimeout(() => setSaved(false), 2000);
            }}
          >
            <Save />
            {saved ? "Saved this session" : "Save snapshot"}
          </Button>
        }
      />
      <div className="strategy-layout">
        <div>
          <Panel title="Execution parameters" tag="AGENT / 01">
            <div className="instrument-body">
              <div className="field mb-6">
                <span>Agent mode</span>
                <div className="segmented">
                  {["Observe", "Guarded", "Autonomous"].map((m) => (
                    <Button
                      key={m}
                      variant="ghost"
                      aria-pressed={c.mode === m}
                      className={c.mode === m ? "selected" : ""}
                      onClick={() => c.setMode(m)}
                    >
                      {m}
                    </Button>
                  ))}
                </div>
                <small>
                  {c.mode === "Observe"
                    ? "Read and preview only. No transaction execution."
                    : c.mode === "Guarded"
                      ? "Every proposed action requires explicit wallet approval."
                      : "Scheduling preview only. Autonomous signing is not enabled."}
                </small>
              </div>
              <Field label="Target DBC pool">
                <select value={pool} onChange={(e) => setPool(e.target.value)}>
                  {pools.map((p) => (
                    <option value={p.id} key={p.id}>
                      {p.name} · {p.token}/{p.quote} · Demo
                    </option>
                  ))}
                </select>
              </Field>
              <div className="form-grid mt-6">
                {fields.map(([key, label, unit]) => (
                  <Field key={key} label={`${label} (${unit})`}>
                    <input
                      type="number"
                      step="any"
                      value={values[key]}
                      onChange={(e) => setValues((v) => ({ ...v, [key]: e.target.valueAsNumber }))}
                    />
                  </Field>
                ))}
              </div>
              {error && (
                <div className="error-message" role="alert">
                  {error}
                </div>
              )}
            </div>
          </Panel>
          <Panel title="Pause conditions" tag="FAIL CLOSED">
            <div className="instrument-body form-grid">
              {["RPC degradation", "Price impact", "Migration reached", "Wallet disconnect"].map(
                (v) => (
                  <label className="checkbox-label" key={v}>
                    <input
                      type="checkbox"
                      checked={conditions.includes(v)}
                      onChange={(e) =>
                        setConditions((a) =>
                          e.target.checked ? [...a, v] : a.filter((x) => x !== v),
                        )
                      }
                    />
                    {v}
                  </label>
                ),
              )}
            </div>
          </Panel>
        </div>
        <div>
          <Panel title="Strategy modules" tag={`${String(modules.length).padStart(2, "0")} / 05`}>
            <div className="instrument-body">
              {[
                ["Inventory Balancer", "Maintain base / quote exposure within target band."],
                ["Fee Harvester", "Prepare claims above your fee threshold."],
                ["Migration Watcher", "Track the DBC → DAMM v2 transition."],
                ["Volatility Guard", "Pause plans when price impact exceeds bounds."],
                ["Liquidity Sweeper", "Preview consolidation of residual inventory."],
              ].map(([name = "", desc = ""]) => (
                <div className="module-row" key={name}>
                  <div>
                    <strong>{name}</strong>
                    <p>{desc}</p>
                  </div>
                  <Switch
                    aria-label={name}
                    checked={modules.includes(name)}
                    onCheckedChange={(on) =>
                      setModules((a) => (on ? [...a, name] : a.filter((x) => x !== name)))
                    }
                  />
                </div>
              ))}
            </div>
          </Panel>
          <Panel title="Execution environment">
            <div className="instrument-body">
              <div className="module-row">
                <div>
                  <strong>Dry-run / simulation</strong>
                  <p>
                    {dry ? "No on-chain writes." : "Live execution remains locked for demo pools."}
                  </p>
                </div>
                <Switch checked={dry} onCheckedChange={setDry} aria-label="Dry-run simulation" />
              </div>
              <div className="notice mt-4">
                <FlaskConical size={17} />
                Plans use deterministic demo reserves, not live RPC simulation. SDK simulation is
                available only for a constructed on-chain transaction.
              </div>
              <Button className="w-full mt-5" onClick={plan}>
                <Orbit />
                Generate Execution Plan
                <ArrowUpRight />
              </Button>
            </div>
          </Panel>
          <div className="notice mt-5">
            <ShieldCheck size={16} />
            Quantum QLi does not hold funds or sign on your behalf. Strategy snapshots are kept in
            this session only.
          </div>
        </div>
      </div>
    </>
  );
}