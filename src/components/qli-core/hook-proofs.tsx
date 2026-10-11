import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Panel, Field, PageHeading } from "./controls";
import { TIERS, REPOSITORY_EVIDENCE, type HookProof } from "@/lib/qli-core/hook-proof";
import { verifyHookEnforcement } from "@/lib/qli-core/hook-proof.functions";
import { isAddress, isSignature } from "@/lib/qli-core/launch-proof";

type Claim = "transfer-allow" | "transfer-deny" | "dbc-swap" | "migration";
const CLAIMS: [Claim, string][] = [
  ["transfer-allow", "Allowed transfer"],
  ["transfer-deny", "Denied transfer (hook refusal)"],
  ["dbc-swap", "DBC swap2WithTransferHook"],
  ["migration", "Migration to DAMM v2"],
];

export function TierLadder({ tier }: { tier: string | null }) {
  const idx = tier ? TIERS.indexOf(tier as (typeof TIERS)[number]) : -1;
  return (
    <ol className="hp-tiers" aria-label="Evidence tiers">
      {TIERS.map((t, i) => (
        <li
          key={t}
          className={i <= idx ? "reached" : ""}
          aria-current={i === idx ? "step" : undefined}
        >
          <span className="micro">{String(i).padStart(2, "0")}</span> {t}
        </li>
      ))}
    </ol>
  );
}

