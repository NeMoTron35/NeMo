import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  AUTHORIZATION_LABEL,
  STATUS_LABEL,
  createAuthorization,
  randomNonce,
  requiresAuthorization,
  verifyAuthorization,
} from "@/lib/qli-core/authorization";
import { Connection } from "@solana/web3.js";
import { Button } from "@/components/ui/button";
import { Panel } from "./controls";
import { useConsole } from "@/lib/qli-core/context";
import { useWalletDialog } from "@/components/qli/wallet-dialog-context";
import { explainTransactionError } from "@/lib/qli-core/dbc";
import { explorerTx } from "@/lib/qli-core/dbc-launch";
import { signReviewedTransaction } from "@/lib/qli-core/wallet";
import {
  BUYBACK_HARD_MAX_SOL,
  DEFAULT_BUYBACK_CAP_SOL,
  buildFlywheelStep,
  expectedAuthorizationFields,
  flywheelFingerprint,
  fromBaseUnits,
  loadFlywheelPool,
  readFlywheelBalances,
  sendReviewedOnce,
  type BuiltStep,
  type FlywheelPool,
  type FlywheelStep,
  type StepInput,
} from "@/lib/qli-core/flywheel-live";
import { validateHandoff } from "@/lib/qli-core/qli-agent";

type Status =
  "idle" | "building" | "review" | "awaiting-wallet" | "submitted" | "confirmed" | "failed";
type LedgerRow = {
  step: FlywheelStep;
  sig: string;
  tier: "verified" | "submitted" | "failed";
  note: string;
};
const STEP_LABEL: Record<FlywheelStep, string> = {
  claim: "1 · Claim fees",
  buyback: "2 · Buy back",
  burn: "3 · Burn",
};

