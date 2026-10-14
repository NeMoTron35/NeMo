import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { PublicKey } from "@solana/web3.js";
import { Button } from "@/components/ui/button";
import { PageHeading, Panel, Field } from "./controls";
import { VaultDeployVerify } from "./vault-deploy-verify";
import {
  LOCAL_BUILD_PROGRAM_ID,
  MAX_INTENT_TTL_SECS,
  QUANTUM_VAULT_DEPLOYMENT,
  UNPAUSE_DELAY_SECS,
  VAULT_STATUS_LABEL,
  deriveVault,
  previewWithdraw,
  chainWritesEnabled,
  type VaultAccount,
} from "@/lib/qli-core/quantum-vault";

const INSTRUCTIONS = [
  [
    "create_vault",
    "Owner",
    "Fixes mint, destination token account, per-withdraw max, fixed 24-hour window limit, unlock time. Immutable afterwards.",
  ],
  [
    "deposit",
    "Token holder",
    "transfer_checked into the vault PDA's associated token account. Zero rejected.",
  ],
  [
    "withdraw",
    "Owner",
    "Program checks policy against Clock, nonce, epoch, expiry; PDA signs transfer_checked to the fixed destination only.",
  ],
  ["pause", "Owner", "Immediate. Blocks all withdrawals."],
  [
    "request_unpause / unpause",
    "Owner",
    `Unpause activates only after ${UNPAUSE_DELAY_SECS / 3600}h and bumps the epoch, voiding older intents.`,
  ],
] as const;

function parseKey(v: string) {
  try {
    return new PublicKey(v.trim());
  } catch {
    return null;
  }
}

