// Quantum QLi reference hash-signature primitives. Pure functions; invoked from handlers, never module scope.
// Encoding: Quantum QLi reference v1 (own domain separation). Not an audited production implementation.
import { sha256 as nobleSha256 } from "@noble/hashes/sha256";

export const PQ_PARAMETERS = {
  w: 16,
  hash: "SHA-256",
  height: 8,
  leaves: 256,
  chains: 67,
  n: 32,
  signatureBytes: 4 + 67 * 32 + 8 * 32,
} as const;
import { DOMAINS, WOTS_PROOF_KIND } from "./compatibility";
export { DOMAINS } from "./compatibility";
export type Domain = (typeof DOMAINS)[keyof typeof DOMAINS];

const enc = new TextEncoder();
export const utf8 = (s: string) => enc.encode(s);
export function H(...parts: Uint8Array[]) {
  return nobleSha256(concat(...parts));
}
export async function sha256(bytes: Uint8Array) {
  return nobleSha256(bytes);
}
export function hex(bytes: Uint8Array) {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}
export function fromHex(s: string, len = 32) {
  if (typeof s !== "string" || !new RegExp(`^[a-f0-9]{${len * 2}}$`, "i").test(s))
    throw new Error(`Expected ${len}-byte hexadecimal value.`);
  return new Uint8Array(s.match(/.{2}/g)!.map((x) => parseInt(x, 16)));
}
export function concat(...arrays: Uint8Array[]) {
  const out = new Uint8Array(arrays.reduce((n, a) => n + a.length, 0));
  let o = 0;
  for (const a of arrays) {
    out.set(a, o);
    o += a.length;
  }
  return out;
}
const u32 = (n: number) => new Uint8Array([n >>> 24, (n >>> 16) & 255, (n >>> 8) & 255, n & 255]);
const TAG = utf8(DOMAINS.proof);

/** base-16 digits of the 32-byte digest plus 3-digit checksum = 67 chain targets. */
export function digits(digest: Uint8Array) {
  const values = Array.from(digest).flatMap((b) => [b >> 4, b & 15]);
  let checksum = values.reduce((s, v) => s + 15 - v, 0);
  const suffix = [0, 0, 0];
  for (let i = 2; i >= 0; i--) {
    suffix[i] = checksum % 16;
    checksum = Math.floor(checksum / 16);
  }
  return [...values, ...suffix];
}
export function chain(
  x: Uint8Array,
  seed: Uint8Array,
  leaf: number,
  index: number,
  start: number,
  end: number,
) {
  let c = x;
  for (let j = start; j < end; j++) c = H(TAG, seed, u32(leaf), new Uint8Array([index, j]), c);
  return c;
}
export function leafHash(seed: Uint8Array, leaf: number, pks: Uint8Array[]) {
  return H(TAG, utf8("leaf"), seed, u32(leaf), ...pks);
}
export function nodeHash(
  seed: Uint8Array,
  level: number,
  index: number,
  l: Uint8Array,
  r: Uint8Array,
) {
  return H(TAG, utf8("node"), seed, new Uint8Array([level]), u32(index), l, r);
}
export function messageDigest(domain: Domain, message: string) {
  return H(utf8(domain), new Uint8Array([0]), utf8(message));
}

export type WotsProof = {
  kind: typeof WOTS_PROOF_KIND;
  domain: Domain;
  label: "reference" | "public-demo";
  message: string;
  leaf: number;
  publicSeed: string;
  root: string;
  signature: string[];
  authPath: string[];
};

export type ChainTrace = { index: number; digit: number; steps: number };
export type VerifyResult = {
  valid: boolean;
  digest: string;
  leafHash: string;
  root: string;
  chains: ChainTrace[];
  levels: { level: number; side: "L" | "R"; node: string }[];
};

export function verifyWotsProof(proof: WotsProof): VerifyResult {
  if (!proof || proof.kind !== WOTS_PROOF_KIND) throw new Error("Unsupported proof kind.");
  if (!Object.values(DOMAINS).includes(proof.domain))
    throw new Error("Unknown Quantum QLi domain separation string.");
  if (!Number.isInteger(proof.leaf) || proof.leaf < 0 || proof.leaf >= PQ_PARAMETERS.leaves)
    throw new Error("Leaf index out of range (0–255).");
  if (!Array.isArray(proof.signature) || proof.signature.length !== PQ_PARAMETERS.chains)
    throw new Error("Signature must contain exactly 67 chains.");
  if (!Array.isArray(proof.authPath) || proof.authPath.length !== PQ_PARAMETERS.height)
    throw new Error("Authentication path must contain 8 levels.");
  if (typeof proof.message !== "string" || !proof.message || proof.message.length > 8192)
    throw new Error("Message missing or too large.");
  fromHex(proof.root);
  const seed = fromHex(proof.publicSeed);
  const digest = messageDigest(proof.domain, proof.message);
  const d = digits(digest);
  const pks = proof.signature.map((s, i) => chain(fromHex(s), seed, proof.leaf, i, d[i]!, 15));
  let node = leafHash(seed, proof.leaf, pks);
  const lh = hex(node);
  const levels: VerifyResult["levels"] = [];
  let idx = proof.leaf;
  for (let level = 0; level < 8; level++) {
    const sib = fromHex(proof.authPath[level]!);
    const right = idx & 1;
    node = right
      ? nodeHash(seed, level, idx >> 1, sib, node)
      : nodeHash(seed, level, idx >> 1, node, sib);
    levels.push({ level, side: right ? "R" : "L", node: hex(node) });
    idx >>= 1;
  }
  return {
    valid: hex(node) === proof.root.toLowerCase(),
    digest: hex(digest),
    leafHash: lh,
    root: hex(node),
    chains: d.map((digit, index) => ({ index, digit, steps: 15 - digit })),
    levels,
  };
}
export function proofBytes(proof: WotsProof) {
  return 4 + proof.signature.length * 32 + proof.authPath.length * 32;
}

// Compatibility aliases used by older call sites/tests.
export type DemoProof = WotsProof;
export async function verifyDemoProof(p: WotsProof) {
  return verifyWotsProof(p);
}
export async function makeDemoProof(
  domain: Domain = DOMAINS.launch,
  message = "Quantum QLi / public demonstration / not a live launch attestation",
) {
  const { publicDemoKeys, signLeaf } = await import("./identity");
  const keys = await publicDemoKeys();
  return signLeaf(keys, 42, domain, message, "public-demo");
}
