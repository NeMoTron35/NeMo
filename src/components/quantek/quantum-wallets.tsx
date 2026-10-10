import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  Vault,
  ShieldAlert,
  ArrowDownToLine,
  ArrowUpFromLine,
  Layers,
  RotateCw,
  History,
  Construction,
  LoaderCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeading, Panel, Field, InfoTip } from "./controls";
import { useConsole } from "@/lib/quantek/context";
import { PQ_PARAMETERS, DOMAINS } from "@/lib/quantek/pq";
import { isValidMint } from "@/lib/quantek/rwa";
import {
  QUANTEK_QUANTUM_WALLET_PROGRAM_ID,
  QUANTUM_WALLET_STATUS,
  canExecuteLive,
  createQuantumWalletAdapter,
  stagingPlan,
  vaultChain,
  withdrawalCommitment,
  type AssetRow,
} from "@/lib/quantek/quantum-wallet";

const ASSETS: AssetRow[] = [
  {
    symbol: "SOL",
    mint: "So11111111111111111111111111111111111111112",
    program: "Native",
    amount: 0,
    decimals: 9,
  },
  {
    symbol: "USDC",
    mint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
    program: "SPL Token",
    amount: 0,
    decimals: 6,
  },
  {
    symbol: "PYUSD",
    mint: "2b1kV6DkPAnxd5ixfnxCpjxmKwqjjaYmCZfHsFu24GXo",
    program: "Token-2022",
    amount: 0,
    decimals: 6,
  },
];
const TABS = [
  "Overview",
  "Create",
  "Assets",
  "Deposit",
  "Withdraw",
  "Staging",
  "Rollover",
  "History",
] as const;

