import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Connection, PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { KeyRound, RotateCw, Eye, EyeOff, LoaderCircle, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DeskWindow } from "./window";
import { useWalletDialog } from "./wallet-dialog-context";
import { PageHeading, Field } from "@/components/qli-core/controls";
import { useConsole } from "@/lib/qli-core/context";
import { useVault } from "@/lib/qli/vault-context";
import { isValidMint } from "@/lib/qli-core/rwa";
const vaultNav = [
  ["Vault Desk", "/vault"],
  ["My Vaults & Key", "/vaults"],
  ["Deposit", "/deposit"],
  ["Withdraw", "/withdraw"],
  ["Quantum Security", "/security"],
  ["Wallet Events", "/activity"],
  ["Docs", "/docs"],
] as const;
export function VaultNav() {
  return (
    <nav className="vault-subnav" aria-label="Vault navigation">
      {vaultNav.map(([n, p]) => (
        <Link key={p} to={p} activeProps={{ className: "active" }} activeOptions={{ exact: true }}>
          {n}
        </Link>
      ))}
    </nav>
  );
}
type Holdings = {
  sol: number;
  tokens: { mint: string; amount: string; decimals: number; program: string }[];
  transactions: { signature: string; err: unknown; time: number | null }[];
};
export function WalletData({
  devnet = false,
  activityOnly = false,
}: {
  devnet?: boolean;
  activityOnly?: boolean;
}) {
  const c = useConsole();
  const open = useWalletDialog();
  const [data, setData] = useState<Holdings | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let live = true;
    setData(null);
    setError("");
    if (!c.account) return;
    setBusy(true);
    const con = new Connection(devnet ? "https://api.devnet.solana.com" : c.rpc, {
      commitment: "confirmed",
      disableRetryOnRateLimit: true,
    });
    const address = new PublicKey(c.account.address);
    const load = async () => {
      try {
        const [sol, spl, t22, transactions] = await Promise.all([
          con.getBalance(address),
          con.getParsedTokenAccountsByOwner(address, {
            programId: new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"),
          }),
          con.getParsedTokenAccountsByOwner(address, {
            programId: new PublicKey("TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"),
          }),
          con.getSignaturesForAddress(address, { limit: 15 }),
        ]);
        if (live)
          setData({
            sol: sol / LAMPORTS_PER_SOL,
            tokens: [...spl.value, ...t22.value].map((a) => {
              const info = a.account.data.parsed.info;
              return {
                mint: info.mint,
                amount: info.tokenAmount.uiAmountString,
                decimals: info.tokenAmount.decimals,
                program: a.account.owner.toBase58(),
              };
            }),
            transactions: transactions.map((t) => ({
              signature: t.signature,
              err: t.err,
              time: t.blockTime ?? null,
            })),
          });
      } catch {
        if (live)
          setError(
            "Wallet balances could not be read from RPC. No balance or transaction is fabricated.",
          );
      } finally {
        if (live) setBusy(false);
      }
    };
    load();
    return () => {
      live = false;
    };
  }, [c.account, c.rpc, devnet, retry]);
  const empty = (
    <div className="empty-state">
      <p>
        Connect a Solana wallet to read {devnet ? "Devnet" : "your selected network"} balances and
        confirmed history.
      </p>
      <Button className="mt-4" onClick={open}>
        Connect wallet
      </Button>
    </div>
  );
  return (
    <>
      {!activityOnly && (
        <div className="desk-stats">
          <div>
            <small>SOL BALANCE {devnet ? "· DEVNET" : ""}</small>
            <strong>{data ? data.sol.toFixed(6) : "—"}</strong>
          </div>
          <div>
            <small>TOKEN ACCOUNTS</small>
            <strong>{data?.tokens.length ?? "—"}</strong>
          </div>
          <div>
            <small>WALLET</small>
            <strong>
              {c.account
                ? c.account.address.slice(0, 5) + "…" + c.account.address.slice(-5)
                : "Not connected"}
            </strong>
          </div>
        </div>
      )}
      {busy && (
        <p role="status" className="notice">
          <LoaderCircle className="animate-spin" />
          Reading confirmed RPC data…
        </p>
      )}
      {error && (
        <div role="alert" className="error-message">
          {error}
          <Button variant="outline" className="ml-3" onClick={() => setRetry((n) => n + 1)}>
            <RotateCw />
            Retry
          </Button>
        </div>
      )}
      {!activityOnly && (
        <DeskWindow title="Token Holdings">
          {!c.account ? (
            empty
          ) : data?.tokens.length ? (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Mint</th>
                    <th>Balance</th>
                    <th>Decimals</th>
                    <th>Explorer</th>
                  </tr>
                </thead>
                <tbody>
                  {data.tokens.map((t) => (
                    <tr key={t.mint}>
                      <td>{t.mint}</td>
                      <td>{t.amount}</td>
                      <td>{t.decimals}</td>
                      <td>
                        <a
                          className="desk-link"
                          href={`https://solscan.io/token/${t.mint}${devnet || c.network === "devnet" ? "?cluster=devnet" : ""}`}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          Solscan ↗
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="empty-state">
              {data ? "No SPL or Token-2022 accounts." : "No holdings loaded."}
            </div>
          )}
        </DeskWindow>
      )}
      <DeskWindow title="Confirmed Transactions">
        {!c.account ? (
          empty
        ) : data?.transactions.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Signature</th>
                  <th>Status</th>
                  <th>Time</th>
                </tr>
              </thead>
              <tbody>
                {data.transactions.map((t) => (
                  <tr key={t.signature}>
                    <td>
                      <a
                        className="desk-link"
                        href={`https://solscan.io/tx/${t.signature}${devnet || c.network === "devnet" ? "?cluster=devnet" : ""}`}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {t.signature.slice(0, 12)}… ↗
                      </a>
                    </td>
                    <td>{t.err ? "Failed" : "Confirmed"}</td>
                    <td>{t.time ? new Date(t.time * 1000).toLocaleString() : "Unavailable"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty-state">No transaction history available.</div>
        )}
      </DeskWindow>
    </>
  );
}
export function Portfolio() {
  return (
    <>
      <PageHeading
        eyebrow="WALLET / INVENTORY"
        title="Wallet Inventory"
        description="Read-only SOL, SPL and Token-2022 holdings and confirmed transactions."
      />
      <WalletData />
    </>
  );
}
export function VaultOverview() {
  const c = useConsole();
  const v = useVault();
  return (
    <>
      <VaultNav />
      <PageHeading
        eyebrow="VAULT / DEVNET READINESS"
        title="Vault Desk"
        description="Devnet readiness prototype · not audited · no on-chain program · mainnet custody disabled"
      />
      <div className="desk-stats four">
        <div>
          <small>TOTAL VALUE LOCKED</small>
          <strong>— (no program)</strong>
        </div>
        <div>
          <small>ACTIVE VAULTS</small>
          <strong>0</strong>
        </div>
        <div>
          <small>LOCAL ML-DSA KEY</small>
          <strong>{v.fingerprint ? "Generated" : "Not generated"}</strong>
        </div>
        <div>
          <small>SELECTED RPC</small>
          <strong>{c.rpcHealth}</strong>
        </div>
      </div>
      <DeskWindow title="Readiness Inspector">
        <p>[{c.account ? "OK" : "--"}] Solana wallet connected</p>
        <p>[{v.fingerprint ? "OK" : "--"}] ML-DSA-65 key generated locally</p>
        <p>[--] Key registration — program not deployed</p>
        <p>[--] On-chain verifier tests — not run</p>
        <p>[--] Independent audit — none</p>
        <p>Fingerprint: {v.fingerprint ?? "—"}</p>
        <Link to="/security" className="desk-link">
          4 open blockers · Quantum Security ↗
        </Link>
      </DeskWindow>
      <WalletData devnet />
      <div className="desk-actions">
        <Button asChild variant="outline">
          <Link to="/quantum-wallets">WOTS vault-chain model</Link>
        </Button>
        <Button asChild variant="outline">
          <Link to="/identity">Open Quantum Identity</Link>
        </Button>
      </div>
    </>
  );
}
export function VaultKeys() {
  const v = useVault();
  const [seed, setSeed] = useState("");
  const [backup, setBackup] = useState("");
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  async function generate(restore = false) {
    setBusy(true);
    setError("");
    await new Promise((r) => setTimeout(r, 20));
    try {
      if (restore && !seed) throw new Error("Enter a 64-character hexadecimal backup seed.");
      v.generate(restore ? seed : undefined);
      setSeed("");
      setBackup("");
      setStatus(restore ? "Key restored in tab memory." : "Key generated in tab memory.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Key generation failed.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <VaultNav />
      <PageHeading
        eyebrow="VAULT / KEY MANAGEMENT"
        title="My Vaults & Key"
        description="Local ML-DSA-65 key management. No on-chain vault accounts are created."
      />
      <div className="notice mb-4">
        <ShieldAlert />
        Vault creation and on-chain registration are unavailable: Quantum QLi has no deployed vault
        program.
      </div>
      <DeskWindow title="Vault Registry">
        <div className="empty-state">No vaults — protocol adapter not deployed.</div>
      </DeskWindow>
      <DeskWindow title="Local Key Inspector">
        <div className="detail-rows">
          <div>
            <span>Scheme</span>
            <strong>ML-DSA-65 (FIPS 204)</strong>
          </div>
          <div>
            <span>Public-key fingerprint (SHA-256)</span>
            <strong>{v.fingerprint ?? "—"}</strong>
          </div>
          <div>
            <span>Storage</span>
            <strong>Tab memory only · not persisted</strong>
          </div>
        </div>
        <div className="desk-actions">
          <Button disabled={busy} onClick={() => generate()}>
            {busy ? <LoaderCircle className="animate-spin" /> : <KeyRound />}Generate ML-DSA keypair
          </Button>
          {v.fingerprint && (
            <>
              <Button variant="outline" onClick={() => setBackup(backup ? "" : v.backup())}>
                {backup ? <EyeOff /> : <Eye />}
                {backup ? "Hide backup seed" : "Show backup seed"}
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  v.clear();
                  setBackup("");
                  setStatus("Key cleared from tab memory.");
                }}
              >
                Clear key
              </Button>
            </>
          )}
        </div>
        {backup && (
          <div className="notice my-4">
            <div>
              <strong>PRIVATE BACKUP · WRITE DOWN OFFLINE</strong>
              <pre className="code-block">{backup}</pre>Never share this seed. It is not uploaded or
              saved by Quantum QLi.
            </div>
          </div>
        )}
        <Field
          label="Restore from backup seed"
          hint="Exactly 64 hex characters. Refreshing or closing this tab deletes the key."
        >
          <input
            type="password"
            autoComplete="off"
            maxLength={64}
            value={seed}
            placeholder="64 hex characters"
            onChange={(e) => setSeed(e.target.value)}
            aria-label="Backup seed"
          />
        </Field>
        <Button variant="outline" disabled={busy} className="mt-4" onClick={() => generate(true)}>
          Restore
        </Button>
        {error && (
          <p role="alert" className="error-message">
            {error}
          </p>
        )}
        {status && (
          <p role="status" className="success-text mt-4">
            {status}
          </p>
        )}
        <p className="notice mt-4">
          No recovery service exists. Keep an offline backup. This local key is not authorization
          for a deployed vault.
        </p>
      </DeskWindow>
    </>
  );
}
export function VaultTransfer({ withdraw = false }: { withdraw?: boolean }) {
  const c = useConsole();
  const v = useVault();
  const [amount, setAmount] = useState("");
  const [to, setTo] = useState("");
  const [asset, setAsset] = useState("SOL");
  const [error, setError] = useState("");
  const [result, setResult] = useState("");
  const [busy, setBusy] = useState(false);
  async function prepare() {
    setError("");
    setResult("");
    try {
      if (!Number.isFinite(Number(amount)) || Number(amount) <= 0 || Number(amount) > 1000)
        throw new Error("Enter an amount greater than zero and no more than 1,000.");
      if (withdraw && !isValidMint(to))
        throw new Error("Enter a valid Solana destination address.");
      const commitment = {
        domain: "quantum-qli/vault/authorization/v1",
        cluster: "devnet",
        program: null,
        vault: "not-deployed",
        mint: asset,
        amount,
        destination: to,
        nonce: crypto.randomUUID(),
        expires: Date.now() + 300000,
      };
      if (withdraw) {
        setBusy(true);
        await new Promise((r) => setTimeout(r, 20));
        const r = v.sign(JSON.stringify(commitment));
        setResult(
          `Local ${r.valid ? "valid" : "invalid"} ML-DSA authorization · ${r.signature.length} bytes. Not submitted; no vault program exists.`,
        );
      } else {
        c.setPlan({
          title: `${amount} ${asset} · Deposit Readiness Plan`,
          steps: [
            "Protocol adapter not deployed. No transaction can be constructed.",
            `Requested deposit: ${amount} ${asset} on Devnet.`,
            "Live deposit requires a reviewed program, verified account ownership and wallet simulation.",
          ],
          accounts: [c.account?.address ?? "Wallet not connected", "Vault: not deployed"],
          fee: "Unavailable — no transaction built",
          signatures: 0,
        });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Validation failed.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <VaultNav />
      <PageHeading
        eyebrow={`VAULT / ${withdraw ? "WITHDRAWAL AUTHORIZATION" : "DEPOSIT READINESS"}`}
        title={withdraw ? "Withdraw" : "Deposit"}
        description="SOL and SPL tokens · Devnet readiness only"
      />
      <DeskWindow title={withdraw ? "Withdrawal Authorization" : "Deposit Readiness"}>
        <div className="notice mb-4">
          {withdraw ? "Withdrawal submission" : "Deposit"} unavailable: no Quantum QLi vault program
          is deployed. No funds can move.
        </div>
        <div className="form-grid">
          <Field label="Asset">
            <select
              value={asset}
              onChange={(e) => {
                setAsset(e.target.value);
                setResult("");
              }}
            >
              <option>SOL</option>
              <option>USDC</option>
              <option>Token-2022 (custom mint required for live use)</option>
            </select>
          </Field>
          <Field label="Amount">
            <input
              aria-label="Vault amount"
              type="number"
              min="0"
              step="any"
              value={amount}
              onChange={(e) => {
                setAmount(e.target.value);
                setResult("");
              }}
              placeholder="Amount"
            />
          </Field>
          {withdraw && (
            <Field label="Destination address">
              <input
                aria-label="Destination address"
                value={to}
                onChange={(e) => {
                  setTo(e.target.value);
                  setResult("");
                }}
              />
            </Field>
          )}
        </div>
        <p className="micro my-4">AVAILABLE: — · NO DEPLOYED VAULT</p>
        <div className="desk-actions">
          <Button disabled={busy} onClick={prepare}>
            {busy ? <LoaderCircle className="animate-spin" /> : null}
            {withdraw ? "Sign & verify locally" : "Review deposit readiness"}
          </Button>
          <Button disabled variant="outline">
            {withdraw ? "Submit withdrawal" : "Deposit"} — awaiting vault program
          </Button>
        </div>
        {error && (
          <p role="alert" className="error-message">
            {error}
          </p>
        )}
        {result && (
          <p role="status" className="notice mt-4">
            {result}
          </p>
        )}
      </DeskWindow>
    </>
  );
}
export function SecurityPage() {
  return (
    <>
      <VaultNav />
      <PageHeading
        eyebrow="SECURITY / INSPECTOR"
        title="Quantum Security"
        description="No quantum-safe badge without independently verifiable security requirements."
      />
      <DeskWindow title="Signature Schemes">
        <p>
          Ordinary Solana transactions use Ed25519. Hash-based attestations and local ML-DSA proofs
          do not change ordinary wallet custody.
        </p>
        <p>
          Local ML-DSA-65: public key 1,952 bytes; signature 3,309 bytes. The WOTS identity: 67
          chains, 8 Merkle levels, 2,404-byte proof.
        </p>
        <p>
          Authorization binds domain, cluster, program, vault, mint, amount, destination, nonce and
          expiry. Local verification is not a server replay ledger or on-chain authorization.
        </p>
      </DeskWindow>
      <DeskWindow title="Security Status">
        <p>[AVAILABLE] Browser ML-DSA/SLH-DSA/ML-KEM tests and public verification APIs</p>
        <p>
          [AVAILABLE] WOTS reference proofs, one-time leaf ledger and reviewed-wallet safeguards
        </p>
        <p>[--] On-chain vault verifier — not deployed</p>
        <p>[--] Compute-unit benchmark — not run</p>
        <p>[--] Independent audit — none</p>
      </DeskWindow>
      <DeskWindow title="Deployment Requirements">
        <ol className="security-list">
          <li>
            A dedicated Quantum QLi on-chain verifier/vault must be built, audited and deployed.
          </li>
          <li>
            Large signatures exceed a 1,232-byte packet; staging and verification cost must be
            benchmarked.
          </li>
          <li>Cryptographic, contract and application security need independent review.</li>
          <li>
            Key recovery and cross-device replay/leaf-ledger handling need a reviewed production
            design.
          </li>
        </ol>
      </DeskWindow>
      <div className="notice">
        Post-quantum authorization does not protect Solana consensus, normal wallet accounts, RPC
        infrastructure or unrelated contracts.
      </div>
    </>
  );
}
