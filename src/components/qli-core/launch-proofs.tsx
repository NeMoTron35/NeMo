import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { PageHeading, Panel, Field } from "./controls";
import { getLaunchProof } from "@/lib/qli-core/launch-proof.functions";
import {
  isSignature,
  readIntents,
  verifyReceipt,
  type LaunchReceipt,
  type LocalIntent,
  type Observed,
  type ProofNetwork,
  type ReceiptCheck,
} from "@/lib/qli-core/launch-proof";
import { runShadow } from "@/lib/qli-core/neural/shadow";
import { fetchNeuralStatus, hfLabel, type NeuralStatus } from "@/lib/qli-core/neural/status-client";
import { explorerAccount, explorerTx } from "@/lib/qli-core/dbc-launch";

export function LaunchProofLookup() {
  const navigate = useNavigate();
  const [network, setNetwork] = useState<ProofNetwork>("devnet");
  const [sig, setSig] = useState("");
  const [raw, setRaw] = useState("");
  const [check, setCheck] = useState<ReceiptCheck | null>(null);
  const valid = isSignature(sig.trim());
  return (
    <>
      <PageHeading
        eyebrow="LAUNCH PROOF ENGINE / V1"
        title="Launch Proofs"
        description="Verify a Meteora DBC launch from real Solana RPC evidence. Read-only: this page never asks a wallet to sign."
      />
      <div className="settings-stack">
        <Panel title="Look up a launch" tag="READ-ONLY">
          <form
            className="instrument-body form-grid"
            onSubmit={(e) => {
              e.preventDefault();
              if (valid)
                void navigate({
                  to: "/launch-proofs/$network/$signature",
                  params: { network, signature: sig.trim() },
                });
            }}
          >
            <Field label="Network">
              <select value={network} onChange={(e) => setNetwork(e.target.value as ProofNetwork)}>
                <option value="devnet">Solana devnet</option>
                <option value="mainnet-beta">Solana mainnet-beta</option>
              </select>
            </Field>
            <Field
              label="Transaction signature"
              hint="64-byte base58 signature of the launch transaction."
            >
              <input
                value={sig}
                onChange={(e) => setSig(e.target.value)}
                className="font-mono text-xs"
                spellCheck={false}
                autoComplete="off"
                maxLength={90}
                aria-invalid={sig.length > 0 && !valid}
              />
            </Field>
            {sig.length > 0 && !valid && (
              <p role="alert" className="error-message sm:col-span-2">
                Not a valid Solana signature.
              </p>
            )}
            <div className="sm:col-span-2">
              <Button type="submit" disabled={!valid}>
                Verify launch
              </Button>
            </div>
          </form>
        </Panel>
        <Panel title="Check an exported receipt" tag="LOCAL">
          <div className="instrument-body">
            <label className="micro" htmlFor="receipt-json">
              Receipt JSON
            </label>
            <textarea
              id="receipt-json"
              value={raw}
              onChange={(e) => setRaw(e.target.value.slice(0, 20_000))}
              rows={6}
              className="font-mono text-xs w-full"
            />
            <Button
              variant="outline"
              className="mt-2"
              onClick={async () => {
                try {
                  setCheck(await verifyReceipt(JSON.parse(raw)));
                } catch {
                  setCheck({ structure: false, digestMatches: false, note: "Not valid JSON." });
                }
              }}
            >
              Recompute digest
            </Button>
            {check && (
              <p role="status" className="mt-2">
                Structure {check.structure ? "valid" : "invalid"} · digest{" "}
                {check.digestMatches ? "matches" : "does not match"}. {check.note}
              </p>
            )}
          </div>
        </Panel>
      </div>
    </>
  );
}

function Row({ k, v, href }: { k: string; v: string; href?: string }) {
  return (
    <>
      <dt>{k}</dt>
      <dd className="font-mono text-xs break-all">
        {href ? (
          <a href={href} target="_blank" rel="noopener noreferrer" className="desk-link">
            {v}
          </a>
        ) : (
          v
        )}
      </dd>
    </>
  );
}