export function QuantumVaultPage() {
  const live = chainWritesEnabled();
  const [owner, setOwner] = useState("");
  const [mint, setMint] = useState("");
  const [vid, setVid] = useState("1");
  const derived = useMemo(() => {
    const o = parseKey(owner),
      m = parseKey(mint);
    if (!o || !m || !/^\d{1,19}$/.test(vid)) return null;
    try {
      return deriveVault(new PublicKey(LOCAL_BUILD_PROGRAM_ID), o, m, BigInt(vid));
    } catch {
      return null;
    }
  }, [owner, mint, vid]);

  const [max, setMax] = useState("100");
  const [daily, setDaily] = useState("250");
  const [spent, setSpent] = useState("0");
  const [amount, setAmount] = useState("50");
  const [paused, setPaused] = useState(false);
  const preview = useMemo(() => {
    if (![max, daily, spent, amount].every((x) => /^\d{1,19}$/.test(x)))
      return "Enter whole base units";
    const now = BigInt(Math.floor(Date.now() / 1000));
    const k = new PublicKey(LOCAL_BUILD_PROGRAM_ID);
    const s: VaultAccount = {
      version: 1,
      bump: 0,
      owner: k,
      mint: k,
      vaultId: 1n,
      decimals: 0,
      destination: k,
      destinationOwner: k,
      maxPerWithdraw: BigInt(max),
      dailyLimit: BigInt(daily),
      unlockTs: 0n,
      windowStart: now,
      windowSpent: BigInt(spent),
      nonce: 0n,
      epoch: 0,
      paused,
      unpauseAt: 0n,
    };
    const r = previewWithdraw(
      s,
      {
        vault: "",
        amount: BigInt(amount),
        destination: k.toBase58(),
        nonce: 0n,
        epoch: 0,
        expiresAt: now + 120n,
      },
      BigInt(10) ** 18n,
      now,
    );
    return r.ok ? "Would pass policy" : `Program would reject: ${r.error}`;
  }, [max, daily, spent, amount, paused]);

  return (
    <div className="page-stack">
      <PageHeading
        eyebrow="Protocol · Phase 1"
        title="Quantum Vault Protocol"
        description="An undeployed Solana program designed for policy-limited classic SPL Token escrow. Unaudited; compiled-program execution passed locally, not on devnet."
      />
      <div role="alert" className="instrument" style={{ borderWidth: 2 }}>
        <strong>{live ? "Devnet deployment configured" : VAULT_STATUS_LABEL}</strong>
        <p>
          No verified deployment is configured, so deposit and withdraw are disabled and no
          transaction can be built. Program id {LOCAL_BUILD_PROGRAM_ID.slice(0, 6)}… is a local
          build id, not a deployed address. Mainnet is not supported.
        </p>
        <p>
          Phase 1 is authorized by your ordinary Solana wallet signature. It is not
          quantum-resistant custody; program-enforced limits reduce damage from a compromised wallet
          but do not stop the owner key itself.
        </p>
      </div>

      <Panel title="Instructions and permissions" tag="on-chain">
        <div style={{ overflowX: "auto" }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Instruction</th>
                <th>Signer</th>
                <th>Enforced by program</th>
              </tr>
            </thead>
            <tbody>
              {INSTRUCTIONS.map(([n, s, d]) => (
                <tr key={n}>
                  <td>
                    <code>{n}</code>
                  </td>
                  <td>{s}</td>
                  <td>{d}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="micro">
          No admin, no rescue, no policy loosening, no arbitrary CPI, classic SPL Token only (no
          Token-2022, no native SOL). Program upgrade authority will be disclosed at deployment;
          upgradeable programs are not immutable.
        </p>
      </Panel>

      <Panel title="Vault address calculator" tag="local build id">
        <Field label="Owner wallet">
          <input
            value={owner}
            onChange={(e) => setOwner(e.target.value)}
            placeholder="Owner public key"
          />
        </Field>
        <Field label="Token mint">
          <input
            value={mint}
            onChange={(e) => setMint(e.target.value)}
            placeholder="Classic SPL mint"
          />
        </Field>
        <Field label="Vault id (u64)">
          <input value={vid} onChange={(e) => setVid(e.target.value)} inputMode="numeric" />
        </Field>
        <dl className="kv">
          <dt>Vault PDA</dt>
          <dd>
            <code>{derived?.vault.toBase58() ?? "—"}</code>
          </dd>
          <dt>Escrow token account</dt>
          <dd>
            <code>{derived?.escrow.toBase58() ?? "—"}</code>
          </dd>
        </dl>
      </Panel>

      <Panel title="Policy preview" tag="advisory — program is the authority">
        <Field label="Max per withdraw (base units)">
          <input value={max} onChange={(e) => setMax(e.target.value)} />
        </Field>
        <Field label="Fixed 24-hour window limit (base units)">
          <input value={daily} onChange={(e) => setDaily(e.target.value)} />
        </Field>
        <Field label="Already spent this window">
          <input value={spent} onChange={(e) => setSpent(e.target.value)} />
        </Field>
        <Field label="Withdraw amount">
          <input value={amount} onChange={(e) => setAmount(e.target.value)} />
        </Field>
        <label>
          <input type="checkbox" checked={paused} onChange={(e) => setPaused(e.target.checked)} />{" "}
          Paused
        </label>
        <p aria-live="polite">
          <strong>{preview}</strong>
        </p>
        <p className="micro">
          Intents expire within {MAX_INTENT_TTL_SECS / 60} minutes and must use the next sequential
          nonce.
        </p>
        <div className="button-row">
          <Button disabled title={VAULT_STATUS_LABEL}>
            Deposit (disabled)
          </Button>
          <Button disabled title={VAULT_STATUS_LABEL}>
            Withdraw (disabled)
          </Button>
        </div>
      </Panel>

      <VaultDeployVerify />

      <Panel title="Related prototypes" tag="reference only">
        <p>
          <Link to="/vaults">My Vaults &amp; Key</Link> holds a local ML-DSA-65 key in tab memory
          and <Link to="/quantum-wallets">Quantum Wallets</Link> models WOTS vault chains. Neither
          is connected to this program, and Flywheel wallet tokens are not held in any vault.
        </p>
      </Panel>

      <Panel title="Phase 2 research — not built" tag="future">
        <p>
          On-chain post-quantum verification (WOTS/XMSS or ML-DSA) is under research: transaction
          size (1,232 bytes), compute budget, multi-instruction signature staging and published test
          vectors. Until a verifier is deployed and audited, Quantum Identity and Quantum
          Authorization proofs remain application-level.{" "}
          {QUANTUM_VAULT_DEPLOYMENT ? "" : "Nothing in Phase 1 checks them."}
        </p>
      </Panel>
    </div>
  );
}
