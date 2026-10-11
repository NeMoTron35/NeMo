import { useEffect, useRef, useState } from "react";
import { Connection, PublicKey } from "@solana/web3.js";
import { Button } from "@/components/ui/button";
import { useConsole } from "@/lib/qli-core/context";
import { useWalletDialog } from "@/components/qli/wallet-dialog-context";
import type { LaunchDraft } from "@/lib/qli-core/validation";
import {
  canSignReviewed,
  launchFingerprint,
  verifyLaunchAttestation,
} from "@/lib/qli-core/launch-attestation";
import { launchDigest } from "@/lib/qli-core/launch-draft";
import { DBC_PROGRAM_ID, explainTransactionError } from "@/lib/qli-core/dbc";
import { signReviewedTransaction } from "@/lib/qli-core/wallet";
import {
  MAINNET_MAX_COST_LAMPORTS,
  recheckLaunch,
  verifyLaunchedAuthority,
  type LaunchedAuthority,
  buildLaunch,
  explorerAccount,
  explorerTx,
  submitAndConfirm,
  validateLaunchForm,
  verifyMetadata,
  type BuiltLaunch,
  type LaunchStatus,
} from "@/lib/qli-core/dbc-launch";
import { SUPPORTED_PATCH, draftToForm } from "@/lib/qli-core/launch-mapping";
import { Link } from "@tanstack/react-router";
import { saveIntent } from "@/lib/qli-core/launch-proof";
import { sha256HexOf } from "@/lib/qli-core/neural/canonical";

