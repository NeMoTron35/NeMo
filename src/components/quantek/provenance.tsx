import { useRef, useState } from "react";
import type { Transaction } from "@solana/web3.js";
import { Link } from "@tanstack/react-router";
import {
  Fingerprint,
  KeyRound,
  LoaderCircle,
  ShieldCheck,
  Anchor,
  ScanLine,
  CheckCircle2,
  XCircle,
  FileJson,
  Stamp,
  RefreshCw,
  PenLine,
} from "lucide-react";
import { PublicKey } from "@solana/web3.js";
import { Button } from "@/components/ui/button";
import { PageHeading, Panel, Field, CopyValue, InfoTip } from "./controls";
import { useConsole } from "@/lib/quantek/context";
import {
  DOMAINS,
  PQ_PARAMETERS,
  proofBytes,
  verifyWotsProof,
  type Domain,
  type VerifyResult,
  type WotsProof,
} from "@/lib/quantek/pq";
import {
  anchorMemo,
  buildAnchorTransaction,
  buildTree,
  challengeMessage,
  deriveKeys,
  derivationMessage,
  publicDemoKeys,
  registrationMessage,
  signLeaf,
  SCRYPT_PARAMS,
  MEMO_PROGRAM_ID,
} from "@/lib/quantek/identity";
import { signDerivationMessage, signReviewedTransaction } from "@/lib/quantek/wallet";
import { createDBCServices, explainTransactionError } from "@/lib/quantek/dbc";
import { vaultChain, withdrawalCommitment } from "@/lib/quantek/quantum-wallet";

const STAGES = ["Derive", "Register", "Anchor", "Prove"] as const;
function LeafGrid({ used, next, built }: { used: number[]; next: number; built: number }) {
  return (
    <div
      className="leaf-grid"
      role="img"
      aria-label={`Leaf map: ${used.length} consumed of 256, next leaf ${next}`}
    >
      {Array.from({ length: 256 }, (_, i) => (
        <i
          key={i}
          className={used.includes(i) ? "used" : i === next ? "next" : i < built ? "built" : ""}
          title={`Leaf #${i}${used.includes(i) ? " · consumed" : ""}`}
        />
      ))}
    </div>
  );
}