export function LaunchProofPage({ network, signature }: { network: string; signature: string }) {
  const fetchProof = useServerFn(getLaunchProof);
  const okInput = (network === "devnet" || network === "mainnet-beta") && isSignature(signature);
  const q = useQuery({
    queryKey: ["launch-proof", network, signature],
    queryFn: () => fetchProof({ data: { network: network as ProofNetwork, signature } }),
    enabled: okInput,
    retry: false,
    staleTime: 30_000,
  });
  const [intents, setIntents] = useState<LocalIntent[]>([]);
  useEffect(() => {
    try {
      setIntents(readIntents(window.sessionStorage));
    } catch {
      setIntents([]);
    }
  }, []);
  const intent = intents.find((i) => i.signature === signature && i.network === network);

  return (
    <>
      <PageHeading
        eyebrow="LAUNCH PROOF ENGINE / V1"
        title="Launch Proof"
        description="Independent verification of a Meteora DBC launch from Solana RPC evidence. Read-only."
        action={
          <span>
            <Link to="/launch-proofs" className="desk-link">
              New lookup
            </Link>{" "}
            <Link to="/hook-forge" className="desk-link">
              Hook Forge
            </Link>{" "}
            <Link to="/creator-studio" className="desk-link">
              Creator Studio
            </Link>
          </span>
        }
      />
      <div className="settings-stack">
        {!okInput ? (
          <p role="alert" className="error-message">
            Invalid network or signature. Nothing was looked up.
          </p>
        ) : q.isPending ? (
          <p role="status">Reading Solana {network} RPC…</p>
        ) : q.isError || !q.data ? (
          <p role="alert" className="error-message">
            The lookup could not complete. Nothing was verified.
          </p>
        ) : !q.data.ok ? (
          <Panel title="Not verified" tag={q.data.code.toUpperCase()}>
            <div className="instrument-body">
              <p role="alert">{q.data.message}</p>
              {q.data.txError && <p className="micro">Transaction error: {q.data.txError}</p>}
              <p className="micro mt-2">No receipt is issued for unverified results.</p>
              <Button variant="outline" className="mt-2" onClick={() => void q.refetch()}>
                Check again
              </Button>
            </div>
          </Panel>
        ) : (
          <Verified receipt={q.data.receipt} observed={q.data.observed} intent={intent} />
        )}
      </div>
    </>
  );
}

function Verified({
  receipt,
  observed,
  intent,
}: {
  receipt: LaunchReceipt;
  observed: Observed;
  intent: LocalIntent | undefined;
}) {
  const [copied, setCopied] = useState("");
  const f = receipt.facts;
  const net = receipt.network;
  const json = JSON.stringify(receipt, null, 2);
  async function copy(text: string, what: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(what);
    } catch {
      setCopied("");
    }
  }
  return (
    <>
      <Panel title="Verified Meteora DBC launch" tag="CONFIRMED ON-CHAIN">
        <div className="instrument-body">
          <dl className="detail-rows" aria-label="Verified on-chain facts">
            <Row k="Network" v={`Solana ${net}`} />
            <Row k="Signature" v={receipt.signature} href={explorerTx(receipt.signature, net)} />
            <Row k="Slot" v={`${receipt.slot} · ${receipt.commitment}`} />
            <Row k="Program" v={f.program} />
            <Row
              k="Pool (DBC-owned, created in tx)"
              v={f.pool}
              href={explorerAccount(f.pool, net)}
            />
            <Row
              k="Config (DBC-owned)"
              v={`${f.config}${f.configCreatedInTx ? " · created in tx" : " · pre-existing"}`}
            />
            <Row
              k="Token mint"
              v={`${f.baseMint}${f.mintCreatedInTx ? " · created in tx" : ""}`}
              href={explorerAccount(f.baseMint, net)}
            />
            <Row k="Quote mint" v={f.quoteMint} />
            <Row k="Creator (signed tx)" v={f.creator} />
            <Row k="Migration target" v={f.migration.toUpperCase()} />
            <Row k="Receipt digest (SHA-256, v1)" v={receipt.digest} />
          </dl>
          <p className="mt-2">
            <Link
              to="/meteora-intelligence"
              search={{ network: net, pool: f.pool }}
              className="desk-link"
            >
              Open lifecycle intelligence for this pool
            </Link>
          </p>
          <p className="micro mt-2">
            The digest is a local integrity checksum over these verified fields. It is not a
            signature, an oracle attestation or an on-chain proof.
          </p>
          <div className="mt-2" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Button variant="outline" onClick={() => copy(window.location.href, "url")}>
              {copied === "url" ? "URL copied" : "Copy public URL"}
            </Button>
            <Button variant="outline" onClick={() => copy(json, "json")}>
              {copied === "json" ? "JSON copied" : "Copy receipt JSON"}
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                const a = document.createElement("a");
                a.href = URL.createObjectURL(new Blob([json], { type: "application/json" }));
                a.download = `qli-launch-proof-${receipt.signature.slice(0, 12)}.json`;
                a.click();
                URL.revokeObjectURL(a.href);
              }}
            >
              Export JSON
            </Button>
          </div>
        </div>
      </Panel>
      <Panel title="Launch intent" tag="INTENT LINKAGE UNVERIFIED">
        <div className="instrument-body">
          {intent ? (
            <p>
              This browser holds a locally reviewed intent for {intent.symbol}: hash{" "}
              <span className="font-mono text-xs break-all">{intent.intentHash}</span>. It is a
              user-side review record, not embedded or signed on-chain, so it is not
              cryptographically linked to this transaction.
            </p>
          ) : (
            <p>
              No reviewed intent is held in this browser. Intent linkage is unverified: no launch
              intent hash is embedded or signed on-chain.
            </p>
          )}
        </div>
      </Panel>
      <Intelligence receipt={receipt} observed={observed} />
    </>
  );
}

