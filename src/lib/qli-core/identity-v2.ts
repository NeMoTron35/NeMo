// Quantum Identity 2.0 — EXPERIMENTAL feasibility model for on-chain WOTS/Merkle verification.
// No Solana program is deployed. Nothing here authorizes vault operations; a commitment is not
// authorization. Cost figures are estimates from published Solana syscall costs, labelled as such.
import { sha256 } from "@noble/hashes/sha256";
import { PQ_PARAMETERS, hex, utf8, type WotsProof } from "./pq";

export const SOLANA_LIMITS = {
  txBytes: 1232,
  maxComputeUnits: 1_400_000,
  sha256BaseCu: 85,
  sha256ByteCuPer2Bytes: 1,
  ed25519IsPq: false,
} as const;

/** Overhead budget for one signature, header, 4 accounts, blockhash and an instruction header. */
export const TX_OVERHEAD_BYTES = 1 + 64 + 3 + 1 + 4 * 32 + 32 + 1 + 1 + 1 + 2 + 2 + 8;

export function feasibility() {
  const proof = PQ_PARAMETERS.signatureBytes; // 2,404 bytes (67 chains + 8 auth nodes + leaf)
  const perTx = SOLANA_LIMITS.txBytes - TX_OVERHEAD_BYTES - 32 - 2; // minus chunk hash + index
  const chunks = Math.ceil(proof / perTx);
  const worstChainHashes = PQ_PARAMETERS.chains * (PQ_PARAMETERS.w - 1);
  const hashes = worstChainHashes + 1 + PQ_PARAMETERS.height + 1; // + leaf, nodes, message digest
  const hashCu = (len: number) => SOLANA_LIMITS.sha256BaseCu + Math.ceil(len / 2);
  // Chain input: domain tag + seed(32) + leaf/chain/step indexes + value(32) ≈ 72 bytes.
  const cu = worstChainHashes * hashCu(72) + hashCu(32 + 67 * 32) + 9 * hashCu(104) + 20_000;
  return {
    proofBytes: proof,
    fitsSingleTx: proof + TX_OVERHEAD_BYTES <= SOLANA_LIMITS.txBytes,
    bytesPerChunk: perTx,
    chunks,
    worstCaseHashes: hashes,
    estimatedVerifyCu: cu,
    fitsComputeBudget: cu <= SOLANA_LIMITS.maxComputeUnits,
    stagingAccountBytes: 8 + 32 * 4 + 8 + 8 + 1 + proof,
    status: "estimate — no on-chain program built or measured" as const,
  };
}

/** Domain-separated action binding: wallet, target, action, genesis, nonce and expiry. */
export type BoundAction = {
  wallet: string;
  target: string; // pool / vault / program
  action: string;
  genesis: string;
  nonce: string;
  expiresAt: number;
};
export function bindingMessage(a: BoundAction) {
  for (const [k, v] of Object.entries(a))
    if (typeof v === "string" && (v.includes("\n") || !v)) throw new Error(`Invalid ${k}`);
  return [
    "qli:v2-experimental:action",
    `wallet:${a.wallet}`,
    `target:${a.target}`,
    `action:${a.action}`,
    `genesis:${a.genesis}`,
    `nonce:${a.nonce}`,
    `expires:${a.expiresAt}`,
  ].join("\n");
}

/** Multi-transaction staging state machine, modelled off-chain for tests of the protocol rules. */
export type Session = {
  root: string;
  commitment: string; // sha256(proof bytes) committed in the open instruction
  chunks: (Uint8Array | null)[];
  expiresAt: number;
  state: "open" | "verified" | "consumed" | "expired" | "rejected";
};
export function serializeProof(p: WotsProof) {
  const out = new Uint8Array(PQ_PARAMETERS.signatureBytes);
  new DataView(out.buffer).setUint32(0, p.leaf, true);
  [...p.signature, ...p.authPath].forEach((h, i) =>
    out.set(Uint8Array.from(h.match(/../g)!.map((x) => parseInt(x, 16))), 4 + i * 32),
  );
  return out;
}
export function openSession(p: WotsProof, now: number, ttl = 300): Session {
  if (ttl <= 0 || ttl > 900) throw new Error("TTL out of bounds");
  const { chunks } = feasibility();
  return {
    root: p.root,
    commitment: hex(sha256(serializeProof(p))),
    chunks: Array(chunks).fill(null),
    expiresAt: now + ttl,
    state: "open",
  };
}
export function uploadChunk(s: Session, index: number, bytes: Uint8Array, now: number) {
  if (s.state !== "open") throw new Error(`Session ${s.state}`);
  if (now > s.expiresAt) {
    s.state = "expired";
    throw new Error("Session expired");
  }
  if (!Number.isInteger(index) || index < 0 || index >= s.chunks.length)
    throw new Error("Chunk index out of range");
  if (s.chunks[index]) throw new Error("Chunk already written");
  if (bytes.length > feasibility().bytesPerChunk) throw new Error("Chunk too large");
  s.chunks[index] = bytes;
}
export function finalize(
  s: Session,
  verify: (bytes: Uint8Array) => boolean,
  consumed: Set<string>,
  now: number,
) {
  if (s.state !== "open") throw new Error(`Session ${s.state}`);
  if (now > s.expiresAt) {
    s.state = "expired";
    throw new Error("Session expired");
  }
  if (s.chunks.some((c) => !c)) throw new Error("Missing chunks");
  const total = s.chunks.reduce((n, c) => n + c!.length, 0);
  const all = new Uint8Array(total);
  let o = 0;
  for (const c of s.chunks) {
    all.set(c!, o);
    o += c!.length;
  }
  if (hex(sha256(all)) !== s.commitment) {
    s.state = "rejected";
    throw new Error("Chunk commitment mismatch");
  }
  const leafKey = `${s.root}:${new DataView(all.buffer).getUint32(0, true)}`;
  if (consumed.has(leafKey)) {
    s.state = "rejected";
    throw new Error("Leaf already consumed (replay)");
  }
  if (!verify(all)) {
    s.state = "rejected";
    throw new Error("Proof invalid");
  }
  consumed.add(leafKey);
  s.state = "verified";
  return { leafKey, commitment: s.commitment, authorizes: false as const };
}
export function chunkProof(p: WotsProof) {
  const b = serializeProof(p);
  const n = feasibility().bytesPerChunk;
  const out: Uint8Array[] = [];
  for (let i = 0; i < b.length; i += n) out.push(b.subarray(i, i + n));
  return out;
}
export const textHash = (s: string) => hex(sha256(utf8(s)));