export function IdentityPage() {
  const c = useConsole();
  const [stage, setStage] = useState(0);
  const [pass, setPass] = useState("");
  const [pass2, setPass2] = useState("");
  const [busy, setBusy] = useState("");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");
  const [regProof, setRegProof] = useState<WotsProof | null>(null);
  const [anchorState, setAnchorState] = useState<{
    memo: string;
    accounts: string[];
    fee: number | null;
    simulated: boolean;
    signed: boolean;
  } | null>(null);
  const [challenge, setChallenge] = useState<{
    nonce: string;
    proof: WotsProof;
    result: VerifyResult;
  } | null>(null);
  const prep = useRef<{
    transaction: Transaction;
    reviewedMessage: Uint8Array;
    lastValidBlockHeight: number;
  } | null>(null);
  const id = c.identity;
  const used = c.ledger?.used ?? [];
  const next = id ? c.nextLeaf() : 0;
  const isDemo = id?.label === "public-demo";
  const message = derivationMessage(c.account?.address ?? "<connect a wallet>", c.network);
  async function derive(demo: boolean) {
    setError("");
    if (!demo && pass && pass !== pass2) {
      setError("Passphrases do not match.");
      return;
    }
    if (!demo && pass && pass.length < 12) {
      setError("Passphrase must be at least 12 characters.");
      return;
    }
    setBusy(demo ? "demo" : "derive");
    setProgress(0);
    try {
      let keys;
      if (demo) keys = await publicDemoKeys();
      else {
        if (!c.wallet || !c.account)
          throw new Error("Connect a wallet to derive a reference identity.");
        const sig = await signDerivationMessage(c.wallet, c.account, message);
        keys = await deriveKeys(sig, pass || undefined);
        sig.fill(0);
      }
      const tree = await buildTree(keys, setProgress);
      c.openIdentity(
        tree,
        demo ? "public-demo" : "reference",
        demo ? null : (c.account?.address ?? null),
      );
      setPass("");
      setPass2("");
      setRegProof(null);
      setAnchorState(null);
      setChallenge(null);
      c.log(demo ? "Public demo identity opened" : "Reference identity derived locally", "Proof");
    } catch (e) {
      setError(explainTransactionError(e));
    } finally {
      setBusy("");
    }
  }
  async function register() {
    const tree = c.getTree();
    if (!tree || !id) return;
    setBusy("register");
    setError("");
    try {
      c.reserveLeaf(0, "genesis-registration");
      const p = await signLeaf(tree, 0, DOMAINS.identity, registrationMessage(id), id.label);
      setRegProof(p);
      c.log("Local Registration Profile created · leaf #0 consumed", "Proof");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Registration failed.");
    } finally {
      setBusy("");
    }
  }
  async function prepareAnchor() {
    if (!id || !c.account) return;
    setBusy("anchor");
    setError("");
    try {
      const s = createDBCServices(c.rpc, c.settings.commitment);
      const payer = new PublicKey(c.account.address);
      const prepared = await s.prepare(buildAnchorTransaction(id, payer), payer);
      setAnchorState({
        memo: anchorMemo(id),
        accounts: prepared.accounts,
        fee: prepared.feeLamports,
        simulated: false,
        signed: false,
      });
      prep.current = prepared;
      c.setAnchor({ signature: null, status: "prepared" });
    } catch (e) {
      setError(explainTransactionError(e));
    } finally {
      setBusy("");
    }
  }
  async function simulateAnchor() {
    const p = prep.current;
    if (!p) return;
    setBusy("simulate");
    try {
      await createDBCServices(c.rpc, c.settings.commitment).simulate(p.transaction);
      setAnchorState((a) => a && { ...a, simulated: true });
      c.log("Anchor memo simulation passed", "RPC");
    } catch (e) {
      setError(explainTransactionError(e));
    } finally {
      setBusy("");
    }
  }
  async function signAnchor() {
    const p = prep.current;
    if (!p || !c.wallet || !c.account) return;
    setBusy("sign");
    try {
      const s = createDBCServices(c.rpc, c.settings.commitment);
      await signReviewedTransaction({
        wallet: c.wallet,
        account: c.account,
        connection: s.connection,
        transaction: p.transaction,
        lastValidBlockHeight: p.lastValidBlockHeight,
        network: c.network,
        reviewedMessage: p.reviewedMessage,
      });
      setAnchorState((a) => a && { ...a, signed: true });
      c.setAnchor({ signature: null, status: "signed" });
      c.log("Anchor memo signed locally · not submitted", "RPC");
    } catch (e) {
      setError(explainTransactionError(e));
    } finally {
      setBusy("");
    }
  }
  async function prove() {
    const tree = c.getTree();
    if (!tree || !id) return;
    setBusy("prove");
    setError("");
    try {
      const leaf = c.nextLeaf();
      if (leaf < 0) throw new Error("Leaf budget exhausted. Roll over to a new identity.");
      const n = new Uint8Array(16);
      crypto.getRandomValues(n);
      const nonce = Array.from(n, (b) => b.toString(16).padStart(2, "0")).join("");
      c.reserveLeaf(leaf, "possession-proof");
      const proof = await signLeaf(
        tree,
        leaf,
        DOMAINS.proof,
        challengeMessage(id, nonce, leaf),
        id.label,
      );
      setChallenge({ nonce, proof, result: verifyWotsProof(proof) });
      c.log(`Proof of possession · leaf #${leaf}`, "Proof");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Proof failed.");
    } finally {
      setBusy("");
    }
  }
  const registered = used.includes(0);
  return (
    <>
      <PageHeading
        eyebrow="IDENTITY / HASH-BASED ROOT"
        title="Quantum Identity"
        description="A WOTS-16 / Merkle h=8 identity derived locally from one wallet message signature. 256 one-time leaves; each is consumed exactly once."
      />
      <div className="notice mb-6">
        <ShieldCheck size={16} />
        <span>
          <strong>Boundary.</strong> This identity signs provenance — launches, proofs,
          attestations. Your Solana funds remain authorized by ed25519 and are not quantum-protected
          by it. Quantum-protected custody needs a dedicated on-chain verifier vault; see{" "}
          <Link to="/quantum-wallets" className="underline">
            Quantum Wallets
          </Link>
          .
        </span>
      </div>
      <div className="stage-tabs" role="tablist" aria-label="Identity stages">
        {STAGES.map((s, i) => (
          <button
            key={s}
            role="tab"
            aria-selected={stage === i}
            disabled={i > 0 && !id}
            onClick={() => {
              setStage(i);
              setError("");
            }}
          >
            <small>{String(i + 1).padStart(2, "0")}</small>
            {s}
            {i === 0 && id
              ? " ✓"
              : i === 1 && registered
                ? " ✓"
                : i === 2 && c.anchor.status === "signed"
                  ? " ✓"
                  : ""}
          </button>
        ))}
      </div>
      {id && (
        <Panel
          title="Identity Root"
          tag={
            isDemo
              ? "PUBLIC DEMO · KNOWN SECRET · NEVER LIVE"
              : "LOCAL REFERENCE IDENTITY · IN MEMORY"
          }
        >
          <div className="instrument-body">
            <div className="detail-rows">
              <div>
                <span>Address</span>
                <strong>{id.address}</strong>
              </div>
              <div>
                <span>Root</span>
                <strong>{id.root}</strong>
              </div>
              <div>
                <span>Public seed</span>
                <strong>{id.publicSeed}</strong>
              </div>
              <div>
                <span>Parameters</span>
                <strong>
                  WOTS w=16 · SHA-256 · 67 chains · h=8 · {PQ_PARAMETERS.signatureBytes} B
                  signatures
                </strong>
              </div>
              <div>
                <span>Leaf Budget</span>
                <strong>
                  {256 - used.length} / 256 · next #{next}
                </strong>
              </div>
              <div>
                <span>Bound wallet</span>
                <strong>{id.wallet ?? "none (demo)"}</strong>
              </div>
            </div>
            <div className="flex gap-3 mt-3 flex-wrap">
              <CopyValue value={id.address} />
              <CopyValue value={id.root} />
              <Button
                variant="ghost"
                onClick={() => {
                  c.closeIdentity();
                  setStage(0);
                }}
              >
                Close identity (wipe memory)
              </Button>
            </div>
          </div>
          <LeafGrid used={used} next={next} built={256} />
          <div className="notice">
            One-time leaves: reusing a leaf leaks secret chain values. Quantum QLi persists only
            consumed indexes and public metadata{isDemo ? " (demo ledger is session-only)" : ""};
            secret seeds and passphrases are never stored.
          </div>
        </Panel>
      )}
      {error && (
        <div className="error-message mb-4" role="alert">
          {error}
        </div>
      )}
      {stage === 0 && (
        <div className="two-col">
          <Panel title="01 / Derive" tag="NO TRANSACTION">
            <div className="instrument-body">
              <div className="eyebrow mb-2">EXACT MESSAGE YOUR WALLET SIGNS</div>
              <pre className="code-block">{message}</pre>
              <div className="form-grid mt-4">
                <Field
                  label="Passphrase hardening (optional)"
                  hint={`scrypt N=2^${Math.log2(SCRYPT_PARAMS.N)}, r=${SCRYPT_PARAMS.r}, p=${SCRYPT_PARAMS.p} before HKDF-SHA256. Never stored. Lose it and the identity cannot be re-derived.`}
                >
                  <input
                    type="password"
                    autoComplete="new-password"
                    aria-label="Passphrase"
                    value={pass}
                    onChange={(e) => setPass(e.target.value)}
                  />
                </Field>
                <Field label="Confirm passphrase">
                  <input
                    type="password"
                    autoComplete="new-password"
                    aria-label="Confirm passphrase"
                    value={pass2}
                    onChange={(e) => setPass2(e.target.value)}
                  />
                </Field>
              </div>
              <div className="flex gap-3 mt-4 flex-wrap">
                <Button disabled={!!busy || !c.account} onClick={() => derive(false)}>
                  {busy === "derive" ? <LoaderCircle className="animate-spin" /> : <KeyRound />}Sign
                  &amp; derive locally
                </Button>
                <Button variant="outline" disabled={!!busy} onClick={() => derive(true)}>
                  {busy === "demo" ? <LoaderCircle className="animate-spin" /> : <Fingerprint />}
                  Open public demo identity
                </Button>
              </div>
              {!c.account && (
                <p className="micro mt-3">
                  CONNECT A WALLET TO DERIVE · THE DEMO IDENTITY USES A PUBLISHED SECRET
                </p>
              )}
              {busy && (busy === "derive" || busy === "demo") && (
                <div className="mt-4" aria-live="polite">
                  <div className="flex justify-between micro">
                    <span>BUILDING MERKLE TREE</span>
                    <span>{progress} / 256 LEAVES</span>
                  </div>
                  <div className="progress-track">
                    <progress max={256} value={progress} aria-label="Leaves generated" />
                  </div>
                </div>
              )}
            </div>
          </Panel>
          <Panel title="Derivation pipeline" tag="Quantum QLi REFERENCE v1">
            <pre
              className="code-block"
              style={{ margin: 19 }}
            >{`sig      = ed25519_sign(wallet, message)      // local
ikm      = SHA-256(sig)
ikm      = scrypt(passphrase, ${DOMAINS.identity} ‖ ikm)   // optional
seed     = HKDF-SHA256(ikm, salt="${DOMAINS.identity}", 64)
skSeed   = seed[0..32]     // memory only
pubSeed  = seed[32..64]    // public
leaf_i   = H(pubSeed, i, pk_0 … pk_66)   // 67 chains × 15 steps
root     = Merkle(leaf_0 … leaf_255)     // height 8
address  = qtk1 ‖ base32(H(domain, root, pubSeed))[..20B] ‖ check`}</pre>
            <div className="notice">
              Reference implementation with Quantum QLi domain separation; not independently
              audited. Do not use it to secure value.
            </div>
          </Panel>
        </div>
      )}
      {stage === 1 && id && (
        <div className="two-col">
          <Panel title="02 / Register" tag="LOCAL REGISTRATION PROFILE">
            <div className="instrument-body">
              <p className="micro mb-3">DUAL-AUTH BINDING · WALLET ↔ IDENTITY ROOT</p>
              <div className="detail-rows">
                <div>
                  <span>Solana wallet</span>
                  <strong>{id.wallet ?? "— (demo)"}</strong>
                </div>
                <div>
                  <span>qtk1 address</span>
                  <strong>{id.address}</strong>
                </div>
                <div>
                  <span>Genesis leaf</span>
                  <strong>#0 {registered ? "· consumed" : "· reserved for registration"}</strong>
                </div>
              </div>
              <pre className="code-block mt-3">{registrationMessage(id)}</pre>
              <Button className="mt-4" disabled={registered || !!busy} onClick={register}>
                {busy === "register" ? <LoaderCircle className="animate-spin" /> : <Stamp />}
                {registered ? "Registered · leaf #0 consumed" : "Create Local Registration Profile"}
              </Button>
              {regProof && (
                <div className="mt-3">
                  <CopyValue value={JSON.stringify(regProof)} />
                </div>
              )}
            </div>
          </Panel>
          <Panel title="What registration means here" tag="SERVERLESS">
            <div className="notice" style={{ margin: 19 }}>
              Quantum QLi has no server ledger in this build. Registration is a local profile: the
              wallet authorizes the derivation message, and leaf #0 signs the binding. Anyone can
              verify the leaf-#0 proof; nobody else stores it until you anchor or publish it.
            </div>
          </Panel>
        </div>
      )}
      {stage === 2 && id && (
        <div className="two-col">
          <Panel
            title="03 / Anchor"
            tag={
              c.anchor.status === "signed"
                ? "SIGNED · NOT SUBMITTED"
                : anchorState
                  ? "PREPARED · UNSIGNED"
                  : "NOT ANCHORED"
            }
          >
            <div className="instrument-body">
              <div className="eyebrow mb-2">SPL MEMO PAYLOAD</div>
              <pre className="code-block">{anchorMemo(id)}</pre>
              <div className="detail-rows mt-3">
                <div>
                  <span>Memo program</span>
                  <strong>{MEMO_PROGRAM_ID}</strong>
                </div>
                <div>
                  <span>Fee payer</span>
                  <strong>{c.account?.address ?? "Connect wallet"}</strong>
                </div>
                {anchorState && (
                  <>
                    <div>
                      <span>Accounts</span>
                      <strong>{anchorState.accounts.length}</strong>
                    </div>
                    <div>
                      <span>Estimated fee</span>
                      <strong>{anchorState.fee ?? "unknown"} lamports</strong>
                    </div>
                    <div>
                      <span>Simulation</span>
                      <strong>{anchorState.simulated ? "Passed" : "Not run"}</strong>
                    </div>
                  </>
                )}
              </div>
              <div className="flex gap-3 mt-4 flex-wrap">
                <Button
                  variant="outline"
                  disabled={!c.account || isDemo || !!busy}
                  onClick={prepareAnchor}
                >
                  {busy === "anchor" ? <LoaderCircle className="animate-spin" /> : <Anchor />}
                  Prepare unsigned memo
                </Button>
                <Button
                  variant="outline"
                  disabled={!anchorState || !!busy}
                  onClick={simulateAnchor}
                >
                  {busy === "simulate" ? <LoaderCircle className="animate-spin" /> : <RefreshCw />}
                  Simulate
                </Button>
                <Button
                  disabled={!anchorState?.simulated || anchorState.signed || !!busy}
                  onClick={signAnchor}
                >
                  {busy === "sign" ? <LoaderCircle className="animate-spin" /> : <PenLine />}Review
                  &amp; sign in wallet
                </Button>
              </div>
              {isDemo && <p className="micro mt-3">DEMO IDENTITIES CANNOT BE ANCHORED</p>}
            </div>
          </Panel>
          <Panel title="Anchor semantics" tag="PUBLIC TIMESTAMP">
            <div className="notice" style={{ margin: 19 }}>
              An anchor is a public timestamp of your root on Solana. It exists only once a
              submitted transaction is confirmed — Quantum QLi returns signed bytes and never claims
              an anchor it has not observed on-chain. Submission is a separate, explicit step.
            </div>
          </Panel>
        </div>
      )}
      {stage === 3 && id && (
        <div className="two-col">
          <Panel title="04 / Prove" tag="CHALLENGE-RESPONSE · LOCAL">
            <div className="instrument-body">
              <p className="text-xs text-muted-foreground mb-4">
                Signs a fresh random nonce with the next unused leaf and verifies it in-browser.
                Each proof permanently consumes one leaf.
              </p>
              <Button disabled={!!busy || next < 0} onClick={prove}>
                {busy === "prove" ? <LoaderCircle className="animate-spin" /> : <ScanLine />}
                Generate proof of possession · leaf #{next}
              </Button>
              {challenge && (
                <div className="detail-rows mt-4">
                  <div>
                    <span>Nonce</span>
                    <strong>{challenge.nonce}</strong>
                  </div>
                  <div>
                    <span>Leaf</span>
                    <strong>#{challenge.proof.leaf}</strong>
                  </div>
                  <div>
                    <span>Proof size</span>
                    <strong>{proofBytes(challenge.proof)} B</strong>
                  </div>
                  <div>
                    <span>Status</span>
                    <strong>{challenge.result.valid ? "Verified · root match" : "Failed"}</strong>
                  </div>
                </div>
              )}
              {challenge && (
                <div className="mt-3">
                  <CopyValue value={JSON.stringify(challenge.proof)} />
                </div>
              )}
            </div>
          </Panel>
          <Panel title="Proof Trace" tag={challenge ? "67 CHAINS · 8 LEVELS" : "AWAITING PROOF"}>
            {challenge ? (
              <TraceView r={challenge.result} />
            ) : (
              <div className="empty-state" style={{ margin: 19 }}>
                No proof generated yet.
              </div>
            )}
            <div className="notice">
              Serverless: the verifier is the same browser. Paste the copied proof into{" "}
              <Link to="/verify" className="underline">
                Verify
              </Link>{" "}
              or share it for third-party checking.
            </div>
          </Panel>
        </div>
      )}
    </>
  );
}

