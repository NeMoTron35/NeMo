// Quantum Authorization v1: application-level WOTS/Merkle authorization intents.
// APPLICATION-LEVEL ONLY — not on-chain enforced. Other clients and directly signed transactions
// bypass this gate. Nothing here signs Solana transactions, sends, or touches the network.
import { sha256 as nobleSha256 } from "@noble/hashes/sha256";
import { AUTHORIZATION_MESSAGE_PREFIX, DOMAINS, WOTS_PROOF_KIND } from "./compatibility";
import { hex, utf8, verifyWotsProof, type WotsProof } from "./pq";
import { signLeaf, type IdentityTree, type PublicIdentity } from "./identity";

export const AUTHORIZATION_LABEL =
  "Application-level authorization only — not on-chain enforced. Other clients and directly signed transactions can bypass this additional gate.";
export const AUTHZ_VERSION = 1;
export const AUTHZ_OPERATIONS = ["claim", "buyback", "burn"] as const;
export type AuthzOperation = (typeof AUTHZ_OPERATIONS)[number];

/** Fixed key order = canonical serialization order. Every value is a bounded string. */
export const INTENT_KEYS = [
  "v",
  "operation",
  "network",
  "genesis",
  "wallet",
  "identityAddress",
  "identityRoot",
  "pool",
  "creator",
  "mint",
  "recipient",
  "amountBase",
  "maxSpendLamports",
  "slippageBps",
  "minOutBase",
  "txMessageSha256",
  "blockhash",
  "lastValidBlockHeight",
  "issuedAt",
  "expiresAt",
  "nonce",
] as const;
export type AuthorizationIntent = Record<(typeof INTENT_KEYS)[number], string>;

const INT = /^(0|[1-9]\d{0,38})$/;
const B58 = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const HEX64 = /^[0-9a-f]{64}$/;

function check(intent: AuthorizationIntent) {
  const keys = Object.keys(intent);
  if (keys.length !== INTENT_KEYS.length || INTENT_KEYS.some((k) => typeof intent[k] !== "string"))
    throw new Error("Intent fields are incomplete or not strings.");
  if (intent.v !== String(AUTHZ_VERSION)) throw new Error("Unsupported intent version.");
  if (!(AUTHZ_OPERATIONS as readonly string[]).includes(intent.operation))
    throw new Error("Unsupported operation.");
  if (!["mainnet-beta", "devnet", "localnet"].includes(intent.network))
    throw new Error("Unsupported network.");
  for (const k of [
    "genesis",
    "wallet",
    "pool",
    "creator",
    "mint",
    "recipient",
    "blockhash",
  ] as const)
    if (!B58.test(intent[k])) throw new Error(`Field ${k} must be a base58 address/hash.`);
  for (const k of ["amountBase", "lastValidBlockHeight", "issuedAt", "expiresAt"] as const)
    if (!INT.test(intent[k])) throw new Error(`Field ${k} must be a non-negative integer.`);
  for (const k of ["maxSpendLamports", "slippageBps", "minOutBase"] as const)
    if (intent[k] !== "" && !INT.test(intent[k])) throw new Error(`Field ${k} must be an integer.`);
  if (
    !HEX64.test(intent.txMessageSha256) ||
    !HEX64.test(intent.identityRoot) ||
    !HEX64.test(intent.nonce)
  )
    throw new Error("Digest, root and nonce must be 32-byte lowercase hex.");
  if (!/^qtk1[a-z0-9]{38}$/.test(intent.identityAddress))
    throw new Error("Invalid identity address.");
}

