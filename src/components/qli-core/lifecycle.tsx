import { useEffect, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { PageHeading, Panel, Field } from "./controls";
import {
  getPoolIntelligence,
  getPoolQuote,
  getPoolTimeline,
} from "@/lib/qli-core/lifecycle.functions";
import {
  EVENT_LABEL,
  MIGRATION_OPTION_LABEL,
  QUOTE_LIMITS,
  STAGE_LABEL,
  explain,
  isAddress,
  type LifecycleNetwork,
  type Snapshot,
  type Timeline,
} from "@/lib/qli-core/lifecycle";
import { fetchNeuralStatus, hfLabel, type NeuralStatus } from "@/lib/qli-core/neural/status-client";
import { explorerAccount, explorerTx } from "@/lib/qli-core/dbc-launch";

function Row({ k, v, ev, href }: { k: string; v: string; ev?: string; href?: string }) {
  return (
    <>
      <dt>
        {k}
        {ev && <span className="micro"> · {ev}</span>}
      </dt>
      <dd className="font-mono text-xs break-all">
        {href ? (
          <a href={href} target="_blank" rel="noopener noreferrer" className="desk-link">
            {v}
          </a>
        ) : (
          v
        )}
      </dd>
    </>
  );
}
const NetBadge = ({ n }: { n: LifecycleNetwork }) => (
  <span className="micro" aria-label={`Network ${n}`}>
    [{n === "mainnet-beta" ? "MAINNET-BETA" : "DEVNET"}]
  </span>
);
const fmt = (atomic: string, decimals: number | null) => {
  if (decimals === null) return `${atomic} atomic`;
  const v = BigInt(atomic);
  const d = 10n ** BigInt(decimals);
  const frac = (v % d).toString().padStart(decimals, "0").slice(0, 6).replace(/0+$/, "");
  return `${(v / d).toString()}${frac ? "." + frac : ""} (${atomic} atomic)`;
};

export function LifecycleIntelligencePage({
  network,
  pool,
}: {
  network: LifecycleNetwork;
  pool: string;
}) {
  const navigate = useNavigate();
  const [net, setNet] = useState<LifecycleNetwork>(network);
  const [addr, setAddr] = useState(pool);
  useEffect(() => {
    setNet(network);
    setAddr(pool);
  }, [network, pool]);
  const valid = isAddress(addr.trim());
  const active = isAddress(pool);
  const fetchIntel = useServerFn(getPoolIntelligence);
  const q = useQuery({
    queryKey: ["dbc-intel", network, pool],
    queryFn: () => fetchIntel({ data: { network, pool } }),
    enabled: active,
    retry: false,
    staleTime: 15_000,
  });
  return (
    <>
      <PageHeading
        eyebrow="METEORA LIFECYCLE INTELLIGENCE / V2"
        title="DBC Lifecycle Intelligence"
        description="Graduation state, exact SDK curve quotes, fee accrual and bounded event history for any Meteora DBC pool. Read-only: this page never asks a wallet to sign."
        action={
          <span>
            <Link to="/launch-proofs" className="desk-link">
              Launch Proofs
            </Link>{" "}
            <Link to="/hook-forge" className="desk-link">
              Hook Forge
            </Link>{" "}
            <Link to="/creator-studio" className="desk-link">
              Creator Studio
            </Link>
          </span>
        }
      />
      <div className="settings-stack">
        <Panel title="Graduation Sentinel lookup" tag="READ-ONLY">
          <form
            className="instrument-body form-grid"
            onSubmit={(e) => {
              e.preventDefault();
              if (valid)
                void navigate({
                  to: "/meteora-intelligence",
                  search: { network: net, pool: addr.trim() },
                });
            }}
          >
            <Field label="Network">
              <select value={net} onChange={(e) => setNet(e.target.value as LifecycleNetwork)}>
                <option value="devnet">Solana devnet</option>
                <option value="mainnet-beta">Solana mainnet-beta</option>
              </select>
            </Field>
            <Field label="DBC pool address" hint="VirtualPool account owned by dbcij3LW…aqN.">
              <input
                value={addr}
                onChange={(e) => setAddr(e.target.value)}
                className="font-mono text-xs"
                spellCheck={false}
                autoComplete="off"
                maxLength={44}
                aria-invalid={addr.length > 0 && !valid}
              />
            </Field>
            {addr.length > 0 && !valid && (
              <p role="alert" className="error-message sm:col-span-2">
                Not a valid Solana address.
              </p>
            )}
            <div className="sm:col-span-2">
              <Button type="submit" disabled={!valid}>
                Inspect pool
              </Button>
            </div>
          </form>
        </Panel>
        {!active ? (
          <p className="micro">
            Enter a pool address. Results come only from server-trusted Solana RPC; nothing is
            pre-filled or simulated.
          </p>
        ) : q.isPending ? (
          <p role="status">Reading Solana {network} RPC…</p>
        ) : q.isError || !q.data ? (
          <p role="alert" className="error-message">
            Lookup failed before any evidence was read. Nothing was verified.
          </p>
        ) : !q.data.ok ? (
          <p role="alert" className="error-message">
            {q.data.code}: {q.data.message}
          </p>
        ) : (
          <Loaded s={q.data.snapshot} digest={q.data.digest} />
        )}
      </div>
    </>
  );
}

function Loaded({ s, digest }: { s: Snapshot; digest: string }) {
  const fetchTimeline = useServerFn(getPoolTimeline);
  const [before, setBefore] = useState<string | undefined>(undefined);
  const t = useQuery({
    queryKey: ["dbc-timeline", s.network, s.pool, before],
    queryFn: () => fetchTimeline({ data: { network: s.network, pool: s.pool, limit: 20, before } }),
    retry: false,
    staleTime: 30_000,
  });
  const [status, setStatus] = useState<NeuralStatus | null>(null);
  useEffect(() => {
    void fetchNeuralStatus().then(setStatus);
  }, []);
  const qd = s.quoteDecimals;
  const bd = s.config.tokenDecimal;
  const pct = s.progressPpm === null ? "unknown" : `${(s.progressPpm / 10_000).toFixed(2)}%`;
  const tl = t.data ?? null;
  return (
    <>
      <Panel
        title="Graduation Sentinel"
        tag={s.network === "mainnet-beta" ? "MAINNET-BETA" : "DEVNET"}
      >
        <div className="instrument-body">
          <p role="status">
            <strong>{STAGE_LABEL[s.stage]}</strong> <NetBadge n={s.network} />
          </p>
          <div
            role="progressbar"
            aria-label="Curve progress toward migration threshold"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={s.progressPpm === null ? undefined : s.progressPpm / 10_000}
            className="h-2 w-full border border-border mt-2"
          >
            <div
              className="h-full bg-primary"
              style={{ width: `${(s.progressPpm ?? 0) / 10_000}%` }}
            />
          </div>
          <dl className="proof-grid mt-3">
            <Row k="Curve progress" v={pct} ev="derived" />
            <Row k="Quote reserve" v={fmt(s.facts.quoteReserve, qd)} ev="on-chain" />
            <Row
              k="Migration threshold"
              v={fmt(s.config.migrationQuoteThreshold, qd)}
              ev="on-chain"
            />
            <Row k="Base reserve" v={fmt(s.facts.baseReserve, bd)} ev="on-chain" />
            <Row
              k="Migration target"
              v={
                MIGRATION_OPTION_LABEL[s.config.migrationOption] ??
                `option ${s.config.migrationOption}`
              }
              ev="on-chain"
            />
            <Row k="Observed slot" v={String(s.observedSlot)} ev="on-chain" />
            <Row
              k="Current point"
              v={s.currentPoint ? `${s.currentPoint.kind} ${s.currentPoint.value}` : "unknown"}
              ev={s.currentPoint ? "on-chain" : "unknown"}
            />
            <Row k="Observed at (server clock)" v={s.observedAt} />
            <Row k="Pool" v={s.pool} href={explorerAccount(s.pool, s.network)} />
            <Row k="Config" v={s.facts.config} href={explorerAccount(s.facts.config, s.network)} />
            <Row
              k="Base mint"
              v={s.facts.baseMint}
              href={explorerAccount(s.facts.baseMint, s.network)}
            />
            <Row k="Quote mint" v={s.config.quoteMint} />
            <Row k="Creator" v={s.facts.creator} />
            <Row k="RPC" v={s.provenance.rpc} />
            <Row k="Snapshot digest" v={digest} />
          </dl>
          <h3 className="micro mt-3">Migration conditions</h3>
          <ul>
            {s.conditions.map((c) => (
              <li key={c.name}>
                {c.met === null ? "UNKNOWN" : c.met ? "MET" : "NOT MET"} — {c.name}{" "}
                <span className="micro">
                  ({c.evidence}; {c.detail})
                </span>
              </li>
            ))}
          </ul>
          {tl?.creationSignature && (
            <p className="mt-2">
              Pool creation observed in this window:{" "}
              <Link
                to="/launch-proofs/$network/$signature"
                params={{ network: s.network, signature: tl.creationSignature }}
                className="desk-link"
              >
                open Launch Proof
              </Link>
            </p>
          )}
        </div>
      </Panel>
      <QuotePanel s={s} />
      <Panel title="Fee intelligence" tag="SDK FORMULA">
        <div className="instrument-body">
          <dl className="proof-grid">
            <Row
              k="Creator unclaimed (quote)"
              v={fmt(s.fees.unclaimed.creatorQuote, qd)}
              ev="on-chain"
            />
            <Row
              k="Partner unclaimed (quote)"
              v={fmt(s.fees.unclaimed.partnerQuote, qd)}
              ev="on-chain"
            />
            <Row
              k="Creator unclaimed (base)"
              v={fmt(s.fees.unclaimed.creatorBase, bd)}
              ev="on-chain"
            />
            <Row
              k="Partner unclaimed (base)"
              v={fmt(s.fees.unclaimed.partnerBase, bd)}
              ev="on-chain"
            />
            <Row
              k="Protocol unclaimed (quote)"
              v={fmt(s.fees.unclaimed.protocolQuote, qd)}
              ev="on-chain"
            />
            <Row
              k="Lifetime trading fees (quote)"
              v={fmt(s.fees.lifetimeTrading.quote, qd)}
              ev="on-chain"
            />
            <Row
              k="Creator share of trading fees"
              v={`${s.fees.creatorTradingFeePercentage}%`}
              ev="on-chain"
            />
            <Row
              k="Creator claimed (quote)"
              v={
                s.fees.breakdown.creator.claimedQuote === null
                  ? "null — would underflow"
                  : fmt(s.fees.breakdown.creator.claimedQuote, qd)
              }
              ev="derived"
            />
            <Row
              k="Partner claimed (quote)"
              v={
                s.fees.breakdown.partner.claimedQuote === null
                  ? "null — would underflow"
                  : fmt(s.fees.breakdown.partner.claimedQuote, qd)
              }
              ev="derived"
            />
          </dl>
          {s.fees.notes.map((n) => (
            <p key={n} className="micro mt-1">
              {n}
            </p>
          ))}
          <p className="micro mt-1">No claim or withdrawal can be started from this page.</p>
        </div>
      </Panel>
      <Panel title="Lifecycle timeline" tag="BOUNDED">
        <div className="instrument-body">
          {t.isPending ? (
            <p role="status">Reading recent signatures…</p>
          ) : !tl ? (
            <p role="alert" className="error-message">
              Timeline unavailable (RPC limited or failed). Nothing is inferred.
            </p>
          ) : (
            <>
              <p className="micro">
                {tl.coverage.indexed} of {tl.coverage.returned} signature(s) indexed;{" "}
                {tl.coverage.notIndexed} not indexed. {tl.coverage.note}
              </p>
              <ol className="mt-2">
                {tl.entries.map((e) => (
                  <li key={e.signature} className="mb-2">
                    <a
                      href={explorerTx(e.signature, s.network)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="desk-link font-mono text-xs"
                    >
                      {e.signature.slice(0, 16)}…
                    </a>{" "}
                    <span className="micro">
                      slot {e.slot} · {e.confirmation ?? "unknown"} ·{" "}
                      {e.blockTime ? new Date(e.blockTime * 1000).toISOString() : "no block time"}
                      {e.failed ? " · FAILED" : ""}
                    </span>
                    <div className="text-xs">
                      {e.events.length
                        ? e.events.map((v) => EVENT_LABEL[v.name] ?? v.name).join(", ")
                        : e.instructions.length
                          ? `instructions: ${e.instructions.join(", ")} (no tracked event)`
                          : "no tracked DBC event linked to this pool"}
                    </div>
                  </li>
                ))}
              </ol>
              <div className="flex gap-2">
                {before && (
                  <Button variant="outline" onClick={() => setBefore(undefined)}>
                    Latest
                  </Button>
                )}
                {tl.coverage.nextBefore && (
                  <Button
                    variant="outline"
                    onClick={() => setBefore(tl.coverage.nextBefore ?? undefined)}
                  >
                    Older 20
                  </Button>
                )}
              </div>
            </>
          )}
        </div>
      </Panel>
      <Panel title="Evidence-grounded analysis" tag="DETERMINISTIC">
        <div className="instrument-body">
          <ul>
            {explain(s, tl).map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ul>
          <p className="micro mt-2">
            {hfLabel(status)}. No hosted model is called from this public page; these lines are
            rule-based readings of the evidence above, not on-chain facts or advice.
          </p>
          <p className="micro mt-1">
            API:{" "}
            <code className="font-mono">
              /api/public/meteora/v1/pools/{s.network}/{s.pool}
            </code>
          </p>
        </div>
      </Panel>
    </>
  );
}

function QuotePanel({ s }: { s: Snapshot }) {
  const fetchQuote = useServerFn(getPoolQuote);
  const [direction, setDirection] = useState<"buy" | "sell">("buy");
  const [amount, setAmount] = useState("");
  const [slip, setSlip] = useState(100);
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<Awaited<ReturnType<typeof fetchQuote>> | null>(null);
  const okAmount =
    /^[0-9]{1,20}$/.test(amount) && BigInt(amount) > 0n && BigInt(amount) <= QUOTE_LIMITS.maxAmount;
  const inDec = direction === "buy" ? s.quoteDecimals : s.config.tokenDecimal;
  const outDec = direction === "buy" ? s.config.tokenDecimal : s.quoteDecimals;
  return (
    <Panel title="Curve quote simulator" tag="SDK swapQuote2 EXACT-IN">
      <form
        className="instrument-body form-grid"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!okAmount) return;
          setBusy(true);
          try {
            setRes(
              await fetchQuote({
                data: {
                  network: s.network,
                  pool: s.pool,
                  direction,
                  amountIn: amount,
                  slippageBps: slip,
                },
              }),
            );
          } catch {
            setRes({
              ok: false,
              code: "rpc-unavailable",
              message: "Quote request failed. Nothing was computed.",
            });
          } finally {
            setBusy(false);
          }
        }}
      >
        <Field label="Direction">
          <select
            value={direction}
            onChange={(e) => {
              setDirection(e.target.value as "buy" | "sell");
              setRes(null);
            }}
          >
            <option value="buy">Buy base with quote</option>
            <option value="sell">Sell base for quote</option>
          </select>
        </Field>
        <Field
          label="Amount in (atomic units)"
          hint={
            inDec === null ? "Input mint decimals unknown." : `Input mint has ${inDec} decimals.`
          }
        >
          <input
            value={amount}
            onChange={(e) => {
              setAmount(e.target.value.trim());
              setRes(null);
            }}
            inputMode="numeric"
            className="font-mono text-xs"
            maxLength={20}
            aria-invalid={amount.length > 0 && !okAmount}
          />
        </Field>
        <Field label="Slippage (bps)" hint="0 to 5000.">
          <input
            type="number"
            min={0}
            max={QUOTE_LIMITS.maxSlippageBps}
            value={slip}
            onChange={(e) =>
              setSlip(
                Math.max(
                  0,
                  Math.min(QUOTE_LIMITS.maxSlippageBps, Math.trunc(Number(e.target.value) || 0)),
                ),
              )
            }
          />
        </Field>
        <div className="sm:col-span-2">
          <Button type="submit" disabled={!okAmount || busy}>
            {busy ? "Quoting…" : "Quote against live state"}
          </Button>
        </div>
        {res && (
          <div className="sm:col-span-2" role="status">
            {res.ok && "outputAmount" in res ? (
              <dl className="proof-grid">
                <Row k="Estimated output" v={fmt(res.outputAmount, outDec)} ev="estimate" />
                <Row
                  k={`Minimum received at ${res.slippageBps} bps`}
                  v={fmt(res.minimumAmountOut, outDec)}
                  ev="estimate"
                />
                <Row k="Trading fee" v={res.tradingFee} ev="estimate" />
                <Row k="Protocol fee" v={res.protocolFee} ev="estimate" />
                <Row
                  k="Pool price movement"
                  v={
                    res.poolPriceMovePpm === null
                      ? "unavailable"
                      : `${(res.poolPriceMovePpm / 10_000).toFixed(4)}%`
                  }
                  ev="derived"
                />
                <Row
                  k="Quoted at slot / point"
                  v={`${res.observedSlot} / ${res.currentPoint}`}
                  ev="on-chain"
                />
              </dl>
            ) : !res.ok ? (
              <p className="error-message">
                {res.code === "sdk-error" || res.code === "partial-fill"
                  ? "UNSUPPORTED"
                  : res.code.toUpperCase()}
                : {res.message}
              </p>
            ) : null}
            {res.ok &&
              "caveats" in res &&
              res.caveats.map((c) => (
                <p key={c} className="micro">
                  {c}
                </p>
              ))}
          </div>
        )}
        <p className="micro sm:col-span-2">
          This uses the Meteora SDK's own quote math against decoded live pool and config state. The
          separate hypothetical Shadow Engine constant-product model is not used here.
        </p>
      </form>
    </Panel>
  );
}
