import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowUpRight, RotateCw, Search, LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { DeskWindow } from "./window";
import { PageHeading, Field } from "@/components/quantek/controls";
import { Sparkline } from "@/components/quantek/geometry";
import {
  filterMarkets,
  getMarkets,
  validateOrder,
  type Market,
  type MarketSort,
} from "@/lib/qli/market";
import { useConsole } from "@/lib/quantek/context";
const money = (n: number) =>
  "$" + n.toLocaleString("en-US", { maximumFractionDigits: n < 1 ? 5 : 0 });
export function MarketPage({
  terminal = false,
  trending = false,
}: {
  terminal?: boolean;
  trending?: boolean;
}) {
  const c = useConsole();
  const [mode, setMode] = useState<"live" | "demo">("live");
  const [rows, setRows] = useState<Market[]>([]);
  const [q, setQ] = useState("");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<MarketSort>(trending ? "activity" : "volume");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [time, setTime] = useState("—");
  const [selected, setSelected] = useState<Market | null>(null);
  const [detail, setDetail] = useState(false);
  const [side, setSide] = useState("BUY");
  const [amount, setAmount] = useState("0.1");
  const [slippage, setSlippage] = useState("1");
  const [priority, setPriority] = useState("0.0001");
  const [tradeError, setTradeError] = useState("");
  const [auto, setAuto] = useState(terminal || trending);
  useEffect(() => {
    let live = true;
    async function load() {
      setBusy(true);
      setError("");
      try {
        const data = await getMarkets(mode);
        if (live) {
          setRows(data);
          setTime(new Date().toISOString().slice(11, 19) + " UTC");
        }
      } catch (e) {
        if (live) {
          setRows([]);
          setError(e instanceof Error ? e.message : "Market feed unavailable.");
        }
      } finally {
        if (live) setBusy(false);
      }
    }
    load();
    const timer = auto ? setInterval(load, 10000) : undefined;
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [mode, auto]);
  async function refresh() {
    setBusy(true);
    setError("");
    try {
      setRows(await getMarkets(mode));
      setTime(new Date().toISOString().slice(11, 19) + " UTC");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Market feed unavailable.");
    } finally {
      setBusy(false);
    }
  }
  const filtered = filterMarkets(rows, terminal ? q : query, sort);
  function reviewTrade() {
    setTradeError("");
    try {
      if (!selected) throw new Error("Select a market first.");
      validateOrder(Number(amount), Number(slippage), Number(priority));
      if (mode !== "demo") throw new Error("No reviewed live trading adapter is connected.");
      c.setPlan({
        title: `${side} ${selected.symbol} · Demo Order`,
        steps: [
          `${side} ${amount} ${side === "BUY" ? selected.quote : selected.symbol} at illustrative price ${money(selected.price)}.`,
          `Maximum slippage ${slippage}% · priority budget ${priority} SOL.`,
          "No executable quote or transaction is built from demo prices.",
          "Live trading requires a verified pool, fresh quote, simulation and wallet byte review.",
        ],
        accounts: [
          `Simulated market: ${selected.id}`,
          c.account?.address ?? "Wallet not connected",
        ],
        fee: `${priority} SOL priority budget + RPC fee estimate required`,
        signatures: 1,
      });
      c.log(`${side} ${selected.symbol} order reviewed`, "Trade", selected.symbol);
    } catch (e) {
      setTradeError(e instanceof Error ? e.message : "Order validation failed.");
    }
  }
  const table = (
    <DeskWindow
      title={terminal ? "trending_coins.exe" : trending ? "trending.exe" : "live_markets.db"}
      status={mode === "demo" ? "DEMO DATA" : busy ? "LOADING" : "UNAVAILABLE"}
    >
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              {[
                "Token",
                "Pair",
                "Price",
                "Market cap",
                "Liquidity",
                "24h volume",
                "24h",
                "Exchange",
              ].map((h) => (
                <th key={h}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((m) => (
              <tr key={m.id}>
                <td>
                  <Button
                    variant="link"
                    onClick={() => {
                      setSelected(m);
                      setDetail(!terminal);
                    }}
                  >
                    {m.name}
                    <span className="micro">{m.symbol}</span>
                  </Button>
                </td>
                <td>{m.quote}</td>
                <td>{money(m.price)}</td>
                <td>{money(m.cap)}</td>
                <td>{money(m.liquidity)}</td>
                <td>{money(m.volume)}</td>
                <td className={m.change > 0 ? "success-text" : "warning-text"}>
                  {m.change > 0 ? "+" : ""}
                  {m.change}%
                </td>
                <td>{m.exchange}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {busy && (
        <div className="empty-state" role="status">
          <LoaderCircle className="animate-spin" />
          Loading markets…
        </div>
      )}
      {!busy && !filtered.length && (
        <div className="empty-state" role="status">
          {error || "No markets match your search."}
          {error && (
            <div className="desk-actions justify-center mt-4">
              <Button variant="outline" onClick={refresh}>
                Retry
              </Button>
              <Button onClick={() => setMode("demo")}>Use demo data</Button>
            </div>
          )}
        </div>
      )}
    </DeskWindow>
  );
  return (
    <>
      <PageHeading
        eyebrow={`MARKETS / ${terminal ? "TRADE CONSOLE" : trending ? "PULSE" : "EXPLORER"}`}
        title={terminal ? "Trade Console" : trending ? "Market Pulse" : "Market Explorer"}
        description={
          terminal
            ? "Solana market workspace · Meteora DBC · wallet-reviewed execution"
            : trending
              ? "Ranked by activity. Feed checks every ten seconds when auto-refresh is enabled."
              : "Solana markets · searchable tokens · transparent data sources"
        }
        action={
          <Button asChild variant="outline">
            <Link to="/launch">
              Open Launch Forge
              <ArrowUpRight />
            </Link>
          </Button>
        }
      />
      <div className="feed-strip">
        <span>
          {mode === "demo"
            ? "[DEMO] SIMULATED MARKET DATA"
            : error
              ? "[!] FEED UNAVAILABLE"
              : "FEED CHECKING"}
        </span>
        <span>Fetched: {time}</span>
        <span>{rows.length} markets</span>
      </div>
      <div className="desk-market-toolbar">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setQuery(q);
          }}
        >
          <input
            aria-label={terminal ? "Filter trending coins" : "Search markets"}
            placeholder="Search token, ticker or mint…"
            value={q}
            maxLength={100}
            onChange={(e) => setQ(e.target.value)}
          />
          <Button type="submit" variant="outline">
            <Search />
            Search
          </Button>
        </form>
        <Button
          variant="outline"
          size="icon"
          aria-label="Refresh markets"
          disabled={busy}
          onClick={refresh}
        >
          <RotateCw className={busy ? "animate-spin" : ""} />
        </Button>
        <select
          aria-label="Market data source"
          value={mode}
          onChange={(e) => {
            setMode(e.target.value === "demo" ? "demo" : "live");
            setSelected(null);
          }}
        >
          <option value="live">Live provider</option>
          <option value="demo">Demo data</option>
        </select>
        <label className="checkbox-label">
          <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} />
          10s refresh
        </label>
      </div>
      <div className="desk-tabs" role="group" aria-label="Sort markets">
        <span className="micro">SORT BY</span>
        {(["volume", "cap", "gainers", "losers", "activity"] as MarketSort[]).map((s) => (
          <Button
            key={s}
            variant={sort === s ? "default" : "outline"}
            aria-pressed={sort === s}
            onClick={() => setSort(s)}
          >
            {s === "cap" ? "Market cap" : s[0]?.toUpperCase() + s.slice(1)}
          </Button>
        ))}
      </div>
      <div className={terminal ? "terminal-layout" : ""}>
        {table}
        {terminal && (
          <DeskWindow title="Order Inspector">
            <h2>{selected ? `${selected.name} · ${selected.symbol}` : "Select a coin"}</h2>
            <div className="desk-tabs mt-4">
              {["BUY", "SELL"].map((s) => (
                <Button
                  key={s}
                  variant={side === s ? "default" : "outline"}
                  aria-pressed={side === s}
                  onClick={() => setSide(s)}
                >
                  {s}
                </Button>
              ))}
            </div>
            {selected && <Sparkline points={selected.points} />}
            <p className="micro my-3">
              Balance: {mode === "demo" ? "not used in simulation" : "wallet read required"}
            </p>
            <Field
              label={`Amount (${side === "BUY" ? (selected?.quote ?? "SOL") : (selected?.symbol ?? "token")})`}
            >
              <input
                aria-label="Trade amount"
                type="number"
                min="0"
                step="any"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </Field>
            <div className="desk-tabs mt-3">
              {["0.1", "0.5", "1"].map((a) => (
                <Button key={a} variant="outline" onClick={() => setAmount(a)}>
                  {a} {side === "BUY" ? (selected?.quote ?? "SOL") : (selected?.symbol ?? "token")}
                </Button>
              ))}
            </div>
            <Field label="Slippage (%)">
              <input
                aria-label="Slippage (%)"
                type="number"
                value={slippage}
                onChange={(e) => setSlippage(e.target.value)}
              />
            </Field>
            <Field label="Priority fee (SOL)">
              <input
                aria-label="Priority fee (SOL)"
                type="number"
                step="0.0001"
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
              />
            </Field>
            {tradeError && (
              <p role="alert" className="error-message">
                {tradeError}
              </p>
            )}
            <Button className="mt-4" onClick={reviewTrade}>
              Review {side.toLowerCase()} order
            </Button>
            <p className="micro mt-4">NON-CUSTODIAL · DEMO ORDERS NEVER SIGN OR SUBMIT</p>
          </DeskWindow>
        )}
      </div>
      <Dialog open={detail} onOpenChange={setDetail}>
        <DialogContent>
          <DialogTitle>{selected?.name} · market detail</DialogTitle>
          <DialogDescription>
            Simulated Meteora DBC market. No on-chain price claim.
          </DialogDescription>
          {selected && (
            <>
              <Sparkline points={selected.points} />
              <div className="detail-rows">
                <div>
                  <span>Price</span>
                  <strong>{money(selected.price)}</strong>
                </div>
                <div>
                  <span>Liquidity</span>
                  <strong>{money(selected.liquidity)}</strong>
                </div>
                <div>
                  <span>24h volume</span>
                  <strong>{money(selected.volume)}</strong>
                </div>
              </div>
              <Button asChild>
                <Link to="/terminal">Open Trade Console</Link>
              </Button>
              <Button asChild variant="outline">
                <Link to="/pools">Inspect DBC pools</Link>
              </Button>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
export function LaunchesPage() {
  const [q, setQ] = useState("");
  const [demo, setDemo] = useState(false);
  const [sort, setSort] = useState("name");
  return (
    <>
      <PageHeading
        eyebrow="QLI> LAUNCHES"
        title="Forge Ledger"
        description="Confirmed launches appear only after verified on-chain confirmation."
        action={
          <Button asChild>
            <Link to="/launch">
              Open Launch Forge
              <ArrowUpRight />
            </Link>
          </Button>
        }
      />
      <div className="desk-market-toolbar">
        <input
          aria-label="Search launches"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search token or ticker…"
        />
        <select aria-label="Sort launches" value={sort} onChange={(e) => setSort(e.target.value)}>
          <option value="name">Name</option>
          <option value="symbol">Symbol</option>
        </select>
        <label className="checkbox-label">
          <input type="checkbox" checked={demo} onChange={(e) => setDemo(e.target.checked)} />
          Show demo launches
        </label>
      </div>
      <DeskWindow title="Forge Registry" status={demo ? "SIMULATED" : "NO CONFIRMED LAUNCHES"}>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                {["Token", "Symbol", "Mint", "Creator", "Launched", "Transaction"].map((h) => (
                  <th key={h}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {demo &&
                [
                  { name: "Arc Protocol", symbol: "ARC" },
                  { name: "Nexus Network", symbol: "NXS" },
                  { name: "Vector Labs", symbol: "VEC" },
                ]
                  .filter((n) => (n.name + " " + n.symbol).toLowerCase().includes(q.toLowerCase()))
                  .sort((a, b) =>
                    sort === "name"
                      ? a.name.localeCompare(b.name)
                      : a.symbol.localeCompare(b.symbol),
                  )
                  .map((n) => (
                    <tr key={n.symbol}>
                      <td>{n.name}</td>
                      <td>{n.symbol}</td>
                      <td>Demo · not minted</td>
                      <td>Local example</td>
                      <td>Not confirmed</td>
                      <td>
                        <Link to="/pools" className="desk-link">
                          Inspect demo pool ↗
                        </Link>
                      </td>
                    </tr>
                  ))}
            </tbody>
          </table>
        </div>
        {!demo && (
          <div className="empty-state">
            No confirmed Quantum QLi launches. No third-party launch history is attributed to this
            app.
          </div>
        )}
      </DeskWindow>
    </>
  );
}