/** Deterministic canonical JSON: fixed key order, validated string values. */
export function canonicalIntent(intent: AuthorizationIntent) {
  check(intent);
  return JSON.stringify(Object.fromEntries(INTENT_KEYS.map((k) => [k, intent[k]])));
}
export function intentDigest(intent: AuthorizationIntent) {
  return hex(nobleSha256(utf8(`${AUTHORIZATION_MESSAGE_PREFIX}${canonicalIntent(intent)}`)));
}
/** Exact message signed by the WOTS leaf: prefix ‖ digest ‖ newline ‖ canonical intent. */
export function intentMessage(intent: AuthorizationIntent) {
  return `${AUTHORIZATION_MESSAGE_PREFIX}${intentDigest(intent)}\n${canonicalIntent(intent)}`;
}
export function txMessageSha256(reviewedMessage: Uint8Array) {
  return hex(nobleSha256(reviewedMessage));
}
export function randomNonce() {
  const b = new Uint8Array(32);
  crypto.getRandomValues(b);
  return hex(b);
}

// ---------------- Policy ----------------
export type AuthorizationPolicy = {
  enabled: boolean;
  operations: Record<AuthzOperation, boolean>;
  /** Buyback only: require proof when spend >= threshold. 0 = always. */
  buybackThresholdLamports: number;
  expirySeconds: number;
};
export const POLICY_STORAGE_KEY = "qli.authorization.policy.v1";
export const EXPIRY_MIN_S = 30;
export const EXPIRY_MAX_S = 900;
export const THRESHOLD_MAX_LAMPORTS = 10_000_000_000; // 10 SOL, the Flywheel hard cap
export const defaultPolicy: AuthorizationPolicy = {
  enabled: false,
  operations: { claim: true, buyback: true, burn: true },
  buybackThresholdLamports: 0,
  expirySeconds: 120,
};
/** Validates and bounds a policy. Throws on invalid input rather than silently weakening it. */
export function parsePolicy(raw: unknown): AuthorizationPolicy {
  const p = raw as Partial<AuthorizationPolicy> | null;
  if (!p || typeof p !== "object" || typeof p.enabled !== "boolean")
    throw new Error("Invalid policy.");
  const ops = p.operations as Record<string, unknown> | undefined;
  if (!ops || AUTHZ_OPERATIONS.some((o) => typeof ops[o] !== "boolean"))
    throw new Error("Invalid policy operations.");
  const t = p.buybackThresholdLamports;
  const e = p.expirySeconds;
  if (!Number.isSafeInteger(t) || (t as number) < 0 || (t as number) > THRESHOLD_MAX_LAMPORTS)
    throw new Error("Threshold out of range (0–10 SOL).");
  if (!Number.isSafeInteger(e) || (e as number) < EXPIRY_MIN_S || (e as number) > EXPIRY_MAX_S)
    throw new Error(`Expiration must be ${EXPIRY_MIN_S}–${EXPIRY_MAX_S} seconds.`);
  return {
    enabled: p.enabled,
    operations: { claim: !!ops["claim"], buyback: !!ops["buyback"], burn: !!ops["burn"] },
    buybackThresholdLamports: t as number,
    expirySeconds: e as number,
  };
}
export function loadPolicy(storage?: Pick<Storage, "getItem">): {
  policy: AuthorizationPolicy;
  error: string | null;
} {
  const raw = storage?.getItem(POLICY_STORAGE_KEY);
  if (!raw) return { policy: defaultPolicy, error: null };
  try {
    return { policy: parsePolicy(JSON.parse(raw)), error: null };
  } catch {
    // Fail closed: a corrupted stored policy requires proofs for every operation.
    return {
      policy: { ...defaultPolicy, enabled: true },
      error:
        "Stored policy was unreadable; proofs are required for all operations until you save a valid policy.",
    };
  }
}
export function requiresAuthorization(
  policy: AuthorizationPolicy,
  operation: AuthzOperation,
  spendLamports: bigint,
) {
  if (!policy.enabled || !policy.operations[operation]) return false;
  if (operation === "buyback") return spendLamports >= BigInt(policy.buybackThresholdLamports);
  return true;
}

// ---------------- Records ----------------
export type AuthorizationStatus =
  "created" | "verified-locally" | "expired" | "invalidated" | "rejected" | "executed-on-chain";
export type AuthorizationRecord = {
  id: string; // nonce
  intent: AuthorizationIntent;
  digest: string;
  proof: WotsProof;
  status: AuthorizationStatus;
  reason: string;
  signature: string | null; // Solana tx signature, only after confirmation
};