function TraceView({ r }: { r: VerifyResult }) {
  return (
    <>
      <div className="chain-strip" role="img" aria-label="Remaining hash steps per WOTS chain">
        {r.chains.map((ch) => (
          <i
            key={ch.index}
            style={{ height: `${(ch.steps / 15) * 100}%` }}
            title={`chain ${ch.index}: digit ${ch.digit}, ${ch.steps} steps`}
          />
        ))}
      </div>
      <div className="detail-rows" style={{ padding: "0 19px 15px" }}>
        {r.levels.map((l) => (
          <div key={l.level}>
            <span>
              Level {l.level + 1} · {l.side === "R" ? "right" : "left"} child
            </span>
            <strong>{l.node.slice(0, 24)}…</strong>
          </div>
        ))}
      </div>
    </>
  );
}

type Category = "launch" | "identity" | "wallet";
const CATS: { id: Category; label: string; domain: Domain; hint: string }[] = [
  {
    id: "launch",
    label: "Launch attestation",
    domain: DOMAINS.launch,
    hint: 'Token metadata JSON with extensions["quantek.network/launch/v1"].proof, or a raw proof.',
  },
  {
    id: "identity",
    label: "Identity proof",
    domain: DOMAINS.proof,
    hint: "A proof of possession or a registration proof exported from Identity.",
  },
  {
    id: "wallet",
    label: "Quantum Wallet spend",
    domain: DOMAINS.quantumWallet,
    hint: "A reference spend proof committing to recipient, mint, amount and next vault.",
  },
];
function extractProof(input: unknown, domain: Domain): WotsProof {
  const o = (input ?? {}) as {
    kind?: unknown;
    proof?: unknown;
    extensions?: Record<string, unknown>;
    properties?: { extensions?: Record<string, unknown> };
  };
  if (o.kind === "quantek-wots16-merkle-v1") return o as unknown as WotsProof;
  if (o.proof && typeof o.proof === "object") return extractProof(o.proof, domain);
  const ext = o.extensions ?? o.properties?.extensions;
  if (ext && ext[domain]) return extractProof(ext[domain], domain);
  throw new Error("No Quantum QLi proof found in input.");
}
async function demoFor(cat: Category) {
  const keys = await publicDemoKeys();
  if (cat === "launch") {
    const p = await signLeaf(
      keys,
      42,
      DOMAINS.launch,
      '{"v":1,"name":"Demo Asset","symbol":"DEMO","note":"public demonstration"}',
      "public-demo",
    );
    return {
      name: "Demo Asset",
      symbol: "DEMO",
      uri: "ipfs://demo",
      extensions: { [DOMAINS.launch]: { scheme: "wots", proof: p } },
    };
  }
  if (cat === "identity")
    return signLeaf(keys, 7, DOMAINS.proof, "quantek:v1:possession:demo:nonce=00", "public-demo");
  const vaults = vaultChain("demo-root", 3, 0);
  const cm = withdrawalCommitment(
    {
      recipient: "11111111111111111111111111111111",
      mint: "So11111111111111111111111111111111111111112",
      amount: 1.5,
      vaultIndex: 0,
    },
    vaults,
  );
  return signLeaf(keys, 1, DOMAINS.quantumWallet, cm.digest, "public-demo");
}

