import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { PageHeading, Panel } from "./controls";
import { useConsole } from "@/lib/qli-core/context";
import { explorerTx } from "@/lib/qli-core/dbc-launch";
import {
  AUTHORIZATION_LABEL,
  AUTHZ_OPERATIONS,
  EXPIRY_MAX_S,
  EXPIRY_MIN_S,
  INTENT_KEYS,
  STATUS_LABEL,
  THRESHOLD_MAX_LAMPORTS,
  exportAuthorization,
  parsePolicy,
  type AuthorizationRecord,
} from "@/lib/qli-core/authorization";

const OP_LABEL = { claim: "Claim creator fees", buyback: "Buy back", burn: "Burn" } as const;

export function AuthorizationPage() {
  const c = useConsole();
  const [enabled, setEnabled] = useState(false);
  const [ops, setOps] = useState({ claim: true, buyback: true, burn: true });
  const [threshold, setThreshold] = useState("0");
  const [expiry, setExpiry] = useState("120");
  const [formMsg, setFormMsg] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [now, setNow] = useState(0);

  useEffect(() => {
    if (!c.authzPolicyReady) return;
    const p = c.authzPolicy;
    setEnabled(p.enabled);
    setOps(p.operations);
    setThreshold(String(p.buybackThresholdLamports / 1e9));
    setExpiry(String(p.expirySeconds));
  }, [c.authzPolicyReady, c.authzPolicy]);
  useEffect(() => {
    setNow(Math.floor(Date.now() / 1000));
    const t = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(t);
  }, []);
  // Mark live records whose expiration passed.
  useEffect(() => {
    for (const r of c.authorizations)
      if (
        (r.status === "created" || r.status === "verified-locally") &&
        now >= Number(r.intent.expiresAt)
      )
        c.markAuthorization(r.id, { status: "expired", reason: "Expiration passed." });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [now]);

  function save() {
    setFormMsg("");
    try {
      if (!/^\d{1,2}(\.\d{1,9})?$/.test(threshold.trim())) throw new Error("Threshold: 0–10 SOL.");
      const lamports = Math.round(Number(threshold) * 1e9);
      if (lamports > THRESHOLD_MAX_LAMPORTS) throw new Error("Threshold: 0–10 SOL.");
      if (!/^\d{1,4}$/.test(expiry.trim())) throw new Error("Expiration must be whole seconds.");
      c.saveAuthzPolicy(
        parsePolicy({
          enabled,
          operations: ops,
          buybackThresholdLamports: lamports,
          expirySeconds: Number(expiry),
        }),
      );
      setFormMsg("Policy saved in this browser.");
    } catch (e) {
      setFormMsg((e as Error).message);
    }
  }

  const id = c.identity;
  const remaining = c.ledger ? 256 - c.ledger.used.length : 0;
  const sel = c.authorizations.find((r) => r.id === selected) ?? c.authorizations[0] ?? null;

  function download(r: AuthorizationRecord) {
    const blob = new Blob([exportAuthorization(r)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `qli-authorization-${r.digest.slice(0, 12)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <div className="authz-page">
      <PageHeading
        eyebrow="IDENTITY / AUTHORIZATION"
        title="Quantum Authorization"
        description="Require a one-time WOTS/Merkle Quantum Identity proof over an exact Flywheel transaction intent before your wallet is asked to approve it."
      />
      <p className="authz-label" role="note">
        <strong>{AUTHORIZATION_LABEL}</strong> This is a usability policy in this app, not asset
        protection, quantum-safe custody or an on-chain verifier. Your Solana wallet still signs the
        actual transaction with its normal ed25519 key.
      </p>
      <div className="authz-grid">
        <Panel title="Identity" tag={id ? id.label.toUpperCase() : "NONE"}>
          {!id ? (
            <>
              <p>No Quantum Identity is open in this tab.</p>
              <ol className="authz-steps">
                <li>
                  Derive your identity in <Link to="/identity">Quantum Identity</Link> (reference
                  mode, not the public demo).
                </li>
                <li>Enable the policy below for the operations you choose.</li>
                <li>
                  In <Link to="/flywheel">Flywheel</Link>, build a step, sign the intent, then
                  approve in your wallet.
                </li>
              </ol>
            </>
          ) : (
            <dl className="authz-dl">
              <dt>Address</dt>
              <dd className="mono">{id.address}</dd>
              <dt>Root</dt>
              <dd className="mono">{id.root.slice(0, 24)}…</dd>
              <dt>Unused leaves</dt>
              <dd>{remaining} / 256</dd>
              <dt>Live use</dt>
              <dd>
                {id.label === "reference"
                  ? "Eligible"
                  : "Blocked — the public demo secret is published"}
              </dd>
            </dl>
          )}
          <p className="micro">
            Each authorization consumes one leaf, recorded in this browser's local leaf ledger. That
            ledger is not synchronized across devices or tabs and is not an on-chain replay lock.
          </p>
        </Panel>

        <Panel title="Policy" tag={c.authzPolicy.enabled ? "ENFORCED IN QLi" : "OFF"}>
          <p className="authz-label small" role="note">
            {AUTHORIZATION_LABEL}
          </p>
          {c.authzPolicyError && <p className="flywheel-error">{c.authzPolicyError}</p>}
          <label className="authz-check">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
            />
            Require Quantum Identity proof in QLi before wallet approval
          </label>
          <fieldset className="authz-ops" disabled={!enabled}>
            <legend className="micro">Eligible operations</legend>
            {AUTHZ_OPERATIONS.map((o) => (
              <label key={o} className="authz-check">
                <input
                  type="checkbox"
                  checked={ops[o]}
                  onChange={(e) => setOps({ ...ops, [o]: e.target.checked })}
                />
                {OP_LABEL[o]}
              </label>
            ))}
          </fieldset>
          <div className="flywheel-inputs">
            <label>
              Buyback threshold (SOL, 0 = always)
              <input
                inputMode="decimal"
                maxLength={12}
                value={threshold}
                onChange={(e) => setThreshold(e.target.value)}
              />
            </label>
            <label>
              Expiration ({EXPIRY_MIN_S}–{EXPIRY_MAX_S} s)
              <input
                type="number"
                min={EXPIRY_MIN_S}
                max={EXPIRY_MAX_S}
                value={expiry}
                onChange={(e) => setExpiry(e.target.value)}
              />
            </label>
          </div>
          <Button type="button" size="sm" onClick={save} disabled={!c.authzPolicyReady}>
            Save policy
          </Button>
          {formMsg && (
            <p className="micro" role="status">
              {formMsg}
            </p>
          )}
          <p className="micro">
            Stored only in this browser (local storage). It is mutable, browser-specific and not
            shared with other devices or clients. No keys or secrets are stored.
          </p>
        </Panel>
      </div>

      <Panel title="Authorization records" tag={`${c.authorizations.length} THIS SESSION`}>
        {c.authorizations.length === 0 ? (
          <p className="micro">
            No authorizations yet. Records are created from the Flywheel review step and kept for
            this tab only.
          </p>
        ) : (
          <table className="flywheel-table authz-table" aria-label="Authorization records">
            <thead>
              <tr>
                <th>Status</th>
                <th>Operation</th>
                <th>Leaf</th>
                <th>Digest</th>
                <th>Settlement</th>
              </tr>
            </thead>
            <tbody>
              {c.authorizations.map((r) => (
                <tr
                  key={r.id}
                  className={sel?.id === r.id ? "is-selected" : ""}
                  onClick={() => setSelected(r.id)}
                >
                  <td>
                    <span className={`authz-status s-${r.status}`}>{STATUS_LABEL[r.status]}</span>
                  </td>
                  <td>
                    {OP_LABEL[r.intent.operation as keyof typeof OP_LABEL]} · {r.intent.network}
                  </td>
                  <td>#{r.proof.leaf}</td>
                  <td className="mono">{r.digest.slice(0, 12)}…</td>
                  <td>
                    {r.status === "executed-on-chain" && r.signature ? (
                      <a
                        href={explorerTx(r.signature, r.intent.network as "devnet")}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {r.signature.slice(0, 8)}…
                      </a>
                    ) : (
                      <span className="micro">Local proof only</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>

      {sel && (
        <Panel title="Signed scope" tag={STATUS_LABEL[sel.status].toUpperCase()}>
          <p className="micro">
            The WOTS leaf signed exactly these canonical fields (fixed order, SHA-256 digest{" "}
            <span className="mono">{sel.digest.slice(0, 16)}…</span>) under the frozen proof domain.
            It authenticates intent in QLi; it does not enforce anything on Solana.
          </p>
          {sel.reason && <p className="micro">Note: {sel.reason}</p>}
          <dl className="authz-dl">
            {INTENT_KEYS.map((k) => (
              <div key={k} className="contents">
                <dt>{k}</dt>
                <dd className="mono">{sel.intent[k] || "—"}</dd>
              </div>
            ))}
          </dl>
          <div className="flywheel-inputs">
            <Button type="button" size="sm" variant="outline" onClick={() => download(sel)}>
              Export public proof JSON
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() =>
                void navigator.clipboard?.writeText(JSON.stringify(sel.proof, null, 2))
              }
            >
              Copy proof for Proof Inspector
            </Button>
            <Link to="/verify" className="underline">
              Open Proof Inspector →
            </Link>
          </div>
          <p className="micro">
            Export contains public material only: intent, digest, WOTS signature chains, Merkle
            path, root and public seed. Paste the copied proof under Identity proof in Proof
            Inspector.
          </p>
        </Panel>
      )}
    </div>
  );
}
