import { DOMAINS } from "./compatibility";
import { verifyWotsProof, type WotsProof } from "./pq";
import { launchDigest } from "./launch-draft";
import type { LaunchDraft } from "./validation";

export type AttestationIdentity = { root: string; publicSeed: string };
export type AttestationResult =
  { ok: true; leaf: number; immutable: boolean; covers: string } | { ok: false; reason: string };

/** Fields the v1 launch digest commits to. Curve, fees and liquidity are NOT covered. */
export const ATTESTATION_COVERS =
  "name, symbol, metadata URI, decimals, supply, quote mint, DBC program, DAMM v2 migration";

/**
 * Verifies the Attestation Seal inside fetched metadata: a reference-label WOTS/Merkle
 * proof in the launch domain, whose message is exactly this draft's canonical launch data
 * and whose recomputed root and public seed equal the open identity.
 */
export function verifyLaunchAttestation(
  meta: Record<string, unknown>,
  d: LaunchDraft,
  identity: AttestationIdentity | null,
): AttestationResult {
  if (!identity) return { ok: false, reason: "Open your Quantum Identity first." };
  const ext = (meta["extensions"] as Record<string, { proof?: WotsProof }> | undefined)?.[
    DOMAINS.launch
  ];
  const proof = ext?.proof;
  if (!proof || typeof proof !== "object")
    return { ok: false, reason: "Metadata has no Attestation Seal proof." };
  if (proof.domain !== DOMAINS.launch)
    return { ok: false, reason: "Seal is not in the launch domain." };
  if (proof.label !== "reference")
    return { ok: false, reason: "Public-demo seals cannot attest a launch." };
  if (proof.message !== launchDigest(d).canonical)
    return { ok: false, reason: "Seal was made for different launch data. Re-seal and re-upload." };
  if (
    proof.root.toLowerCase() !== identity.root.toLowerCase() ||
    proof.publicSeed.toLowerCase() !== identity.publicSeed.toLowerCase()
  )
    return { ok: false, reason: "Seal belongs to a different identity." };
  let valid = false;
  try {
    valid = verifyWotsProof(proof).valid;
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : "Malformed seal." };
  }
  if (!valid) return { ok: false, reason: "Seal signature does not verify against the root." };
  return {
    ok: true,
    leaf: proof.leaf,
    immutable: /^https:\/\/(arweave\.net\/|[^/]+\/ipfs\/)/.test(d.metadata),
    covers: ATTESTATION_COVERS,
  };
}

/** Everything a built transaction depends on. Any change invalidates the review. */
export function launchFingerprint(x: {
  form: unknown;
  mode: string;
  canonical: string;
  network: string;
  rpc: string;
  account: string | null;
  wallet: string | null;
  identityRoot: string | null;
}) {
  return JSON.stringify(x);
}
export function canSignReviewed(builtFingerprint: string | null, current: string) {
  return builtFingerprint !== null && builtFingerprint === current;
}