function Intelligence({ receipt, observed }: { receipt: LaunchReceipt; observed: Observed }) {
  const [hf, setHf] = useState<NeuralStatus | null>(null);
  useEffect(() => {
    void fetchNeuralStatus().then(setHf);
  }, []);
  const shadow = useMemo(() => {
    try {
      if (BigInt(observed.quoteReserve) === 0n || BigInt(observed.baseReserve) === 0n)
        return { error: "Not applicable: a reserve is zero at the read slot." };
      return {
        out: runShadow({
          model: "constant-product-hypothetical",
          baseReserve: observed.baseReserve,
          quoteReserve: observed.quoteReserve,
          feeBps: 0,
          maxImpactBps: 500,
          tradeBps: [100, 500, 1000],
          reserveShockBps: 3000,
        }),
      };
    } catch {
      return { error: "Not applicable: reserves are outside the stress model bounds." };
    }
  }, [observed]);
  const readAt = new Date(observed.readAt * 1000).toISOString();
  return (
    <Panel title="Evidence-linked intelligence" tag="NOT PROOF">
      <div className="instrument-body">
        <p className="micro">
          Interpretations below are separate from the verified facts and are not part of the
          receipt.
        </p>
        <h3 className="mt-2">Deterministic reading</h3>
        <p>
          Source: Solana RPC account read at slot {observed.slot} ({readAt}). Pool base reserve{" "}
          {observed.baseReserve}, quote reserve {observed.quoteReserve} (raw units). Migration
          target {receipt.facts.migration.toUpperCase()}. Confidence: exact for the read slot; state
          may have changed since.
        </p>
        <h3 className="mt-2">Shadow stress · hypothetical / uncalibrated</h3>
        {"error" in shadow ? (
          <p>{shadow.error}</p>
        ) : (
          <ul>
            {shadow.out!.scenarios.map((s) => (
              <li key={s.name}>
                {s.name}: impact {s.impactBps} bps{s.violates ? " (exceeds 500 bps limit)" : ""}
              </li>
            ))}
            <li className="micro">{shadow.out!.label}</li>
          </ul>
        )}
        <h3 className="mt-2">Threat Graph</h3>
        <p>Owner-scoped monitoring is private and is not shown on public proof pages.</p>
        <h3 className="mt-2">Hosted model</h3>
        <p>
          {hf && hf.ok && hf.hf === "not-configured"
            ? "Hugging Face not configured / deterministic only."
            : hfLabel(hf)}{" "}
          No model output is used as proof, and no amounts, recipients or actions are suggested.
        </p>
      </div>
    </Panel>
  );
}
