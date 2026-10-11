import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Panel, Field } from "./controls";
import { QUANTUM_VAULT_DEPLOYMENT } from "@/lib/qli-core/quantum-vault";
import {
  OWNER_REVIEWED_ARTIFACT,
  PINNED_TOOLCHAIN,
  PLACEHOLDER_BUILD_ARTIFACT,
  DEPLOY_RUNBOOK,
  type VerifierReport,
} from "@/lib/qli-core/vault-verifier";
import { SENTINEL_WORKER_COVERAGE, sentinelStatus } from "@/lib/qli-core/vault-sentinel";

const DEVNET_RPC = "https://api.devnet.solana.com";

export function VaultDeployVerify() {
  const [pid, setPid] = useState("");
  const [auth, setAuth] = useState("");
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<VerifierReport | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const sentinel = sentinelStatus(QUANTUM_VAULT_DEPLOYMENT);

  async function run() {
    setBusy(true);
    setErr(null);
    setReport(null);
    try {
      const [{ Connection }, { verifyDeployedProgram }, idl] = await Promise.all([
        import("@solana/web3.js"),
        import("@/lib/qli-core/vault-verifier"),
        fetch("/quantum_vault.idl.json")
          .then((r) => (r.ok ? r.arrayBuffer() : null))
          .catch(() => null),
      ]);
      const conn = new Connection(DEVNET_RPC, "confirmed");
      setReport(
        await verifyDeployedProgram(conn, {
          programId: pid,
          artifact:
            OWNER_REVIEWED_ARTIFACT && OWNER_REVIEWED_ARTIFACT.programId === pid.trim()
              ? OWNER_REVIEWED_ARTIFACT
              : undefined,
          expectedUpgradeAuthority: auth || undefined,
          idlBytes: idl ? new Uint8Array(idl) : undefined,
        }),
      );
    } catch {
      setErr("Devnet RPC read failed. Nothing was signed or sent.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Panel title="Deploy & Verify — devnet only" tag="OWNER SIGNATURE REQUIRED">
        <p>
          Status:{" "}
          <strong>{QUANTUM_VAULT_DEPLOYMENT ? "configured" : "NO PUBLIC DEVNET DEPLOYMENT"}</strong>
          . This app never receives, stores or uses a private key and cannot deploy programs from
          the browser. You deploy from your own machine with your own signer and remain the upgrade
          authority. Your <em>wallet keypair</em> (pays and holds upgrade authority) is distinct
          from the <em>program-id keypair</em> (only fixes the address).
        </p>
        <p className="muted">
          Toolchain: {PINNED_TOOLCHAIN}. The placeholder build hash{" "}
          <code>{PLACEHOLDER_BUILD_ARTIFACT.sha256.slice(0, 16)}…</code> only matches the
          placeholder program id; your rebuild with your own id produces a new hash. Reviewed owner
          artifact:{" "}
          {OWNER_REVIEWED_ARTIFACT ? (
            <code>{OWNER_REVIEWED_ARTIFACT.sha256}</code>
          ) : (
            "none yet — bytecode check shows NOT CHECKED"
          )}
          . Share only your public program address and public upgrade authority.
        </p>
        <ol className="runbook">
          {DEPLOY_RUNBOOK.map((s) => (
            <li key={s.step}>
              <strong>{s.step}</strong>
              <pre className="console-output" style={{ whiteSpace: "pre-wrap" }}>
                {s.cmd}
              </pre>
            </li>
          ))}
        </ol>
        <p className="muted">
          Multisig: after verification, transfer upgrade authority to a Squads multisig with{" "}
          <code>solana program set-upgrade-authority</code> — only after testing on devnet.
        </p>
      </Panel>

      <Panel title="Program Verifier" tag="read-only · devnet RPC">
        <Field label="Deployed devnet program address">
          <input
            value={pid}
            onChange={(e) => setPid(e.target.value)}
            placeholder="Program id you deployed"
          />
        </Field>
        <Field label="Expected upgrade authority (your wallet public key)">
          <input
            value={auth}
            onChange={(e) => setAuth(e.target.value)}
            placeholder="Optional but required for a full pass"
          />
        </Field>
        <div className="button-row">
          <Button onClick={run} disabled={busy || !pid.trim()}>
            {busy ? "Reading devnet…" : "Verify on devnet"}
          </Button>
        </div>
        {err && <p role="alert">{err}</p>}
        {report && (
          <table className="data-table">
            <tbody>
              {report.checks.map((c) => (
                <tr key={c.id}>
                  <td>
                    {c.status === "pass" ? "PASS" : c.status === "fail" ? "FAIL" : "NOT CHECKED"}
                  </td>
                  <td>{c.label}</td>
                  <td style={{ wordBreak: "break-all" }}>{c.detail}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="muted">
          A passing report is evidence only. Write controls stay disabled until the reviewed
          deployment config is committed to source and re-attested live before every signature.
        </p>
      </Panel>

      <Panel title="Vault Sentinel" tag="read-only">
        <p>{sentinel.label}</p>
        <p className="muted">
          Scheduled worker coverage of vaults:{" "}
          {SENTINEL_WORKER_COVERAGE ? "active" : "not configured"}. Sentinel proposals (e.g. pause
          after an authority change) are review documents; every action is rebuilt from a fresh
          chain read and signed by your wallet.
        </p>
      </Panel>
    </>
  );
}