export function FlywheelLive({ suggestedBuybackPct }: { suggestedBuybackPct: number }) {
  const c = useConsole();
  const openWallet = useWalletDialog();
  const wallet = c.account?.address ?? null;
  const [poolAddr, setPoolAddr] = useState("");
  const [pool, setPool] = useState<FlywheelPool | null>(null);
  const [bal, setBal] = useState<{
    solLamports: bigint;
    tokenBalance: bigint;
    supply: bigint;
  } | null>(null);
  const [step, setStep] = useState<FlywheelStep>("claim");
  const [amountSol, setAmountSol] = useState("0.05");
  const [capSol, setCapSol] = useState(DEFAULT_BUYBACK_CAP_SOL);
  const [slippage, setSlippage] = useState(100);
  const [burnAmt, setBurnAmt] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [built, setBuilt] = useState<BuiltStep | null>(null);
  const [builtFp, setBuiltFp] = useState<string | null>(null);
  const [ack, setAck] = useState(false);
  const [mainAck, setMainAck] = useState(false);
  const [msg, setMsg] = useState("");
  const [ledger, setLedger] = useState<LedgerRow[]>([]);
  const inFlight = useRef(false);

  const input: StepInput =
    step === "claim"
      ? { step }
      : step === "buyback"
        ? { step, amountSol, capSol, slippageBps: slippage }
        : { step, amount: burnAmt, balance: bal?.tokenBalance ?? 0n };
  const [authId, setAuthId] = useState<string | null>(null);
  const [authBusy, setAuthBusy] = useState(false);
  const [now, setNow] = useState(0);
  // Policy and identity are part of the review fingerprint: changing either discards the build.
  const fp =
    flywheelFingerprint({
      network: c.network,
      rpc: c.rpc,
      account: wallet,
      pool: pool?.pool ?? "",
      input,
    }) +
    `|policy:${c.authzPolicyReady ? JSON.stringify(c.authzPolicy) : "loading"}|id:${c.identity?.root ?? ""}`;
  const authRec = authId ? (c.authorizations.find((r) => r.id === authId) ?? null) : null;
  const authRequired = built
    ? !c.authzPolicyReady ||
      requiresAuthorization(c.authzPolicy, built.step, BigInt(built.scope.maxSpendLamports || "0"))
    : false;
  function authProblem(nowSec: number) {
    if (!built || !pool || !wallet || !c.identity)
      return "Open a reference Quantum Identity first.";
    let expected;
    try {
      expected = expectedAuthorizationFields({
        built,
        pool,
        wallet,
        network: c.network,
        identity: c.identity,
      });
    } catch (e) {
      return (e as Error).message;
    }
    return verifyAuthorization(authRec, expected, c.identity, nowSec, c.usedNonces);
  }
  useEffect(() => {
    if (!authRequired) return;
    setNow(Math.floor(Date.now() / 1000));
    const t = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(t);
  }, [authRequired]);
  const authIssue = authRequired && now ? authProblem(now) : authRequired ? "Checking…" : null;
  function dropAuth(reason: string) {
    if (authId) c.markAuthorization(authId, { status: "invalidated", reason });
    setAuthId(null);
  }
  const fpRef = useRef(fp);
  fpRef.current = fp;

  // Any change to network, RPC, wallet, pool, step or amounts discards the reviewed transaction.
  useEffect(() => {
    if (builtFp === null || builtFp === fp) return;
    setBuilt(null);
    setBuiltFp(null);
    setAck(false);
    dropAuth(
      "Operation, wallet, network, RPC, identity, policy or amounts changed before signing.",
    );
    setStatus((s) => (s === "submitted" || s === "awaiting-wallet" ? s : "idle"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fp, builtFp]);
  // Pool ownership is per wallet/network; re-verify after either changes.
  useEffect(() => {
    setPool(null);
    setBal(null);
    setMainAck(false);
  }, [wallet, c.network, c.rpc]);

  // QLi Agent handoff: untrusted suggestion. Only prefills inputs after strict validation;
  // the pool is re-read and the transaction rebuilt, reviewed and wallet-approved as usual.
  const [handoffNote, setHandoffNote] = useState("");
  useEffect(() => {
    if (c.agentHandoff == null) return;
    const r = validateHandoff(c.agentHandoff, {
      wallet,
      network: c.network,
      now: Math.floor(Date.now() / 1000),
    });
    c.setAgentHandoff(null);
    if (!r.ok) {
      setHandoffNote(`QLi Agent proposal refused: ${r.error}`);
      return;
    }
    const p = r.proposal;
    setPool(null);
    setPoolAddr(p.pool);
    setStep(p.step);
    if (p.step === "buyback") {
      setAmountSol(p.amount);
      setSlippage(p.slippageBps);
    }
    if (p.step === "burn") setBurnAmt(p.amount);
    setHandoffNote(
      `Prefilled from QLi Agent proposal (${p.step}). Verify pool ownership, build and review — nothing is signed until you approve in your wallet.`,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [c.agentHandoff, wallet, c.network]);

  async function verify() {
    if (inFlight.current || !wallet) return;
    inFlight.current = true;
    setMsg("");
    try {
      const p = await loadFlywheelPool(c.rpc, poolAddr.trim(), wallet);
      setPool(p);
      setBal(await readFlywheelBalances(c.rpc, p, wallet));
    } catch (e) {
      setPool(null);
      setMsg(explainTransactionError(e));
    } finally {
      inFlight.current = false;
    }
  }

  async function build() {
    if (inFlight.current || !wallet || !pool) return;
    inFlight.current = true;
    const startFp = fp;
    setMsg("");
    setAck(false);
    setBuilt(null);
    setBuiltFp(null);
    dropAuth("Transaction rebuilt (new blockhash/quote/bytes).");
    setStatus("building");
    try {
      const b = await buildFlywheelStep(c.rpc, pool, wallet, input);
      if (fpRef.current !== startFp) throw new Error("Inputs changed while building. Build again.");
      setBuilt(b);
      setBuiltFp(startFp);
      setStatus("review");
    } catch (e) {
      setMsg(explainTransactionError(e));
      setStatus("failed");
    } finally {
      inFlight.current = false;
    }
  }

  async function authorize() {
    if (authBusy || !built || !pool || !wallet || !c.identity || status !== "review") return;
    const startFp = fpRef.current;
    setAuthBusy(true);
    setMsg("");
    try {
      const issued = Math.floor(Date.now() / 1000);
      const intent = {
        ...expectedAuthorizationFields({
          built,
          pool,
          wallet,
          network: c.network,
          identity: c.identity,
        }),
        issuedAt: String(issued),
        expiresAt: String(issued + c.authzPolicy.expirySeconds),
        nonce: randomNonce(),
      };
      const rec = await createAuthorization({
        intent,
        identity: c.identity,
        tree: c.getTree(),
        nextLeaf: c.nextLeaf,
        reserveLeaf: c.reserveLeaf,
      });
      c.upsertAuthorization(rec);
      if (fpRef.current !== startFp) {
        c.markAuthorization(rec.id, {
          status: "invalidated",
          reason: "Inputs changed while signing.",
        });
        return;
      }
      setAuthId(rec.id);
      const problem = verifyAuthorization(
        rec,
        expectedAuthorizationFields({
          built,
          pool,
          wallet,
          network: c.network,
          identity: c.identity,
        }),
        c.identity,
        Math.floor(Date.now() / 1000),
        c.usedNonces,
      );
      c.markAuthorization(
        rec.id,
        problem ? { status: "rejected", reason: problem } : { status: "verified-locally" },
      );
      c.log(
        `Quantum authorization ${problem ? "rejected" : "verified locally"} · ${built.step}`,
        "Authorization",
        pool.baseMint.slice(0, 6),
        `Application-level only · leaf #${rec.proof.leaf} · digest ${rec.digest.slice(0, 16)}…`,
      );
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setAuthBusy(false);
    }
  }

  async function signAndSend() {
    if (inFlight.current || !built || !c.wallet || !c.account || !pool || status !== "review")
      return;
    if (builtFp !== fpRef.current || !ack || (c.network === "mainnet-beta" && !mainAck)) {
      setBuilt(null);
      setBuiltFp(null);
      setStatus("idle");
      setMsg("Inputs changed after review. Build and review again.");
      return;
    }
    // Policy guard: re-verified immediately before the wallet is asked to sign. Fails closed.
    const usedAuth = authRequired ? authId : null;
    if (authRequired) {
      const problem = authProblem(Math.floor(Date.now() / 1000));
      if (problem) {
        if (authId)
          c.markAuthorization(authId, {
            status: problem.includes("expired") ? "expired" : "rejected",
            reason: problem,
          });
        setMsg(`Quantum authorization required: ${problem}`);
        return;
      }
      c.consumeNonce(authRec!.intent.nonce);
    }
    const reviewFp = builtFp;
    inFlight.current = true;
    setStatus("awaiting-wallet");
    const conn = new Connection(c.rpc, "confirmed");
    let sig = "";
    try {
      const signed = await signReviewedTransaction({
        wallet: c.wallet,
        account: c.account,
        connection: conn,
        transaction: built.transaction,
        lastValidBlockHeight: built.lastValidBlockHeight,
        network: c.network,
        reviewedMessage: built.reviewedMessage,
      });
      if (reviewFp !== fpRef.current) {
        setBuilt(null);
        setBuiltFp(null);
        setStatus("idle");
        setMsg(
          "Inputs changed while your wallet was open. The signed transaction was discarded and not sent.",
        );
        if (usedAuth)
          c.markAuthorization(usedAuth, {
            status: "invalidated",
            reason: "Inputs changed while wallet was open.",
          });
        setAuthId(null);
        return;
      }
      setBuilt(null);
      setBuiltFp(null);
      setAck(false);
      await sendReviewedOnce(conn, signed, built, (s) => {
        sig = s;
        setStatus("submitted");
        setLedger((l) => [
          { step: built.step, sig: s, tier: "submitted", note: "Awaiting confirmation" },
          ...l,
        ]);
      });
      const before = bal;
      const fresh = await loadFlywheelPool(c.rpc, pool.pool, c.account.address);
      const after = await readFlywheelBalances(c.rpc, fresh, c.account.address);
      setPool(fresh);
      setBal(after);
      const note =
        built.step === "burn" && before
          ? `Supply re-read: ${fromBaseUnits(before.supply - after.supply, fresh.baseDecimals)} tokens fewer`
          : built.step === "buyback" && before
            ? `Token balance re-read: +${fromBaseUnits(after.tokenBalance - before.tokenBalance, fresh.baseDecimals)}`
            : `Claimable creator fees re-read: ${fromBaseUnits(fresh.creatorQuoteFee, 9)} SOL`;
      setLedger((l) => l.map((r) => (r.sig === sig ? { ...r, tier: "verified", note } : r)));
      if (usedAuth)
        c.markAuthorization(usedAuth, {
          status: "executed-on-chain",
          signature: sig,
          reason: `Confirmed on ${c.network}; ${note}`,
        });
      setAuthId(null);
      setStatus("confirmed");
      c.log(
        `Flywheel ${built.step} confirmed on ${c.network} · ${sig.slice(0, 8)}…`,
        "Flywheel",
        pool.baseMint.slice(0, 6),
        `On-chain · Solana ${c.network} · signature ${sig} · ${note}`,
      );
    } catch (e) {
      const m = explainTransactionError(e);
      setMsg(m);
      setStatus("failed");
      if (usedAuth)
        c.markAuthorization(usedAuth, {
          status: "rejected",
          reason: sig ? `Sent but not confirmed: ${m}` : `Not sent: ${m}`,
          signature: null,
        });
      setAuthId(null);
      if (sig)
        setLedger((l) => l.map((r) => (r.sig === sig ? { ...r, tier: "failed", note: m } : r)));
    } finally {
      inFlight.current = false;
    }
  }

  const busy = status === "building" || status === "awaiting-wallet" || status === "submitted";
  const suggested = pool ? (Number(pool.creatorQuoteFee) / 1e9) * (suggestedBuybackPct / 100) : 0;

  return (
    <Panel title="Live cycle · Solana" tag={c.network.toUpperCase()} className="flywheel-live">
      {handoffNote && (
        <div className="notice" role="status">
          {handoffNote}
        </div>
      )}
      <p className="micro">
        Real transactions. Each step is built, simulated and shown to you; nothing is sent until you
        approve it in your wallet. No schedule, no automation, no server signer.
      </p>
      {c.network === "mainnet-beta" && (
        <p role="alert" className="flywheel-error">
          Mainnet spends real SOL and burns are permanent. If the public RPC refuses requests
          (403/429), set your own RPC in System.
        </p>
      )}
      {!wallet ? (
        <Button onClick={openWallet}>Connect Phantom</Button>
      ) : (
        <div className="flywheel-inputs">
          <label className="wide">
            Your DBC pool address
            <input
              value={poolAddr}
              onChange={(e) => setPoolAddr(e.target.value.trim())}
              placeholder="Pool you created in Launch Forge"
            />
          </label>
          <Button type="button" size="sm" disabled={!poolAddr || busy} onClick={verify}>
            Verify pool ownership
          </Button>
        </div>
      )}
      {pool && bal && (
        <>
          <table className="flywheel-table" aria-label="On-chain pool state">
            <tbody>
              <tr>
                <th>Creator (you)</th>
                <td>
                  {pool.creator.slice(0, 6)}…{pool.creator.slice(-4)}
                </td>
              </tr>
              <tr>
                <th>Token mint</th>
                <td>
                  {pool.baseMint.slice(0, 6)}…{pool.baseMint.slice(-4)}
                </td>
              </tr>
              <tr>
                <th>Curve</th>
                <td>{pool.isMigrated ? "Migrated (buyback blocked)" : "Bonding curve active"}</td>
              </tr>
              <tr>
                <th>Claimable creator fees</th>
                <td>{fromBaseUnits(pool.creatorQuoteFee, 9)} SOL</td>
              </tr>
              <tr>
                <th>Your token balance</th>
                <td>{fromBaseUnits(bal.tokenBalance, pool.baseDecimals)}</td>
              </tr>
              <tr>
                <th>Total supply</th>
                <td>{fromBaseUnits(bal.supply, pool.baseDecimals)}</td>
              </tr>
            </tbody>
          </table>
          <div className="segmented" role="tablist" aria-label="Flywheel step">
            {(["claim", "buyback", "burn"] as const).map((s) => (
              <Button
                key={s}
                type="button"
                size="sm"
                variant={step === s ? "default" : "outline"}
                role="tab"
                aria-selected={step === s}
                disabled={busy}
                onClick={() => setStep(s)}
              >
                {STEP_LABEL[s]}
              </Button>
            ))}
          </div>
          {step === "buyback" && (
            <div className="flywheel-inputs">
              <label>
                Spend (SOL)
                <input
                  inputMode="decimal"
                  value={amountSol}
                  onChange={(e) => setAmountSol(e.target.value)}
                />
              </label>
              <label>
                Per-transaction cap (SOL)
                <input
                  type="number"
                  min={0}
                  max={BUYBACK_HARD_MAX_SOL}
                  step={0.1}
                  value={capSol}
                  onChange={(e) =>
                    setCapSol(
                      Math.min(BUYBACK_HARD_MAX_SOL, Math.max(0, Number(e.target.value) || 0)),
                    )
                  }
                />
              </label>
              <label>
                Slippage (bps)
                <input
                  type="number"
                  min={1}
                  max={1000}
                  value={slippage}
                  onChange={(e) => setSlippage(Math.round(Number(e.target.value) || 0))}
                />
              </label>
              {suggested > 0 && (
                <p className="micro wide">
                  Your allocation suggests {suggestedBuybackPct}% of claimable fees ≈{" "}
                  {suggested.toFixed(4)} SOL. This is a suggestion only, not on-chain routing.
                </p>
              )}
            </div>
          )}
          {step === "burn" && (
            <div className="flywheel-inputs">
              <label>
                Tokens to burn
                <input
                  inputMode="decimal"
                  value={burnAmt}
                  onChange={(e) => setBurnAmt(e.target.value)}
                  placeholder={`Max ${fromBaseUnits(bal.tokenBalance, pool.baseDecimals)}`}
                />
              </label>
            </div>
          )}
          <Button
            type="button"
            className="mt-2"
            disabled={busy || status === "review"}
            onClick={build}
          >
            {status === "building" ? "Building…" : "Build & simulate"}
          </Button>
        </>
      )}
      {built && status === "review" && (
        <div className="flywheel-doc" aria-label="Transaction review">
          <ul>
            {built.summary.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
          <dl>
            <dt>Programs</dt>
            <dd>{built.programs.join(", ")}</dd>
            <dt>Signer</dt>
            <dd>{wallet} (only)</dd>
            <dt>Network fee</dt>
            <dd>{built.feeLamports ?? "unknown"} lamports</dd>
            <dt>Simulation</dt>
            <dd>Passed · {built.simulatedUnits ?? "?"} compute units</dd>
          </dl>
          <label style={{ display: "flex", gap: 8 }}>
            <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} />I
            reviewed this transaction.
          </label>
          {c.network === "mainnet-beta" && (
            <label style={{ display: "flex", gap: 8 }}>
              <input
                type="checkbox"
                checked={mainAck}
                onChange={(e) => setMainAck(e.target.checked)}
              />
              I understand this is Solana MAINNET, uses real funds and cannot be undone.
            </label>
          )}
          {authRequired && (
            <div className="authz-gate" aria-label="Quantum authorization gate">
              <p className="authz-label" role="note">
                {AUTHORIZATION_LABEL}
              </p>
              <p className="micro">
                Your policy requires a Quantum Identity proof over this exact transaction before
                wallet approval. Your wallet still approves the actual bytes.
              </p>
              {!c.identity || c.identity.label !== "reference" ? (
                <p className="flywheel-error">
                  Open a reference (non-demo) identity in{" "}
                  <Link to="/identity">Quantum Identity</Link> to authorize.
                </p>
              ) : (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={authBusy || (!!authRec && !authIssue)}
                  onClick={authorize}
                >
                  {authBusy
                    ? "Signing intent…"
                    : `Sign authorization intent · consumes leaf #${c.nextLeaf()}`}
                </Button>
              )}
              <p className={authIssue ? "flywheel-error" : "authz-ok"} role="status">
                {authIssue
                  ? authIssue
                  : `${STATUS_LABEL["verified-locally"]} · leaf #${authRec?.proof.leaf} · expires in ${Number(authRec?.intent.expiresAt) - now}s`}
              </p>
            </div>
          )}
          <Button
            disabled={
              !ack || (c.network === "mainnet-beta" && !mainAck) || (authRequired && !!authIssue)
            }
            onClick={signAndSend}
          >
            Approve in wallet &amp; send once
          </Button>
        </div>
      )}
      {status === "awaiting-wallet" && <p>Waiting for your wallet approval…</p>}
      {status === "submitted" && <p>Sent. Waiting for confirmation…</p>}
      {msg && (
        <p className="flywheel-error" role="alert">
          {msg}
        </p>
      )}
      {ledger.length > 0 && (
        <table className="flywheel-table" aria-label="Flywheel ledger">
          <tbody>
            {ledger.map((r) => (
              <tr key={r.sig}>
                <th>
                  {STEP_LABEL[r.step]} ·{" "}
                  {r.tier === "verified"
                    ? "Verified on-chain"
                    : r.tier === "submitted"
                      ? "Submitted"
                      : "Failed"}
                  <br />
                  <span className="micro">{r.note}</span>
                </th>
                <td>
                  <a href={explorerTx(r.sig, c.network)} target="_blank" rel="noreferrer">
                    {r.sig.slice(0, 8)}…
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Panel>
  );
}