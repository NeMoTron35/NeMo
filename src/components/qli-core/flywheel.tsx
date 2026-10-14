import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { PageHeading, Panel, CopyValue } from "./controls";
import { useConsole } from "@/lib/qli-core/context";
import { TOKEN_CA } from "@/lib/qli-core/data";
import { FlywheelLive } from "./flywheel-live";
import {
  PRESETS,
  SLICE_KEYS,
  SLICE_META,
  TIER_LABEL,
  allocationError,
  proposalDocument,
  proposalError,
  simulateScenario,
  type Allocation,
  type ProposalDraft,
  type SliceKey,
} from "@/lib/qli-core/flywheel";

const fmt = (n: number, d = 4) =>
  `${(Number.isFinite(n) ? n : 0).toLocaleString("en-US", { maximumFractionDigits: d })} SOL`;

function FeeWheel({ alloc }: { alloc: Allocation }) {
  const r = 70;
  const c = 2 * Math.PI * r;
  let offset = 0;
  return (
    <svg
      viewBox="0 0 180 180"
      className="flywheel-wheel"
      role="img"
      aria-label="Hypothetical fee allocation wheel"
    >
      <circle cx="90" cy="90" r={r} fill="none" stroke="var(--border)" strokeWidth="26" />
      {SLICE_KEYS.map((k) => {
        const len = (Math.max(0, alloc[k]) / 100) * c;
        const el = (
          <circle
            key={k}
            cx="90"
            cy="90"
            r={r}
            fill="none"
            stroke={SLICE_META[k].color}
            strokeWidth="26"
            strokeDasharray={`${len} ${c - len}`}
            strokeDashoffset={-offset}
            transform="rotate(-90 90 90)"
          />
        );
        offset += len;
        return el;
      })}
      <text x="90" y="86" textAnchor="middle" className="flywheel-wheel-label">
        SCENARIO
      </text>
      <text x="90" y="102" textAnchor="middle" className="flywheel-wheel-label">
        not on-chain
      </text>
    </svg>
  );
}