/** Signs an intent with the next unused leaf. Reserves the leaf BEFORE signing; never reuses. */
export async function createAuthorization(p: {
  intent: AuthorizationIntent;
  identity: PublicIdentity;
  tree: IdentityTree | null;
  nextLeaf: () => number;
  reserveLeaf: (leaf: number, purpose: string) => number;
}): Promise<AuthorizationRecord> {
  if (p.identity.label !== "reference" || !p.tree)
    throw new Error("The public demo identity cannot authorize live actions.");
  if (p.intent.identityRoot !== p.identity.root || p.intent.identityAddress !== p.identity.address)
    throw new Error("Intent is not bound to the open identity.");
  const message = intentMessage(p.intent); // validates
  const leaf = p.nextLeaf();
  if (leaf < 0) throw new Error("All 256 one-time leaves are consumed. Derive a new identity.");
  p.reserveLeaf(leaf, `authorization:${p.intent.operation}`);
  const proof = await signLeaf(p.tree, leaf, DOMAINS.proof, message, "reference");
  return {
    id: p.intent.nonce,
    intent: p.intent,
    digest: intentDigest(p.intent),
    proof,
    status: "created",
    reason: "",
    signature: null,
  };
}

/**
 * Fail-closed verification against the CURRENT expected intent (rebuilt from live state).
 * Returns null when valid, otherwise a precise rejection reason.
 */
export function verifyAuthorization(
  rec: AuthorizationRecord | null,
  expected: Omit<AuthorizationIntent, "issuedAt" | "expiresAt" | "nonce">,
  identity: PublicIdentity | null,
  nowSec: number,
  usedNonces: ReadonlySet<string>,
): string | null {
  if (!rec) return "No authorization proof.";
  if (rec.status !== "created" && rec.status !== "verified-locally")
    return `Authorization is ${rec.status}.`;
  if (usedNonces.has(rec.intent.nonce)) return "Authorization already used (replay refused).";
  if (!identity) return "No Quantum Identity open.";
  if (identity.label !== "reference" || rec.proof.label !== "reference")
    return "Public demo identity cannot authorize live actions.";
  const proof = rec.proof;
  if (proof.kind !== WOTS_PROOF_KIND) return "Wrong proof kind.";
  if (proof.domain !== DOMAINS.proof) return "Wrong domain separation.";
  if (proof.root !== identity.root || rec.intent.identityRoot !== identity.root)
    return "Proof belongs to a different identity.";
  let message: string;
  try {
    message = intentMessage(rec.intent);
  } catch (e) {
    return `Malformed intent: ${(e as Error).message}`;
  }
  if (proof.message !== message || rec.digest !== intentDigest(rec.intent))
    return "Signed message does not match the intent.";
  for (const k of Object.keys(expected) as (keyof typeof expected)[])
    if (rec.intent[k] !== expected[k]) return `Mismatch: ${k} changed since authorization.`;
  if (nowSec >= Number(rec.intent.expiresAt)) return "Authorization expired.";
  if (Number(rec.intent.issuedAt) > nowSec + 60) return "Authorization issued in the future.";
  try {
    if (!verifyWotsProof(proof).valid) return "WOTS/Merkle proof is invalid.";
  } catch (e) {
    return `Proof rejected: ${(e as Error).message}`;
  }
  return null;
}

/** Public proof export. Contains only public material (no seeds, no tree, no secrets). */
export function exportAuthorization(rec: AuthorizationRecord) {
  return JSON.stringify(
    {
      notice: AUTHORIZATION_LABEL,
      status: rec.status,
      intentDigest: rec.digest,
      intent: rec.intent,
      solanaSignature: rec.signature,
      proof: rec.proof,
    },
    null,
    2,
  );
}
export const STATUS_LABEL: Record<AuthorizationStatus, string> = {
  created: "Created",
  "verified-locally": "Verified locally",
  expired: "Expired",
  invalidated: "Invalidated",
  rejected: "Rejected",
  "executed-on-chain": "Executed on-chain",
};