export function HookProofsPage() {
  const [mint, setMint] = useState("");
  const [hook, setHook] = useState("");
  const [dbc, setDbc] = useState("");
  const [damm, setDamm] = useState("");
  const [txs, setTxs] = useState<{ signature: string; claim: Claim }[]>([]);
  const [r, setR] = useState<HookProof | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const fn = useServerFn(verifyHookEnforcement);
  const okInput =
    isAddress(mint.trim()) &&
    isAddress(hook.trim()) &&
    (!dbc.trim() || isAddress(dbc.trim())) &&
    (!damm.trim() || isAddress(damm.trim())) &&
    txs.every((t) => isSignature(t.signature.trim()));
  const run = async () => {
    setBusy(true);
    setErr(null);
    try {
      setR(
        await fn({
          data: {
            network: "devnet",
            mint: mint.trim(),
            hookProgram: hook.trim(),
            ...(dbc.trim() ? { dbcPool: dbc.trim() } : {}),
            ...(damm.trim() ? { dammPool: damm.trim() } : {}),
            txs: txs.map((t) => ({ signature: t.signature.trim(), claim: t.claim })),
          },
        }),
      );
    } catch {
      setR(null);
      setErr("Verification request failed. Nothing was verified.");
    }
    setBusy(false);
  };
  return (
    <div>
      <PageHeading
        eyebrow="QLi HOOK FORGE / V2 / ENFORCEMENT PROOF"
        title="Hook Enforcement Proof"
        description="Verify a Token-2022 transfer hook, a Meteora DBC TransferHookPool and DAMM v2 graduation from devnet RPC evidence. Read-only: nothing here signs."
        action={
          <span>
            <Link to="/hook-devnet" className="desk-link">
              Hook Devnet Console
            </Link>{" "}
            <Link to="/hook-forge" className="desk-link">
              Hook Forge
            </Link>{" "}
            <Link to="/launch-proofs" className="desk-link">
              Launch Proofs
            </Link>
          </span>
        }
      />
      <div className="settings-stack">
        <div className="cs-banner" role="note">
          <strong>Devnet only.</strong>
          <span>
            Repository evidence: unit tests {REPOSITORY_EVIDENCE.unitTests}; local Token-2022 CPI
            test {REPOSITORY_EVIDENCE.localValidatorCpi}; deployed program{" "}
            {REPOSITORY_EVIDENCE.deployedProgramId ?? "none"}; audit none. A transfer hook only runs
            on Token-2022 transfers; it is not a swap callback and does not guarantee DAMM v2
            compatibility.
          </span>
        </div>
        <Panel title="Evidence to verify" tag="SERVER-TRUSTED DEVNET RPC">
          <form
            className="instrument-body form-grid"
            onSubmit={(e) => {
              e.preventDefault();
              if (okInput) void run();
            }}
          >
            <Field label="Token-2022 mint">
              <input
                value={mint}
                onChange={(e) => setMint(e.target.value)}
                placeholder="Base58 mint"
              />
            </Field>
            <Field label="Hook program">
              <input
                value={hook}
                onChange={(e) => setHook(e.target.value)}
                placeholder="Base58 program id"
              />
            </Field>
            <Field label="DBC TransferHookPool (optional)">
              <input value={dbc} onChange={(e) => setDbc(e.target.value)} />
            </Field>
            <Field label="DAMM v2 pool (optional)">
              <input value={damm} onChange={(e) => setDamm(e.target.value)} />
            </Field>
            {txs.map((t, i) => (
              <div key={i} className="hp-tx">
                <Field label={`Transaction ${i + 1}`}>
                  <input
                    value={t.signature}
                    onChange={(e) =>
                      setTxs((xs) =>
                        xs.map((x, j) => (j === i ? { ...x, signature: e.target.value } : x)),
                      )
                    }
                    placeholder="Signature"
                  />
                </Field>
                <Field label="Claim">
                  <select
                    value={t.claim}
                    onChange={(e) =>
                      setTxs((xs) =>
                        xs.map((x, j) => (j === i ? { ...x, claim: e.target.value as Claim } : x)),
                      )
                    }
                  >
                    {CLAIMS.map(([v, l]) => (
                      <option key={v} value={v}>
                        {l}
                      </option>
                    ))}
                  </select>
                </Field>
                <button
                  type="button"
                  className="hf-btn"
                  onClick={() => setTxs((xs) => xs.filter((_, j) => j !== i))}
                >
                  Remove
                </button>
              </div>
            ))}
            {txs.length < 8 && (
              <button
                type="button"
                className="hf-btn"
                onClick={() => setTxs((xs) => [...xs, { signature: "", claim: "transfer-allow" }])}
              >
                Add transaction
              </button>
            )}
            <button type="submit" className="hf-btn" disabled={!okInput || busy}>
              {busy ? "Verifying…" : "Verify on devnet"}
            </button>
          </form>
        </Panel>
        {err && (
          <p className="hf-findings error" role="status">
            {err}
          </p>
        )}
        <Panel title="Result" tag={r ? r.tier : "EMPTY"}>
          <div className="instrument-body">
            <TierLadder tier={r?.ok ? r.tier : null} />
            {!r ? (
              <p className="hf-empty">No evidence checked yet. No tier is assumed.</p>
            ) : (
              <>
                <p role="status">
                  {r.message}
                  {r.observedSlot !== null ? ` Observed slot ${r.observedSlot}.` : ""}
                </p>
                {r.checks.length > 0 && (
                  <ul className="hf-findings">
                    {r.checks.map((c) => (
                      <li
                        key={c.id}
                        className={
                          c.status === "pass" ? "info" : c.status === "fail" ? "error" : "warning"
                        }
                      >
                        <strong>{c.status.toUpperCase()}</strong> {c.label}: {c.detail}
                      </li>
                    ))}
                  </ul>
                )}
                {r.txs.length > 0 && (
                  <div className="hf-table-wrap">
                    <table className="hf-table">
                      <thead>
                        <tr>
                          <th>Signature</th>
                          <th>Claim</th>
                          <th>Phase</th>
                          <th>Status</th>
                          <th>Detail</th>
                        </tr>
                      </thead>
                      <tbody>
                        {r.txs.map((t) => (
                          <tr key={t.signature + t.claim}>
                            <td>
                              <code>{t.signature.slice(0, 10)}…</code>
                            </td>
                            <td>{t.claim}</td>
                            <td>{t.phase}</td>
                            <td>{t.status}</td>
                            <td>{t.detail}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                {r.receipt && (
                  <p>
                    Receipt digest <code className="hf-digest">{r.receipt.digest}</code>{" "}
                    {r.receipt.integrity}.
                  </p>
                )}
              </>
            )}
          </div>
        </Panel>
      </div>
    </div>
  );
}