export function OnChainLaunch({
  d,
  onApply,
}: {
  d: LaunchDraft;
  onApply: (p: Partial<LaunchDraft>) => void;
}) {
  const c = useConsole();
  const openWallet = useWalletDialog();
  const [status, setStatus] = useState<LaunchStatus>("idle");
  const [built, setBuilt] = useState<BuiltLaunch | null>(null);
  const [sig, setSig] = useState("");
  const [msg, setMsg] = useState("");
  const [attest, setAttest] = useState("");
  const [ack, setAck] = useState(false);
  const [mainAck, setMainAck] = useState(false);
  const [auth, setAuth] = useState<LaunchedAuthority | null>(null);
  const [authMsg, setAuthMsg] = useState("");
  const signedRef = useRef<Uint8Array | null>(null);
  const sentRef = useRef<{ built: BuiltLaunch; net: string; rpc: string } | null>(null);
  const inFlight = useRef(false);
  const { form, unsupported } = draftToForm(d);
  const problems = [...unsupported, ...validateLaunchForm(form, c.network)];
  const net = c.network;
  const fingerprint = launchFingerprint({
    form,
    mode: d.mode,
    canonical: launchDigest(d).canonical,
    network: net,
    rpc: c.rpc,
    account: c.account?.address ?? null,
    wallet: c.wallet?.name ?? null,
    identityRoot: c.identity?.root ?? null,
  });
  const fpRef = useRef(fingerprint);
  fpRef.current = fingerprint;
  const [builtFp, setBuiltFp] = useState<string | null>(null);
  const [landed, setLanded] = useState<{ pool: string; net: typeof net } | null>(null);
  // Any change to the inputs a built transaction depends on discards the review.
  // Sent signatures are kept so a pending or confirmed launch can still be tracked.
  useEffect(() => {
    if (builtFp === null || builtFp === fingerprint) return;
    setBuilt(null);
    setBuiltFp(null);
    setAck(false);
    setMainAck(false);
    setAttest("");
    setStatus((st) =>
      st === "submitted" || st === "confirmed" || st === "awaiting-wallet" ? st : "idle",
    );
  }, [fingerprint, builtFp]);

  async function build() {
    if (inFlight.current || !c.account) return;
    inFlight.current = true;
    const startFp = fingerprint;
    setMsg("");
    setAck(false);
    setMainAck(false);
    signedRef.current = null;
    sentRef.current = null;
    setAttest("");
    setBuilt(null);
    setBuiltFp(null);
    setSig("");
    setAuth(null);
    setAuthMsg("");
    setLanded(null);
    setStatus("building");
    try {
      const meta = await verifyMetadata(form.uri, form);
      let note = "";
      if (d.mode === "quantum") {
        const r = verifyLaunchAttestation(meta, d, c.identity);
        if (!r.ok) throw new Error(`Quantum Launch blocked: ${r.reason}`);
        note = `Attestation Seal verified (reference WOTS/Merkle, leaf #${r.leaf}) over: ${r.covers}. Curve, fees and liquidity are not covered.${r.immutable ? "" : " Metadata host is mutable — not immutable."}`;
      }
      const conn = new Connection(c.rpc, "confirmed");
      const b = await buildLaunch(conn, net, new PublicKey(c.account.address), form);
      if (fpRef.current !== startFp)
        throw new Error("Launch settings changed while building. Build again.");
      setAttest(note);
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

  async function signAndSend() {
    if (inFlight.current || !built || !c.wallet || !c.account || status !== "review") return;
    if (!canSignReviewed(builtFp, fpRef.current) || !ack || (net === "mainnet-beta" && !mainAck)) {
      setBuilt(null);
      setBuiltFp(null);
      setAck(false);
      setStatus("idle");
      setMsg("Launch settings changed after review. Build and review again.");
      return;
    }
    const reviewFp = builtFp;
    inFlight.current = true;
    setMsg("");
    setStatus("awaiting-wallet");
    const conn = new Connection(c.rpc, "confirmed");
    try {
      const signed = await signReviewedTransaction({
        wallet: c.wallet,
        account: c.account,
        connection: conn,
        transaction: built.transaction,
        lastValidBlockHeight: built.lastValidBlockHeight,
        network: net,
        reviewedMessage: built.reviewedMessage,
      });
      // Settings may change while the wallet popup is open; never broadcast a stale review.
      if (!canSignReviewed(reviewFp, fpRef.current)) {
        setBuilt(null);
        setBuiltFp(null);
        setAck(false);
        setStatus("idle");
        setMsg(
          "Settings changed while your wallet was open. The signed transaction was discarded and not sent. Build and review again.",
        );
        return;
      }
      signedRef.current = signed;
      sentRef.current = { built, net, rpc: c.rpc };
      const s = await submitAndConfirm(conn, signed, built, (x) => {
        setSig(x);
        setLanded({ pool: built.pool, net });
        setStatus("submitted");
      });
      setStatus("confirmed");
      {
        try {
          saveIntent(window.sessionStorage, {
            signature: s,
            network: net,
            intentHash: await sha256HexOf(launchDigest(d).canonical),
            symbol: form.symbol.slice(0, 16),
            savedAt: Math.floor(Date.now() / 1000),
          });
        } catch {
          /* local review record is optional */
        }
      }
      c.log(
        `${form.symbol} DBC pool confirmed on ${net} · ${s.slice(0, 8)}…`,
        "Launch",
        form.symbol,
        `On-chain · Solana ${net} · signature ${s} · pool ${built.pool} · owner verified (DBC program)`,
      );
      try {
        setAuth(await verifyLaunchedAuthority(conn, built, new PublicKey(c.account.address)));
      } catch (e) {
        setAuthMsg(explainTransactionError(e));
      }
    } catch (e) {
      const m = explainTransactionError(e);
      setMsg(m);
      setStatus(/expired/i.test(m) ? "expired" : "failed");
    } finally {
      inFlight.current = false;
    }
  }

  async function recheck() {
    const sent = sentRef.current;
    if (inFlight.current || !sig || !sent) return;
    inFlight.current = true;
    try {
      const r = await recheckLaunch(
        new Connection(sent.rpc, "confirmed"),
        sig,
        signedRef.current,
        sent.built,
      );
      if (r === "confirmed") setMsg("");
      else
        setMsg(
          r === "pending"
            ? "Still pending. The identical signed transaction was rebroadcast (same signature, cannot launch twice)."
            : r === "expired"
              ? "Blockhash expired without confirmation; this transaction can no longer land. Build again."
              : "The transaction failed on chain or the pool was not created by the DBC program.",
        );
      setStatus(r === "pending" ? "submitted" : r);
    } catch (e) {
      setMsg(explainTransactionError(e));
    } finally {
      inFlight.current = false;
    }
  }

  return (
    <section className="notice mt-4" aria-label="On-chain launch" style={{ display: "block" }}>
      <strong>On-chain launch · Solana {net}</strong>
      <p>
        Creates a real Meteora DBC config and pool in one transaction via the SDK&apos;s
        createConfigAndPool. Your wallet is payer, fee claimer, leftover receiver and creator. Token
        authority is immutable; quote is SOL; migration targets DAMM v2; no first buy.
      </p>
      {net === "mainnet-beta" && (
        <p role="alert">
          Mainnet uses real SOL and is irreversible. Try a devnet launch first. The public mainnet
          RPC is heavily rate-limited; if building or sending fails with HTTP 403/429, set your own
          RPC in System.
        </p>
      )}
      {problems.length > 0 && (
        <ul role="alert">
          {problems.map((p) => (
            <li key={p}>{p}</li>
          ))}
          {unsupported.length > 0 && (
            <li>
              <Button variant="outline" onClick={() => onApply(SUPPORTED_PATCH)}>
                Apply supported settings (SOL quote, SPL, 100% creator-locked liquidity)
              </Button>
            </li>
          )}
        </ul>
      )}
      {!c.account ? (
        <Button onClick={openWallet}>Connect Phantom</Button>
      ) : (
        <Button
          disabled={
            problems.length > 0 ||
            status === "building" ||
            status === "awaiting-wallet" ||
            status === "submitted" ||
            status === "confirmed"
          }
          onClick={build}
        >
          {status === "building"
            ? "Building…"
            : built
              ? "Rebuild transaction"
              : "Build transaction"}
        </Button>
      )}
      {built && (
        <dl className="mt-2" aria-label="Transaction review">
          <dt>Program</dt>
          <dd>{DBC_PROGRAM_ID}</dd>
          <dt>Programs invoked</dt>
          <dd>{built.programIds.join(", ")}</dd>
          <dt>Config (new)</dt>
          <dd>{built.config}</dd>
          <dt>Token mint (new)</dt>
          <dd>{built.baseMint}</dd>
          <dt>Pool (derived)</dt>
          <dd>{built.pool}</dd>
          <dt>Signers</dt>
          <dd>
            {built.requiredSigners.join(", ")} — config and mint keys are one-time and already
            signed in this tab
          </dd>
          <dt>Estimated cost</dt>
          <dd>
            ≈{((built.feeLamports + built.rentLamports) / 1e9).toFixed(4)} SOL (network fee{" "}
            {built.feeLamports} lamports + rough rent estimate — actual cost may differ; your wallet
            shows the final amount) · balance {(built.balanceLamports / 1e9).toFixed(4)} SOL
          </dd>
          <dt>Authorities</dt>
          <dd>
            Payer, fee claimer, leftover receiver and pool creator: {c.account?.address}. Config
            token authority option: Immutable (no mint authority). After confirmation the config,
            pool and Metaplex metadata accounts are re-read from chain and the metadata update
            authority and mutability are shown. Meteora protocol fees still apply. This console sets
            no partner or third-party fee receiver.
          </dd>
          <dt>Metadata URL</dt>
          <dd>{form.uri}</dd>
          <dt>Simulation</dt>
          <dd>Passed before wallet prompt · {built.simulatedUnits} compute units</dd>
          <dt>Simulated spend</dt>
          <dd>
            {built.simulatedSpendLamports === null
              ? "RPC did not report balances; using the rough estimate above"
              : `≈${(built.simulatedSpendLamports / 1e9).toFixed(4)} SOL from your wallet in simulation`}{" "}
            — a preflight check, not a guaranteed maximum.
          </dd>
        </dl>
      )}
      {attest && <p>{attest}</p>}
      {status === "review" && (
        <>
          <label className="mt-2" style={{ display: "flex", gap: 8 }}>
            <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} />I
            reviewed these accounts and costs and want to create this pool on {net}.
          </label>
          {net === "mainnet-beta" && (
            <label className="mt-2" style={{ display: "flex", gap: 8 }}>
              <input
                type="checkbox"
                checked={mainAck}
                onChange={(e) => setMainAck(e.target.checked)}
              />
              I understand this is Solana MAINNET: it spends real SOL (builds whose preflight spend
              exceeds {MAINNET_MAX_COST_LAMPORTS / 1e9} SOL are refused, but this is not an on-chain
              cap; my wallet shows the final amount), creates a permanent token, config and pool,
              and cannot be undone.
            </label>
          )}
          <Button disabled={!ack || (net === "mainnet-beta" && !mainAck)} onClick={signAndSend}>
            Sign &amp; send in wallet
          </Button>
        </>
      )}
      <p role="status" className="mt-2">
        Status: {status === "idle" ? "not built" : status}
        {status === "awaiting-wallet" && " — approve or reject in your wallet"}
      </p>
      {sig && (
        <p>
          Signature:{" "}
          <a
            href={explorerTx(sig, landed?.net ?? net)}
            target="_blank"
            rel="noopener noreferrer"
            className="desk-link"
          >
            {sig.slice(0, 16)}… ↗
          </a>
        </p>
      )}
      {sig && status !== "confirmed" && (
        <Button variant="outline" onClick={recheck}>
          Check status / rebroadcast same transaction
        </Button>
      )}
      {status === "confirmed" && landed && (
        <p>
          Confirmed. Pool account verified as owned by the DBC program:{" "}
          <a
            href={explorerAccount(landed.pool, landed.net)}
            target="_blank"
            rel="noopener noreferrer"
            className="desk-link"
          >
            view pool ↗
          </a>
          {sig && (
            <>
              {" · "}
              <Link
                to="/launch-proofs/$network/$signature"
                params={{ network: landed.net, signature: sig }}
                className="desk-link"
              >
                View Launch Proof
              </Link>{" "}
              (re-verified independently from RPC) ·{" "}
              <Link to="/creator-studio" className="desk-link">
                Creator Studio
              </Link>
            </>
          )}
        </p>
      )}
      {auth && (
        <p>
          On-chain authority check: fee claimer, leftover receiver and creator are your wallet;
          token authority option Immutable; metadata update authority {auth.metadataUpdateAuthority}{" "}
          · {auth.metadataMutable ? "metadata MUTABLE" : "metadata non-mutable"}.
        </p>
      )}
      {authMsg && (
        <p role="alert" className="error-message">
          Launch confirmed, but the authority check did not pass: {authMsg}
        </p>
      )}
      {msg && (
        <p role="alert" className="error-message">
          {msg}
          {status === "submitted" || sig
            ? " The transaction may still land — check the signature before retrying."
            : ""}
        </p>
      )}
    </section>
  );
}