export function QuantumWalletsPage() {
  const c = useConsole();
  const [tab, setTab] = useState<(typeof TABS)[number]>("Overview");
  const [consumed, setConsumed] = useState(0);
  const [created, setCreated] = useState(false);
  const [w, setW] = useState({ recipient: "", mint: ASSETS[0]!.mint, amount: "" });
  const [err, setErr] = useState("");
  const [staged, setStaged] = useState(0);
  const [history, setHistory] = useState<{ t: string; e: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const root = c.identity?.root;
  const vaults = useMemo(() => (root ? vaultChain(root, 6, consumed) : []), [root, consumed]);
  const active = vaults.find((v) => v.state === "active");
  const amount = Number(w.amount);
  const valid = isValidMint(w.recipient) && isValidMint(w.mint) && amount > 0;
  const commitment = useMemo(() => {
    if (!valid || !active) return null;
    try {
      return withdrawalCommitment(
        { recipient: w.recipient, mint: w.mint, amount, vaultIndex: active.index },
        vaults,
      );
    } catch {
      return null;
    }
  }, [valid, active, w, amount, vaults]);
  const chunks = stagingPlan();
  const adapter = createQuantumWalletAdapter();
  const log = (e: string) =>
    setHistory((h) => [{ t: new Date().toISOString().slice(11, 19), e }, ...h]);
  async function tryLive(kind: string) {
    setBusy(true);
    setErr("");
    try {
      if (!active) throw new Error("No active vault.");
      if (kind === "deposit") await adapter.buildDeposit({ vault: active, mint: w.mint, amount });
      else
        await adapter.buildWithdraw({
          recipient: w.recipient,
          mint: w.mint,
          amount,
          vaultIndex: active.index,
        });
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <PageHeading
        eyebrow="QUANTUM WALLETS / HASH-SIGNATURE VAULTS"
        title="Quantum Wallets"
        description="Custody designed around one-time WOTS keys: each vault spends exactly once and rolls its remainder into the next vault in the chain."
      />
      <div className="notice mb-6">
        <Construction size={16} />
        <span>
          <strong>{QUANTUM_WALLET_STATUS}.</strong> Quantum QLi has not deployed an on-chain WOTS
          verifier program (program id: {String(QUANTEK_QUANTUM_WALLET_PROGRAM_ID)}). This section
          models the vault chain, commitments and signature staging locally. No deposit or
          withdrawal can execute.
        </span>
      </div>
      <div
        className="segmented mb-6"
        style={{ margin: "0 0 22px", flexWrap: "wrap" }}
        role="tablist"
        aria-label="Quantum Wallet sections"
      >
        {TABS.map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            className={tab === t ? "selected" : ""}
            onClick={() => {
              setTab(t);
              setErr("");
            }}
          >
            {t}
          </button>
        ))}
      </div>
      {err && (
        <div className="error-message mb-4" role="alert">
          {err}
        </div>
      )}
      {tab === "Overview" && (
        <div className="three-col">
          <Panel title="Ordinary Solana wallet" tag="ED25519">
            <div className="notice" style={{ margin: 19 }}>
              Funds are authorized by an ed25519 signature. A sufficiently capable quantum computer
              could derive the private key from the public key. Quantum QLi provenance signatures do
              not change this.
            </div>
          </Panel>
          <Panel title="Quantum Wallet vault" tag="WOTS-16 · ONE-TIME">
            <div className="notice" style={{ margin: 19 }}>
              Funds sit in a program-owned vault that releases only on a valid hash-based signature
              over a full spend commitment. The key is single-use: every spend consumes the vault
              and moves the remainder forward.
            </div>
          </Panel>
          <Panel title="Roadmap" tag="REQUIRED">
            <div className="notice" style={{ margin: 19 }}>
              <ShieldAlert size={16} />
              On-chain verifier required for live Quantum Wallet custody. It must be audited,
              deployed under a Quantum QLi-controlled program id, and verify{" "}
              {PQ_PARAMETERS.signatureBytes}-byte signatures staged across transactions.
            </div>
          </Panel>
        </div>
      )}
      {tab === "Create" && (
        <Panel title="Create Quantum Wallet" tag={created ? "MODELED" : "NOT CREATED"}>
          <div className="instrument-body">
            {!c.identity ? (
              <div className="notice">
                <span>
                  A Quantum Wallet chain is derived from a Quantum QLi Identity Root.{" "}
                  <Link to="/identity" className="underline">
                    Open an identity →
                  </Link>
                </span>
              </div>
            ) : (
              <>
                <div className="detail-rows">
                  <div>
                    <span>Identity</span>
                    <strong>{c.identity.address}</strong>
                  </div>
                  <div>
                    <span>Namespace</span>
                    <strong>{DOMAINS.quantumWallet}</strong>
                  </div>
                  <div>
                    <span>Vault leaves</span>
                    <strong>#1 onward (leaf #0 is registration)</strong>
                  </div>
                  <div>
                    <span>Program</span>
                    <strong>Not deployed</strong>
                  </div>
                </div>
                <Button
                  className="mt-4"
                  disabled={created}
                  onClick={() => {
                    setCreated(true);
                    log("Vault chain modeled locally from identity root");
                  }}
                >
                  <Vault />
                  {created ? "Vault chain modeled" : "Model vault chain"}
                </Button>
              </>
            )}
          </div>
          {vaults.length > 0 && created && (
            <div className="vault-chain" aria-label="Vault chain">
              {vaults.map((v) => (
                <div key={v.index} className={`vault ${v.state}`}>
                  <div className="micro">
                    VAULT {String(v.index).padStart(2, "0")} · LEAF #{v.leaf} ·{" "}
                    {v.state.toUpperCase()}
                  </div>
                  <code>pkh {v.publicKeyHash.slice(0, 32)}…</code>
                  <code>{v.addressPreview}</code>
                </div>
              ))}
            </div>
          )}
        </Panel>
      )}
      {tab === "Assets" && (
        <Panel title="Assets" tag="SIMULATED · NO VAULT DEPLOYED">
          <div className="table-wrap" style={{ margin: 19 }}>
            <table>
              <thead>
                <tr>
                  <th>Asset</th>
                  <th>Program</th>
                  <th>Mint</th>
                  <th>Balance</th>
                </tr>
              </thead>
              <tbody>
                {ASSETS.map((a) => (
                  <tr key={a.mint}>
                    <td>{a.symbol}</td>
                    <td>{a.program}</td>
                    <td className="font-mono text-[10px]">
                      {a.mint.slice(0, 6)}…{a.mint.slice(-6)}
                    </td>
                    <td>{a.amount.toFixed(2)} · no vault</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="notice">
            SOL, SPL Token and Token-2022 assets are supported by the model. Token-2022 transfer
            hooks/fees must be evaluated per mint.
          </div>
        </Panel>
      )}
      {(tab === "Deposit" || tab === "Withdraw") && (
        <div className="two-col">
          <Panel
            title={tab === "Deposit" ? "Deposit" : "Prepare Withdrawal"}
            tag={canExecuteLive() ? "LIVE" : "READINESS ONLY"}
          >
            <div className="instrument-body">
              <div className="form-grid">
                {tab === "Withdraw" && (
                  <Field label="Recipient" hint="Solana address receiving the withdrawal.">
                    <input
                      aria-label="Recipient"
                      value={w.recipient}
                      onChange={(e) => setW({ ...w, recipient: e.target.value.trim() })}
                    />
                  </Field>
                )}
                <Field label="Asset">
                  <select
                    aria-label="Asset"
                    value={w.mint}
                    onChange={(e) => setW({ ...w, mint: e.target.value })}
                  >
                    {ASSETS.map((a) => (
                      <option key={a.mint} value={a.mint}>
                        {a.symbol} · {a.program}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Amount">
                  <input
                    type="number"
                    min="0"
                    step="any"
                    aria-label="Amount"
                    value={w.amount}
                    onChange={(e) => setW({ ...w, amount: e.target.value })}
                  />
                </Field>
              </div>
              {tab === "Withdraw" && (
                <div className="detail-rows mt-4">
                  <div>
                    <span>Active vault</span>
                    <strong>
                      {active ? `#${active.index} · leaf #${active.leaf}` : "Open identity"}
                    </strong>
                  </div>
                  <div>
                    <span>
                      Next vault hash{" "}
                      <InfoTip text="Remainder rolls into this vault; the commitment binds it." />
                    </span>
                    <strong>
                      {commitment ? commitment.nextVaultHash.slice(0, 24) + "…" : "—"}
                    </strong>
                  </div>
                  <div>
                    <span>Commitment digest</span>
                    <strong>{commitment ? commitment.digest : "Complete the form"}</strong>
                  </div>
                </div>
              )}
              <Button
                className="mt-4"
                disabled={busy || (tab === "Withdraw" ? !commitment : !(amount > 0) || !active)}
                onClick={() => tryLive(tab === "Deposit" ? "deposit" : "withdraw")}
              >
                {busy ? (
                  <LoaderCircle className="animate-spin" />
                ) : tab === "Deposit" ? (
                  <ArrowDownToLine />
                ) : (
                  <ArrowUpFromLine />
                )}
                Build {tab === "Deposit" ? "deposit" : "withdrawal"} transaction
              </Button>
              <p className="micro mt-3">
                EXPECTED RESULT: “{QUANTUM_WALLET_STATUS}” — the adapter refuses live construction.
              </p>
            </div>
          </Panel>
          <Panel title="Commitment fields" tag="SIGNED BY ONE WOTS LEAF">
            <pre className="code-block" style={{ margin: 19 }}>
              {commitment
                ? JSON.stringify(commitment.fields, null, 2)
                : "recipient · mint · amount · vault index\nnext-vault hash · program · version namespace"}
            </pre>
          </Panel>
        </div>
      )}
      {tab === "Staging" && (
        <Panel
          title="Signature staging"
          tag={`${PQ_PARAMETERS.signatureBytes} B · ${chunks.length} CHUNKS`}
        >
          <div className="instrument-body">
            <p className="text-xs text-muted-foreground mb-4">
              A WOTS+Merkle signature does not fit beside instructions in one 1,232-byte Solana
              packet, so it is written to a staging account in chunks, then verified in a final
              spend instruction.
            </p>
            {chunks.map((ch) => (
              <div key={ch.chunk} className="module-row">
                <span>
                  Chunk {ch.chunk} · bytes {ch.from}–{ch.to}
                </span>
                <span className="status-tag">
                  {staged >= ch.chunk ? "STAGED · SIMULATED" : "PENDING"}
                </span>
              </div>
            ))}
            <div className="progress-track">
              <progress max={chunks.length} value={staged} aria-label="Chunks staged" />
            </div>
            <div className="flex gap-3 mt-4">
              <Button
                variant="outline"
                disabled={staged >= chunks.length}
                onClick={() => {
                  setStaged((s) => s + 1);
                  log(`Chunk ${staged + 1} staged (simulation)`);
                }}
              >
                <Layers />
                Simulate next chunk
              </Button>
              <Button variant="ghost" onClick={() => setStaged(0)}>
                Reset
              </Button>
            </div>
          </div>
        </Panel>
      )}
      {tab === "Rollover" && (
        <Panel title="Rollover" tag="ONE-TIME SPEND">
          <div className="instrument-body">
            <p className="text-xs text-muted-foreground mb-4">
              After a spend, the vault is a tombstone. Its remainder must already be committed to
              the next vault; it can never sign again.
            </p>
            <div className="detail-rows">
              <div>
                <span>Current</span>
                <strong>{active ? `Vault #${active.index}` : "—"}</strong>
              </div>
              <div>
                <span>Next</span>
                <strong>
                  {vaults[(active?.index ?? 0) + 1]?.publicKeyHash.slice(0, 24) ?? "—"}…
                </strong>
              </div>
            </div>
            <Button
              className="mt-4"
              variant="outline"
              disabled={!created || !active}
              onClick={() => {
                setConsumed((n) => n + 1);
                log(`Vault #${active?.index} tombstoned · remainder rolled forward (model)`);
              }}
            >
              <RotateCw />
              Simulate rollover
            </Button>
          </div>
          {created && (
            <div className="vault-chain">
              {vaults.map((v) => (
                <div key={v.index} className={`vault ${v.state}`}>
                  <div className="micro">
                    #{v.index} · {v.state === "consumed" ? "TOMBSTONE" : v.state.toUpperCase()}
                  </div>
                  <code>{v.publicKeyHash.slice(0, 20)}…</code>
                </div>
              ))}
            </div>
          )}
        </Panel>
      )}
      {tab === "History" && (
        <Panel title="History / Proof Trace" tag="LOCAL MODEL">
          {history.length ? (
            <div className="detail-rows" style={{ padding: 19 }}>
              {history.map((h, i) => (
                <div key={i}>
                  <span>{h.t}</span>
                  <strong>{h.e}</strong>
                </div>
              ))}
            </div>
          ) : (
            <div className="empty-state" style={{ margin: 19 }}>
              <History size={24} />
              No modeled events yet.
            </div>
          )}
        </Panel>
      )}
    </>
  );
}