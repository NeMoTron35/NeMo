import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Search, ArrowUpRight, ExternalLink, Coins, Orbit, Layers3, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { PageHeading, Panel } from "./controls";
import { Sparkline } from "./geometry";
import { pools, type Pool } from "@/lib/qli-core/data";
import { useConsole } from "@/lib/qli-core/context";
export function PoolsPage() {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("All pools");
  const [selected, setSelected] = useState<Pool | null>(null);
  const c = useConsole();
  const [added, setAdded] = useState("");
  const filtered = pools.filter(
    (p) =>
      `${p.token} ${p.name} ${p.address} demo config`
        .toLowerCase()
        .includes(search.toLowerCase()) &&
      (filter !== "Near migration" || p.progress > 90),
  );
  function action(type: string, p: Pool) {
    setSelected(null);
    if (type === "Add to Agent") {
      setAdded(`${p.token} selected for the agent preview.`);
      c.setTargetPool(p.id);
      const snapshot = c.strategyRepository.load();
      if (snapshot) c.strategyRepository.save({ ...snapshot, pool: p.id });
      c.log(`${p.token} added to agent preview`, "Agent", p.token);
      return;
    }
    c.setPlan({
      title: `${p.token} · ${type}`,
      steps:
        type === "Claim Fees"
          ? [
              "Read partner and creator fee balances.",
              `Prepare claim for ${p.token}/${p.quote} quote and base vaults.`,
              "Review accounts, simulate with RPC, then request wallet signing.",
            ]
          : [
              `Read ${p.token}/${p.quote} reserve and inventory balance.`,
              "Apply 50 bps slippage and 2.5 quote-token trade cap.",
              "Review unsigned swap and request client wallet signature.",
            ],
      accounts: [
        p.address + " (demo — not an on-chain address)",
        "Partner / creator wallet",
        "Base and quote vaults",
      ],
      fee: "~0.000005 SOL + pool fees",
      signatures: 1,
    });
    c.log(`${type} preview generated`, "Pools", p.token);
  }
  return (
    <>
      <PageHeading
        eyebrow="MARKET STRUCTURE / VIRTUAL POOLS"
        title="Liquidity Chambers"
        description="Inspect reserves, fee flows and migration thresholds across your pool universe."
        action={
          <Button asChild>
            <Link to="/launch">
              Create pool
              <ArrowUpRight />
            </Link>
          </Button>
        }
      />
      <div className="toolbar">
        <div className="search-field">
          <Search />
          <input
            aria-label="Search pools"
            placeholder="Search pool, base mint or config…"
            maxLength={100}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select aria-label="Pool status" value={filter} onChange={(e) => setFilter(e.target.value)}>
          <option>All pools</option>
          <option>Near migration</option>
        </select>
        <span className="status-tag ml-auto">SIMULATED POOL DATA</span>
      </div>
      {added && (
        <div className="notice mb-4" role="status">
          {added}
          <Link to="/agent" className="text-foreground underline">
            Open Agent
          </Link>
        </div>
      )}
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              {[
                "Pool / Token",
                "Price",
                "Liquidity",
                "24h Volume",
                "24h Fees",
                "Migration",
                "Trend",
                "",
              ].map((x, i) => (
                <th key={i}>{x}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((p) => (
              <tr key={p.id}>
                <td>
                  <div className="pool-identity">
                    <span className="token-icon">{p.token.slice(0, 1)}</span>
                    <div>
                      <strong>
                        {p.token} / {p.quote}
                      </strong>
                      <small>{p.address} · DEMO</small>
                    </div>
                  </div>
                </td>
                <td>{p.price}</td>
                <td>{p.liquidity}</td>
                <td>{p.volume}</td>
                <td>{p.fees}</td>
                <td>
                  <div className="pool-mini-progress">
                    <span>{p.progress}%</span>
                    <div className="progress-track">
                      <progress max={100} value={p.progress} />
                    </div>
                  </div>
                </td>
                <td>
                  <Sparkline points={p.points} />
                </td>
                <td>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="table-action"
                    aria-label={`Inspect ${p.token} pool`}
                    onClick={() => setSelected(p)}
                  >
                    <ArrowUpRight />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!filtered.length && (
          <div className="empty-state">
            <Search size={25} />
            No pools match this query.
          </div>
        )}
      </div>
      <div className="notice mt-6">
        <Layers3 size={16} />
        Demo pool addresses are abbreviated identifiers, not valid on-chain accounts. Add verified
        accounts through the SDK state adapter for live inspection.
      </div>
      <Dialog
        open={!!selected}
        onOpenChange={(o) => {
          if (!o) setSelected(null);
        }}
      >
        <DialogContent className="pool-detail review-dialog">
          <DialogTitle>
            {selected?.name} / {selected?.token}
          </DialogTitle>
          <DialogDescription>
            DBC virtual pool · Simulated state · DAMM v2 migration
          </DialogDescription>
          {selected && (
            <>
              <span className="status-tag">{selected.status.toUpperCase()} · DEMO</span>
              <div className="pool-detail-chart">
                <Sparkline points={selected.points} />
                <div className="chart-labels">
                  <span>INITIAL PRICE</span>
                  <span>DASHED / RESERVE BASELINE</span>
                  <span>MIGRATION</span>
                </div>
              </div>
              <div className="stat-strip">
                <div>
                  <small>Quote reserve</small>
                  <strong>{selected.reserve.toLocaleString()}</strong>
                </div>
                <div>
                  <small>Threshold / {selected.quote}</small>
                  <strong>{selected.threshold.toLocaleString()}</strong>
                </div>
                <div>
                  <small>Migration</small>
                  <strong>{selected.progress}%</strong>
                </div>
              </div>
              <div className="detail-rows">
                <div>
                  <span>Config address</span>
                  <strong>Demo config · not deployed</strong>
                </div>
                <div>
                  <span>Partner fees (80%)</span>
                  <strong>${(Number(selected.fees.replace(/[$,]/g, "")) * 0.8).toFixed(2)}</strong>
                </div>
                <div>
                  <span>Creator fees (20%)</span>
                  <strong>${(Number(selected.fees.replace(/[$,]/g, "")) * 0.2).toFixed(2)}</strong>
                </div>
              </div>
              <div className="eyebrow">RECENT SWAPS / DEMO</div>
              <div className="code-block">
                12:48:32 BUY 2.40 {selected.quote} 18 bps impact{"\n"}12:44:06 SELL 1.82{" "}
                {selected.quote} 12 bps impact{"\n"}12:40:18 BUY 0.95 {selected.quote} 8 bps impact
              </div>
              <div className="flex flex-wrap gap-2">
                {["Rebalance", "Claim Fees", "Add to Agent"].map((x) => (
                  <Button key={x} variant="outline" size="sm" onClick={() => action(x, selected)}>
                    {x === "Claim Fees" ? <Coins /> : <Orbit />}
                    {x}
                  </Button>
                ))}
                <Button variant="ghost" size="sm" asChild>
                  <a href="https://explorer.solana.com" target="_blank" rel="noreferrer">
                    <ExternalLink />
                    Solana Explorer (demo)
                  </a>
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
export function PositionsPage() {
  const c = useConsole();
  return (
    <>
      <PageHeading
        eyebrow="PORTFOLIO / EXPOSURE"
        title="Inventory"
        description="Inventory, cost basis and reserve exposure. Demo valuations are not investment performance."
      />
      <div className="stat-strip">
        <div>
          <small>Mark value / demo</small>
          <strong>$424,680</strong>
        </div>
        <div>
          <small>Unrealized PnL</small>
          <strong>+$12,640</strong>
        </div>
        <div>
          <small>Realized PnL</small>
          <strong>+$8,241</strong>
        </div>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              {[
                "Token",
                "Inventory",
                "Cost basis",
                "Mark value",
                "Unrealized",
                "Realized",
                "Exposure",
                "",
              ].map((x, i) => (
                <th key={i}>{x}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pools.map((p, i) => (
              <tr key={p.id}>
                <td>
                  <div className="pool-identity">
                    <span className="token-icon">{p.token[0]}</span>
                    <strong>{p.token}</strong>
                  </div>
                </td>
                <td>{["2,188,361", "10,201,587", "3,099,169"][i]}</td>
                <td>{["$178,000", "$125,000", "$109,040"][i]}</td>
                <td>{p.liquidity}</td>
                <td>{["+$6,260", "+$3,540", "+$2,840"][i]}</td>
                <td>{["+$4,280", "+$2,104", "+$1,857"][i]}</td>
                <td>{[43.4, 30.3, 26.3][i]}%</td>
                <td>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Review ${p.token} position transaction`}
                    onClick={() =>
                      c.setPlan({
                        title: `${p.token} · Inventory Plan`,
                        steps: [
                          "Read wallet token accounts and cost-basis snapshot.",
                          "Preview a quote reserve rebalance within 50 bps guardrail.",
                          "Simulate a constructed transaction before requesting wallet approval.",
                        ],
                        accounts: [
                          `${p.token} token account (demo)`,
                          `${p.quote} quote account (demo)`,
                          "Wallet fee payer",
                        ],
                        fee: "~0.000005 SOL",
                        signatures: 1,
                      })
                    }
                  >
                    <ArrowUpRight />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="overview-grid">
        <Panel title="Inventory concentration" tag="DEMO">
          <div className="instrument-body">
            <div
              className="concentration-bar"
              role="img"
              aria-label="Simulated concentration: ARC 43.4%, NXS 30.3%, VEC 26.3%"
            >
              <span />
              <span />
              <span />
            </div>
            <div className="detail-rows">
              {pools.map((p, i) => (
                <div key={p.id}>
                  <span>{p.token}</span>
                  <strong>{[43.4, 30.3, 26.3][i]}%</strong>
                </div>
              ))}
            </div>
          </div>
        </Panel>
        <Panel title="Quote reserves" tag="SOL / USDC">
          <div className="instrument-body">
            <Sparkline points={[38, 42, 40, 47, 52, 48, 55, 60, 57, 66, 70, 65, 74]} />
            <div className="detail-rows">
              <div>
                <span>SOL reserve</span>
                <strong>1,526.4 SOL</strong>
              </div>
              <div>
                <span>USDC reserve</span>
                <strong>42,300 USDC</strong>
              </div>
            </div>
          </div>
        </Panel>
      </div>
    </>
  );
}
export function FeesPage() {
  const c = useConsole();
  const [history, setHistory] = useState(false);
  return (
    <>
      <PageHeading
        eyebrow="REVENUE / CLAIM OPERATIONS"
        title="Revenue"
        description="Inspect partner and creator fee accrual. Claims require wallet review; no returns are guaranteed."
      />
      <div className="stat-strip">
        <div>
          <small>Partner trading fees / demo</small>
          <strong>$849.22</strong>
        </div>
        <div>
          <small>Creator trading fees / demo</small>
          <strong>$212.30</strong>
        </div>
        <div>
          <small>Total claimable / demo</small>
          <strong>$1,061.52</strong>
        </div>
      </div>
      <div className="toolbar">
        <div className="segmented">
          <Button
            variant="ghost"
            aria-pressed={!history}
            className={!history ? "selected" : ""}
            onClick={() => setHistory(false)}
          >
            Claimable balances
          </Button>
          <Button
            variant="ghost"
            aria-pressed={history}
            className={history ? "selected" : ""}
            onClick={() => setHistory(true)}
          >
            Historical claims
          </Button>
        </div>
        <span className="status-tag ml-auto">SIMULATED</span>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              {(history
                ? ["Date / UTC", "Pool", "Claim role", "Amount", "State"]
                : [
                    "Pool",
                    "Partner share",
                    "Creator share",
                    "Quote claimable",
                    "Base claimable",
                    "",
                  ]
              ).map((x, i) => (
                <th key={i}>{x}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pools.map((p, i) =>
              history ? (
                <tr key={p.id}>
                  <td>2026-10-0{8 - i}</td>
                  <td>
                    {p.token}/{p.quote}
                  </td>
                  <td>{i % 2 ? "Creator" : "Partner"}</td>
                  <td>
                    {[0.24, 82.4, 0.18][i]} {p.quote}
                  </td>
                  <td>
                    <span className="status-tag">SIMULATED · NOT SUBMITTED</span>
                  </td>
                </tr>
              ) : (
                <tr key={p.id}>
                  <td>
                    {p.token} / {p.quote}
                  </td>
                  <td>80%</td>
                  <td>20%</td>
                  <td>
                    {[0.182, 341.02, 0.124][i]} {p.quote}
                  </td>
                  <td>
                    {[148.2, 520.6, 89.4][i]} {p.token}
                  </td>
                  <td>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        c.setPlan({
                          title: `${p.token} · Fee Claim`,
                          steps: [
                            "Fetch verified pool fee balances from active RPC.",
                            "Build partner / creator claim instruction through the DBC SDK.",
                            "Review fee payer and vault destinations. Simulate before wallet signing.",
                          ],
                          accounts: [
                            p.address + " (demo)",
                            "Partner / creator destination",
                            "Quote vault",
                            "Base vault",
                          ],
                          fee: "~0.000005 SOL",
                          signatures: 1,
                        });
                        c.log(`Fee claim preview: ${p.token}`, "Fees", p.token);
                      }}
                    >
                      <Coins />
                      Review claim
                    </Button>
                  </td>
                </tr>
              ),
            )}
          </tbody>
        </table>
      </div>
      <div className="notice mt-6">
        <Wallet size={16} />
        Displayed balances are simulated. No claim has been sent to Solana. Network fees and account
        rent must be estimated with RPC before signing.
      </div>
    </>
  );
}