export function FlywheelPage() {
  const c = useConsole();
  const [alloc, setAlloc] = useState<Allocation>(PRESETS[1]!.alloc);
  const [launches, setLaunches] = useState(5);
  const [volume, setVolume] = useState(200);
  const [feeRate, setFeeRate] = useState(1);
  const [price, setPrice] = useState(0.00001);
  const result = useMemo(
    () =>
      simulateScenario({
        launches,
        volumePerCoinSol: volume,
        feeRatePct: feeRate,
        tokenPriceSol: price,
        alloc,
      }),
    [launches, volume, feeRate, price, alloc],
  );
  const allocErr = allocationError(alloc);
  const [draft, setDraft] = useState<ProposalDraft>({
    kind: "buyback",
    targetMint: TOKEN_CA,
    amountSol: 1,
    cadence: "weekly",
    rationale: "",
  });
  const draftErr = proposalError(draft);
  const doc = draftErr ? null : proposalDocument(draft);

  function preset(id: string) {
    const p = PRESETS.find((x) => x.id === id);
    if (!p) return;
    setAlloc(p.alloc);
    c.log(`Flywheel scenario preset: ${p.name}`, "Flywheel", "—", "Hypothetical scenario only");
  }
  const num = (v: string) => (Number.isFinite(Number(v)) ? Number(v) : 0);

  return (
    <>
      <PageHeading
        eyebrow="ECONOMICS / SCENARIO ENGINE"
        title="Quantum Flywheel Engine"
        description="Run a real claim, buy back and burn cycle on your own Meteora DBC pool, one wallet-approved step at a time, and model allocation scenarios alongside it."
      />
      <div className="flywheel-notice" role="note">
        <strong>Scenario tools are {TIER_LABEL.hypothetical.toLowerCase()}.</strong> Only the Live
        cycle window sends transactions, and only after your wallet approves each one. Real creator
        and partner fee shares are fixed in the Meteora DBC config at{" "}
        <Link to="/launch">Launch Forge</Link>; claims are reviewed in{" "}
        <Link to="/fees">Revenue</Link>.
      </div>
      <div className="flywheel-grid">
        <FlywheelLive suggestedBuybackPct={alloc.buyback} />
        <Panel title="Allocation" tag="HYPOTHETICAL">
          <div className="segmented" role="group" aria-label="Allocation presets">
            {PRESETS.map((p) => (
              <Button
                key={p.id}
                type="button"
                size="sm"
                variant="outline"
                onClick={() => preset(p.id)}
              >
                {p.name}
              </Button>
            ))}
          </div>
          <div className="flywheel-body">
            <FeeWheel alloc={alloc} />
            <div className="flywheel-sliders">
              {SLICE_KEYS.map((k: SliceKey) => (
                <label key={k} className="flywheel-slider">
                  <span>
                    <i style={{ background: SLICE_META[k].color }} aria-hidden />{" "}
                    {SLICE_META[k].label}
                  </span>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={alloc[k]}
                    aria-label={`${SLICE_META[k].label} share`}
                    onChange={(e) => setAlloc({ ...alloc, [k]: num(e.target.value) })}
                  />
                  <b>{alloc[k]}%</b>
                </label>
              ))}
              {allocErr && (
                <p className="flywheel-error" role="alert">
                  {allocErr}
                </p>
              )}
            </div>
          </div>
        </Panel>
        <Panel title="Projection" tag="HYPOTHETICAL">
          <div className="flywheel-inputs">
            <label>
              Launches per day
              <input
                type="number"
                min={0}
                value={launches}
                onChange={(e) => setLaunches(num(e.target.value))}
              />
            </label>
            <label>
              Daily volume per coin (SOL)
              <input
                type="number"
                min={0}
                value={volume}
                onChange={(e) => setVolume(num(e.target.value))}
              />
            </label>
            <label>
              Fee rate (%)
              <input
                type="number"
                min={0}
                step={0.1}
                value={feeRate}
                onChange={(e) => setFeeRate(num(e.target.value))}
              />
            </label>
            <label>
              Token price (SOL)
              <input
                type="number"
                min={0}
                step={0.000001}
                value={price}
                onChange={(e) => setPrice(num(e.target.value))}
              />
            </label>
          </div>
          <table className="flywheel-table">
            <tbody>
              <tr>
                <th>Fees per coin / day</th>
                <td>{fmt(result.feesPerCoin)}</td>
              </tr>
              <tr>
                <th>Total / day</th>
                <td>{fmt(result.daily)}</td>
              </tr>
              <tr>
                <th>Total / 30 days</th>
                <td>{fmt(result.monthly, 2)}</td>
              </tr>
              {SLICE_KEYS.map((k) => (
                <tr key={k}>
                  <th>{SLICE_META[k].label} / day</th>
                  <td>{fmt(result.flows[k])}</td>
                </tr>
              ))}
              <tr>
                <th>Tokens acquired / day</th>
                <td>
                  {result.tokensBoughtDaily.toLocaleString("en-US", { maximumFractionDigits: 0 })}
                </td>
              </tr>
            </tbody>
          </table>
          <p className="micro">Inputs are your assumptions, not live market data or a forecast.</p>
        </Panel>
        <Panel title="Buyback / burn proposal" tag="PROPOSAL ONLY">
          <div className="flywheel-inputs">
            <label>
              Kind
              <select
                value={draft.kind}
                onChange={(e) =>
                  setDraft({ ...draft, kind: e.target.value as ProposalDraft["kind"] })
                }
              >
                <option value="buyback">Buyback</option>
                <option value="burn">Burn</option>
              </select>
            </label>
            <label>
              Cadence
              <select
                value={draft.cadence}
                onChange={(e) =>
                  setDraft({ ...draft, cadence: e.target.value as ProposalDraft["cadence"] })
                }
              >
                <option value="once">Once</option>
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
              </select>
            </label>
            <label>
              Target mint
              <input
                value={draft.targetMint}
                onChange={(e) => setDraft({ ...draft, targetMint: e.target.value.trim() })}
              />
            </label>
            <label>
              Amount (SOL)
              <input
                type="number"
                min={0}
                value={draft.amountSol}
                onChange={(e) => setDraft({ ...draft, amountSol: num(e.target.value) })}
              />
            </label>
            <label className="wide">
              Rationale
              <textarea
                rows={3}
                value={draft.rationale}
                onChange={(e) => setDraft({ ...draft, rationale: e.target.value })}
              />
            </label>
          </div>
          {draftErr ? (
            <p className="flywheel-error" role="alert">
              {draftErr}
            </p>
          ) : (
            doc && (
              <div className="flywheel-doc">
                <div className="micro">SHA-256 DIGEST</div>
                <CopyValue value={doc.digest} />
                <pre>{JSON.stringify(doc.body, null, 2)}</pre>
                <Button
                  type="button"
                  size="sm"
                  onClick={() => {
                    void navigator.clipboard?.writeText(doc.canonical);
                    c.log(
                      "Flywheel proposal copied",
                      "Flywheel",
                      "—",
                      `Hypothetical proposal ${doc.digest.slice(0, 12)}`,
                    );
                  }}
                >
                  Copy proposal
                </Button>
                <p className="micro">
                  This document executes nothing. There is no execute control by design.
                </p>
              </div>
            )
          )}
        </Panel>
      </div>
    </>
  );
}
