import { Link } from "@tanstack/react-router";
import { useState } from "react";
import {
  ArrowUpRight,
  ArrowRight,
  TrendingUp,
  Layers3,
  Coins,
  ChartNoAxesCombined,
  Orbit,
  Fingerprint,
  Activity,
  ShieldCheck,
  Radio,
  Wallet,
  TriangleAlert,
  Check,
  SlidersHorizontal,
  Rocket,
  ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sparkline } from "./geometry";
import { Panel, PageHeading } from "./controls";
import { pools } from "@/lib/qli-core/data";
import { useConsole } from "@/lib/qli-core/context";
export function Overview() {
  const c = useConsole();
  const [range, setRange] = useState("1W");
  const ranges: Record<string, number[]> = {
    "1D": [20, 28, 23, 35, 31, 44, 39, 56, 53, 60, 57, 70, 67, 76],
    "1W": [13, 22, 19, 28, 30, 24, 38, 34, 47, 40, 52, 51, 65, 59, 72, 68, 82],
    "1M": [15, 18, 26, 21, 31, 28, 42, 39, 47, 51, 43, 61, 58, 72, 69, 79, 87],
  };
  const metrics = [
    ["MANAGED LIQUIDITY", "$424,680", "↗ 8.24%", "vs. previous 24h", ChartNoAxesCombined],
    ["ACTIVE DBC POOLS", "03", "3 bonding", "0 migrated", Layers3],
    ["24H FEES", "$1,061.52", "↗ 12.6%", "vs. previous 24h", Coins],
    ["REALIZED PNL", "+$8,241", "↗ 4.82%", "all time", TrendingUp],
    ["AGENT ACTIONS", "128", "12 today", "all simulated", Orbit],
    ["PQ LEAF BUDGET", "214", "42 used", "of 256 leaves", Fingerprint],
  ] as const;
  return (
    <>
      <PageHeading
        eyebrow="OPERATIONS / DEMO"
        title="NEMOTRON3.5 Desk"
        description="Liquidity, reserves and execution guardrails. Simulated until a verified live connection is available."
        action={
          <Button asChild>
            <Link to="/launch">
              Open Launch Forge
              <ArrowUpRight />
            </Link>
          </Button>
        }
      />
      <div className="metrics-heading">
        <span className="eyebrow">WORKSPACE TELEMETRY</span>
        <span className="micro">SIMULATED DATA · USD</span>
      </div>
      <div className="metrics-grid">
        {metrics.map(([label, value, change, note, Icon]) => (
          <div className="metric" key={label}>
            <div className="metric-label">
              {label}
              <Icon />
            </div>
            <div className="metric-value">
              {value}
              {label === "PQ LEAF BUDGET" && <span className="metric-unit"> / 256</span>}
            </div>
            <div className="metric-change">
              <span className="text-foreground">{change}</span>
              <span>· {note}</span>
            </div>
          </div>
        ))}
      </div>
      <div className="overview-grid">
        <section className="instrument">
          <header className="panel-heading">
            <h2>Liquidity performance</h2>
            <span className="micro">AGGREGATE / DEMO</span>
          </header>
          <div className="liquidity-header">
            <div>
              <strong>
                $424,680<span className="text-muted-foreground text-base">.00</span>
              </strong>
              <p>
                ↗ $32,312.40 (8.24%){" "}
                <span className="text-muted-foreground">
                  {range === "1D" ? "TODAY" : range === "1W" ? "THIS WEEK" : "THIS MONTH"}
                </span>
              </p>
            </div>
            <div className="chart-tabs">
              {["1D", "1W", "1M"].map((r) => (
                <Button
                  key={r}
                  size="sm"
                  variant={range === r ? "secondary" : "ghost"}
                  onClick={() => setRange(r)}
                >
                  {r}
                </Button>
              ))}
            </div>
          </div>
          <div className="liquidity-chart">
            <div className="chart-grid" />
            <Sparkline points={ranges[range] ?? []} />
            <div className="chart-labels">
              {(range === "1W"
                ? ["OCT 03", "OCT 04", "OCT 05", "OCT 06", "OCT 07", "OCT 08", "OCT 09"]
                : range === "1D"
                  ? ["00:00", "04:00", "08:00", "12:00", "16:00", "20:00", "24:00"]
                  : ["SEP 09", "SEP 14", "SEP 19", "SEP 24", "SEP 29", "OCT 04", "OCT 09"]
              ).map((x) => (
                <span key={x}>{x}</span>
              ))}
            </div>
          </div>
          <div className="chart-bottom">
            <span>
              <i />
              Managed liquidity
            </span>
            <span>
              <i className="dashed" />
              Baseline reserve
            </span>
            <span className="ml-auto">3 POOLS</span>
          </div>
        </section>
        <section className="instrument agent-status">
          <header className="panel-heading">
            <h2>NEMOTRON3.5 Operator</h2>
            <span className="status-tag bright">
              <span className="live-dot" />
              STANDBY
            </span>
          </header>
          <div className="agent-status-header">
            <div className="agent-mode-title">
              <div className="agent-orbit">
                <Orbit />
              </div>
              <div>
                <strong>NEMOTRON3.5 Operator / 01</strong>
                <p>DETERMINISTIC · NON-CUSTODIAL</p>
              </div>
            </div>
          </div>
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
          <div className="detail-rows">
            <div>
              <span>Execution environment</span>
              <strong>Dry-run simulation</strong>
            </div>
            <div>
              <span>Active strategy modules</span>
              <strong>03 / 05</strong>
            </div>
            <div>
              <span>Guardrail status</span>
              <strong className="flex items-center gap-1">
                <ShieldCheck size={11} />
                Demo checks only
              </strong>
            </div>
          </div>
          <Link to="/agent" className="agent-configure">
            <span>Configure execution strategy</span>
            <ArrowUpRight />
          </Link>
        </section>
      </div>
      <div className="lower-grid">
        <Panel title="DBC migration monitor" tag="02 OF 03 / DEMO">
          <div>
            {pools
              .filter((p) => p.id !== "nexus")
              .map((p) => (
                <div className="migration-pool" key={p.id}>
                  <div className="pool-heading-row">
                    <div className="pool-identity">
                      <span className="token-icon">{p.token === "ARC" ? "Λ" : "V"}</span>
                      <div>
                        <h3>
                          {p.name}
                          <span className="text-muted-foreground"> / {p.token}</span>
                        </h3>
                        <p>
                          {p.token} / {p.quote} · {p.address}
                        </p>
                      </div>
                    </div>
                    <span className="status-tag">
                      {p.progress > 90 ? "NEAR THRESHOLD" : "BONDING"}
                    </span>
                  </div>
                  <div className="migration-meta">
                    <span>
                      Quote reserve{" "}
                      <span className="text-foreground">
                        {p.reserve} / {p.threshold} {p.quote}
                      </span>
                    </span>
                    <strong>{p.progress}%</strong>
                  </div>
                  <div className="progress-track">
                    <progress value={p.progress} max={100} />
                  </div>
                </div>
              ))}
          </div>
          <Link to="/pools" className="agent-configure">
            Inspect Liquidity Chambers
            <ArrowUpRight />
          </Link>
        </Panel>
        <Panel title="Risk & guardrails" tag="SIMULATED CHECKS">
          <div className="risk-row">
            <div>
              <SlidersHorizontal />
              Inventory imbalance
            </div>
            <span className="micro">WITHIN BAND</span>
          </div>
          <div className="risk-row">
            <div>
              <Activity />
              Max slippage
            </div>
            <span className="micro">50 BPS</span>
          </div>
          <div className="risk-row">
            <div>
              <TriangleAlert />
              Migration proximity
            </div>
            <span className="micro text-foreground">1 POOL / 91.2%</span>
          </div>
          <div className="risk-row">
            <div>
              <Wallet />
              Wallet / PQ identity
            </div>
            <span className="micro">
              {c.account ? "WALLET ONLY / PQ UNREGISTERED" : "NOT CONNECTED"}
            </span>
          </div>
          <div className="risk-description">
            Demo execution is locked. A connected wallet does not enable live trading.
          </div>
        </Panel>
      </div>
      <section className="instrument activity-panel">
        <header className="panel-heading">
          <h2>
            Recent activity <span className="micro ml-2">SIMULATED</span>
          </h2>
          <Link to="/audit">
            Open Event Log
            <ArrowUpRight size={11} />
          </Link>
        </header>
        {c.events.slice(0, 4).map((e) => (
          <div className="activity-row" key={e.id}>
            <span className="activity-time">{e.time}</span>
            <div className="activity-icon">
              {e.type === "Agent" ? (
                <Orbit />
              ) : e.type === "Proof" ? (
                <Fingerprint />
              ) : e.type === "Fees" ? (
                <Coins />
              ) : (
                <TriangleAlert />
              )}
            </div>
            <div className="activity-description">
              <strong>{e.title}</strong>
              <p>{e.detail}</p>
            </div>
            <span className="status-tag">{e.type === "Migration" ? "NOTICE" : "DEMO"}</span>
          </div>
        ))}
      </section>
    </>
  );
}
