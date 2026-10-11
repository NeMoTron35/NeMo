import { useState } from "react";
import { Button } from "@/components/ui/button";
import { PageHeading, Panel } from "./controls";
import { feasibility, SOLANA_LIMITS } from "@/lib/qli-core/identity-v2";

export function IdentityV2Page() {
  const f = feasibility();
  const [demo, setDemo] = useState<string | null>(null);
  async function runDemo() {
    const [{ makeDemoProof, verifyWotsProof, DOMAINS }, v2, { DEVNET_GENESIS }] = await Promise.all(
      [
        import("@/lib/qli-core/pq"),
        import("@/lib/qli-core/identity-v2"),
        import("@/lib/qli-core/quantum-vault"),
      ],
    );
    const now = Math.floor(Date.now() / 1000);
    const msg = v2.bindingMessage({
      wallet: "public-demo",
      target: "none",
      action: "demo",
      genesis: DEVNET_GENESIS,
      nonce: String(now),
      expiresAt: now + 300,
    });
    const p = await makeDemoProof(DOMAINS.proof, msg);
    const s = v2.openSession(p, now);
    v2.chunkProof(p).forEach((c, i) => v2.uploadChunk(s, i, c, now));
    const used = new Set<string>();
    const r = v2.finalize(s, () => verifyWotsProof(p).valid, used, now);
    let replay = "accepted (bug)";
    try {
      const s2 = v2.openSession(p, now);
      v2.chunkProof(p).forEach((c, i) => v2.uploadChunk(s2, i, c, now));
      v2.finalize(s2, () => true, used, now);
    } catch (e) {
      replay = (e as Error).message;
    }
    setDemo(
      `Off-chain model: ${s.chunks.length} chunks, commitment ${r.commitment.slice(0, 16)}…, verified; replay → ${replay}. Authorizes: no.`,
    );
  }
  return (
    <div className="page-stack">
      <PageHeading
        eyebrow="Experimental"
        title="Identity 2.0"
        description="Feasibility of verifying Quantum Identity WOTS/Merkle proofs inside a Solana program. Research only — nothing here protects funds."
      />
      <Panel title="Provenance" tag="truthful status">
        <ul>
          <li>
            Real today: WOTS (w=16, SHA-256) + height-8 Merkle proofs, verified locally in your
            browser.
          </li>
          <li>
            Experimental: chunked on-chain staging protocol — modelled and tested off-chain only. No
            Solana program built or deployed.
          </li>
          <li>Future: ML-DSA — not implemented on-chain.</li>
          <li>
            Ed25519 wallet signatures are not post-quantum. Solana funds are not quantum-resistant.
          </li>
          <li>
            A commitment or verified proof is not authorization; vault withdrawals do not check it.
          </li>
        </ul>
      </Panel>
      <Panel title="Feasibility (estimates)" tag={f.status}>
        <table className="data-table">
          <tbody>
            <tr>
              <td>Proof size</td>
              <td>
                {f.proofBytes} bytes vs {SOLANA_LIMITS.txBytes}-byte transaction
              </td>
            </tr>
            <tr>
              <td>Single transaction</td>
              <td>{f.fitsSingleTx ? "fits" : "does not fit"}</td>
            </tr>
            <tr>
              <td>Chunks</td>
              <td>
                {f.chunks} × ≤{f.bytesPerChunk} bytes
              </td>
            </tr>
            <tr>
              <td>Worst-case hashes</td>
              <td>{f.worstCaseHashes}</td>
            </tr>
            <tr>
              <td>Estimated compute</td>
              <td>
                ~{f.estimatedVerifyCu.toLocaleString()} CU of{" "}
                {SOLANA_LIMITS.maxComputeUnits.toLocaleString()}
              </td>
            </tr>
            <tr>
              <td>Staging account</td>
              <td>{f.stagingAccountBytes} bytes (rent reclaimable on close)</td>
            </tr>
          </tbody>
        </table>
      </Panel>
      <Panel title="Threat model" tag="summary">
        <p>
          Binding covers wallet, target, action, genesis, nonce and expiry under a frozen domain.
          Leaves are one-time: reuse leaks key material, so a consumed-leaf set rejects replay.
          Chunks are bound to a commitment hash and an expiry. Risks: RPC compromise, unaudited
          code, leaf exhaustion (256), and the fact that the wallet's Ed25519 key still controls
          funds.
        </p>
      </Panel>
      <Panel title="Run the off-chain protocol model" tag="public demo key">
        <Button onClick={runDemo}>Run model</Button>
        {demo && <p>{demo}</p>}
      </Panel>
    </div>
  );
}