export function VerifyPage() {
  const c = useConsole();
  const [cat, setCat] = useState<Category>("launch");
  const [input, setInput] = useState("");
  const [uri, setUri] = useState("");
  const [trusted, setTrusted] = useState("");
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<{
    r?: VerifyResult;
    proof?: WotsProof;
    error?: string;
    source: string;
  } | null>(null);
  const meta = CATS.find((x) => x.id === cat)!;
  async function run() {
    setBusy(true);
    setRes(null);
    let source = "pasted input";
    try {
      let text = input.trim();
      if (!text && uri) {
        if (!/^https:\/\//.test(uri)) throw new Error("Only HTTPS metadata URIs can be fetched.");
        const r = await fetch(uri);
        if (!r.ok) throw new Error(`Metadata fetch failed (${r.status}).`);
        text = await r.text();
        source = uri;
      }
      if (!text) throw new Error("Paste metadata/proof JSON or provide an HTTPS metadata URI.");
      if (text.length > 200000) throw new Error("Input too large.");
      const proof = extractProof(JSON.parse(text), meta.domain);
      if (proof.domain !== meta.domain)
        throw new Error(`Domain mismatch: expected ${meta.domain}, got ${proof.domain}.`);
      const r = verifyWotsProof(proof);
      setRes({ r, proof, source });
      c.log(
        `${meta.label} ${r.valid ? "verified" : "rejected"}${proof.label === "public-demo" ? " · demo" : ""}`,
        "Proof",
      );
    } catch (e) {
      setRes({ error: e instanceof Error ? e.message : "Verification failed.", source });
    } finally {
      setBusy(false);
    }
  }
  async function load(tamper: boolean) {
    setBusy(true);
    setRes(null);
    try {
      const d = await demoFor(cat);
      const s = JSON.stringify(d, null, 2);
      setInput(tamper ? s.replace(/"message": "(.)/, '"message": "X$1') : s);
    } catch (e) {
      setRes({ error: e instanceof Error ? e.message : "Demo failed.", source: "local example" });
    } finally {
      setBusy(false);
    }
  }
  const r = res?.r;
  const trustOk = r && trusted ? trusted.trim().toLowerCase() === r.root : null;
  const steps = [
    {
      k: "Input",
      ok: !!res?.proof,
      v: res?.proof ? `${res.source} · ${proofBytes(res.proof)} B` : "—",
    },
    { k: "Digest", ok: !!r, v: r ? r.digest.slice(0, 20) + "…" : "—" },
    {
      k: "Chains",
      ok: !!r,
      v: r ? `67 chains · ${r.chains.reduce((s, x) => s + x.steps, 0)} steps` : "—",
    },
    { k: "Merkle path", ok: !!r, v: r ? `8 levels · leaf #${res?.proof?.leaf}` : "—" },
    {
      k: "Root",
      ok: !!r?.valid,
      bad: r && !r.valid,
      v: r ? (r.valid ? "match" : "mismatch") : "—",
    },
    {
      k: "Result",
      ok: !!r?.valid && trustOk !== false,
      bad: (r && !r.valid) || trustOk === false || !!res?.error,
      v: res?.error
        ? "error"
        : r
          ? r.valid
            ? trustOk === false
              ? "untrusted root"
              : res?.proof?.label === "public-demo"
                ? "valid · demo"
                : "valid"
            : "invalid"
          : "—",
    },
  ];
  return (
    <>
      <PageHeading
        eyebrow="VERIFY / LOCAL"
        title="Proof Inspector"
        description="Recompute the digest, walk all 67 WOTS chains and 8 Merkle levels, and compare the root — entirely in this browser."
      />
      <div
        className="segmented mb-6"
        style={{ margin: "0 0 22px" }}
        role="tablist"
        aria-label="Verification category"
      >
        {CATS.map((x) => (
          <button
            key={x.id}
            role="tab"
            aria-selected={cat === x.id}
            className={cat === x.id ? "selected" : ""}
            onClick={() => {
              setCat(x.id);
              setRes(null);
              setInput("");
            }}
          >
            {x.label}
          </button>
        ))}
      </div>
      <div className="two-col">
        <Panel title={meta.label} tag={meta.domain}>
          <div className="instrument-body">
            <Field label="Metadata / proof JSON" hint={meta.hint}>
              <textarea
                rows={10}
                aria-label="Metadata or proof JSON"
                className="code-block"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                spellCheck={false}
              />
            </Field>
            <div className="form-grid mt-4">
              {cat === "launch" && (
                <Field
                  label="Metadata URI (used only if JSON is empty)"
                  hint="Fetched only when no proof material is pasted."
                >
                  <input
                    aria-label="Metadata URI"
                    value={uri}
                    onChange={(e) => setUri(e.target.value)}
                    placeholder="https://…"
                  />
                </Field>
              )}
              <Field
                label="Trusted root (optional)"
                hint="From an anchor or a registration profile. A root match alone is not trust."
              >
                <input
                  aria-label="Trusted root"
                  value={trusted}
                  onChange={(e) => setTrusted(e.target.value)}
                />
              </Field>
            </div>
            <div className="flex gap-3 mt-4 flex-wrap">
              <Button disabled={busy} onClick={run}>
                {busy ? <LoaderCircle className="animate-spin" /> : <ScanLine />}Verify
              </Button>
              <Button variant="outline" disabled={busy} onClick={() => load(false)}>
                <FileJson />
                Load demo (valid)
              </Button>
              <Button variant="ghost" disabled={busy} onClick={() => load(true)}>
                Load demo (tampered)
              </Button>
            </div>
          </div>
        </Panel>
        <Panel title="Parameters" tag="Quantum QLi REFERENCE v1">
          <div className="detail-rows" style={{ padding: 19 }}>
            <div>
              <span>Scheme</span>
              <strong>WOTS w=16 · SHA-256</strong>
            </div>
            <div>
              <span>Chains</span>
              <strong>67 (64 message + 3 checksum)</strong>
            </div>
            <div>
              <span>Tree</span>
              <strong>Merkle h=8 · 256 leaves</strong>
            </div>
            <div>
              <span>Signature</span>
              <strong>{PQ_PARAMETERS.signatureBytes} B</strong>
            </div>
            <div>
              <span>Domain</span>
              <strong>{meta.domain}</strong>
            </div>
          </div>
          {r && (
            <div style={{ padding: "0 19px 19px" }}>
              <div className="eyebrow mb-2">COMPUTED ROOT</div>
              <CopyValue value={r.root} />
            </div>
          )}
        </Panel>
      </div>
      <div className="pipe" aria-live="polite">
        {steps.map((s) => (
          <div key={s.k} className={s.bad ? "bad" : s.ok ? "ok" : ""}>
            <strong>
              {s.ok ? (
                <CheckCircle2 size={10} className="inline mr-1" />
              ) : s.bad ? (
                <XCircle size={10} className="inline mr-1" />
              ) : null}
              {s.k}
            </strong>
            <p>{s.v}</p>
          </div>
        ))}
      </div>
      {res?.error && (
        <div className="error-message" role="alert">
          {res.error}
        </div>
      )}
      {r && (
        <div className={`result-banner ${r.valid ? "passed" : ""}`} role="status">
          {r.valid ? <CheckCircle2 /> : <XCircle />}
          {r.valid
            ? trustOk === false
              ? "Signature valid but root differs from the trusted root."
              : res?.proof?.label === "public-demo"
                ? "Valid proof — PUBLIC DEMO key, proves nothing about a live asset."
                : "Valid proof under the computed root. Confirm the root against an anchor before trusting it."
            : "Invalid — recomputed root does not match the claimed root."}
        </div>
      )}
      {r && (
        <Panel title="Proof Trace" tag="67 CHAINS · 8 LEVELS">
          <TraceView r={r} />
        </Panel>
      )}
      <div className="notice mt-4">
        <ShieldCheck size={16} />
        Quantum QLi reference encoding with its own domain separation. Verification never calls an
        external API when the input already contains the public proof material.{" "}
        <InfoTip text="Proof material: message, leaf, public seed, 67 chain values, 8 auth-path nodes, root." />
      </div>
    </>
  );
}
