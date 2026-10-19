import {
  WOTS_PROOF_KIND,
  LEAF_LEDGER_PREFIX,
  IDENTITY_MEMO_PREFIX,
  POSSESSION_MESSAGE_PREFIX,
  REGISTRATION_MESSAGE_PREFIX,
  PUBLIC_DEMO_INPUT,
} from "./compatibility";
// NEMOTRON3.5 local reference identity. Secret material lives only in memory of the caller; nothing here persists secrets.
import { hkdf } from "@noble/hashes/hkdf";
import { sha256 as nobleSha256 } from "@noble/hashes/sha256";
import { scryptAsync } from "@noble/hashes/scrypt";
import { PublicKey, TransactionInstruction, Transaction } from "@solana/web3.js";
import {
  DOMAINS,
  H,
  chain,
  concat,
  digits,
  hex,
  leafHash,
  messageDigest,
  nodeHash,
  utf8,
  PQ_PARAMETERS,
  type Domain,
  type WotsProof,
} from "./pq";

export const SCRYPT_PARAMS = { N: 2 ** 15, r: 8, p: 1, dkLen: 32 } as const;
export const MEMO_PROGRAM_ID = "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr";
export const QTK_PREFIX = "qtk1";

export function derivationMessage(wallet: string, network: string) {
  return [
    "Quantum QLi Identity Derivation",
    `domain: ${DOMAINS.identity}`,
    `wallet: ${wallet}`,
    `network: ${network}`,
    "purpose: derive a local hash-based identity root",
    "This signature is not a transaction and moves no funds.",
    "Only sign this identity derivation message in Quantum QLi.",
  ].join("\n");
}

export type SecretKeys = { skSeed: Uint8Array; publicSeed: Uint8Array };
export type IdentityTree = {
  keys: SecretKeys;
  leaves: Uint8Array[];
  levels: Uint8Array[][];
  root: Uint8Array;
};
export type PublicIdentity = {
  address: string;
  root: string;
  publicSeed: string;
  height: 8;
  leaves: 256;
  label: "reference" | "public-demo";
  wallet: string | null;
};

/** wallet signature (+ optional scrypt passphrase hardening) → HKDF-SHA256 → skSeed ‖ publicSeed */
export async function deriveKeys(
  walletSignature: Uint8Array,
  passphrase?: string,
): Promise<SecretKeys> {
  if (walletSignature.length < 32) throw new Error("Wallet signature too short.");
  let ikm = nobleSha256(walletSignature);
  if (passphrase)
    ikm = await scryptAsync(
      utf8(passphrase.normalize("NFKC")),
      concat(utf8(DOMAINS.identity), ikm),
      SCRYPT_PARAMS,
    );
  const okm = hkdf(nobleSha256, ikm, utf8(DOMAINS.identity), utf8("qtk-seed"), 64);
  return { skSeed: okm.slice(0, 32), publicSeed: okm.slice(32) };
}
export async function publicDemoKeys(): Promise<SecretKeys> {
  const okm = hkdf(
    nobleSha256,
    utf8(PUBLIC_DEMO_INPUT),
    utf8(DOMAINS.identity),
    utf8("qtk-demo"),
    64,
  );
  return { skSeed: okm.slice(0, 32), publicSeed: okm.slice(32) };
}
const u32 = (n: number) => new Uint8Array([n >>> 24, (n >>> 16) & 255, (n >>> 8) & 255, n & 255]);
function chainSecret(keys: SecretKeys, leaf: number, i: number) {
  return H(utf8("qtk-sk"), keys.skSeed, u32(leaf), new Uint8Array([i]));
}
function leafPublic(keys: SecretKeys, leaf: number) {
  const pks: Uint8Array[] = [];
  for (let i = 0; i < PQ_PARAMETERS.chains; i++)
    pks.push(chain(chainSecret(keys, leaf, i), keys.publicSeed, leaf, i, 0, 15));
  return leafHash(keys.publicSeed, leaf, pks);
}
/** Builds all 256 leaves in yielded batches (~257k SHA-256 evaluations). */
export async function buildTree(
  keys: SecretKeys,
  onProgress?: (done: number) => void,
): Promise<IdentityTree> {
  const leaves: Uint8Array[] = [];
  for (let l = 0; l < PQ_PARAMETERS.leaves; l++) {
    leaves.push(leafPublic(keys, l));
    if (l % 16 === 15) {
      onProgress?.(l + 1);
      await new Promise((r) => setTimeout(r, 0));
    }
  }
  const levels: Uint8Array[][] = [leaves];
  for (let level = 0; level < 8; level++) {
    const prev = levels[level]!;
    const next: Uint8Array[] = [];
    for (let i = 0; i < prev.length; i += 2)
      next.push(nodeHash(keys.publicSeed, level, i >> 1, prev[i]!, prev[i + 1]!));
    levels.push(next);
  }
  return { keys, leaves, levels, root: levels[8]![0]! };
}
export function qtkAddress(root: Uint8Array, publicSeed: Uint8Array) {
  const h = H(utf8(DOMAINS.identity), utf8("address"), root, publicSeed).slice(0, 20);
  const alphabet = "qpzry9x8gf2tvdw0s3jn54khce6mua7l";
  let bits = 0,
    value = 0,
    out = "";
  for (const b of h) {
    value = (value << 8) | b;
    bits += 8;
    while (bits >= 5) {
      out += alphabet[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  const check = hex(H(utf8(QTK_PREFIX), utf8(out))).slice(0, 6);
  return `${QTK_PREFIX}${out}${check}`;
}
export function isQtkAddress(s: string) {
  return (
    /^qtk1[qpzry9x8gf2tvdw0s3jn54khce6mua7l]{32}[a-f0-9]{6}$/.test(s) &&
    hex(H(utf8(QTK_PREFIX), utf8(s.slice(4, 36)))).slice(0, 6) === s.slice(36)
  );
}
export function publicIdentity(
  tree: IdentityTree,
  label: PublicIdentity["label"],
  wallet: string | null,
): PublicIdentity {
  return {
    address: qtkAddress(tree.root, tree.keys.publicSeed),
    root: hex(tree.root),
    publicSeed: hex(tree.keys.publicSeed),
    height: 8,
    leaves: 256,
    label,
    wallet,
  };
}
function authPath(tree: IdentityTree, leaf: number) {
  const path: string[] = [];
  let idx = leaf;
  for (let level = 0; level < 8; level++) {
    path.push(hex(tree.levels[level]![idx ^ 1]!));
    idx >>= 1;
  }
  return path;
}
let demoTreeCache: IdentityTree | undefined;
/** One-time signature over `message` with `leaf`. Caller MUST reserve the leaf in a ledger first. */
export async function signLeaf(
  source: SecretKeys | IdentityTree,
  leaf: number,
  domain: Domain,
  message: string,
  label: WotsProof["label"] = "reference",
): Promise<WotsProof> {
  let tree: IdentityTree;
  if ("root" in source) tree = source;
  else if (label === "public-demo") tree = demoTreeCache ??= await buildTree(source);
  else tree = await buildTree(source);
  const d = digits(messageDigest(domain, message));
  const signature = d.map((digit, i) =>
    hex(chain(chainSecret(tree.keys, leaf, i), tree.keys.publicSeed, leaf, i, 0, digit)),
  );
  return {
    kind: WOTS_PROOF_KIND,
    domain,
    label,
    message,
    leaf,
    publicSeed: hex(tree.keys.publicSeed),
    root: hex(tree.root),
    signature,
    authPath: authPath(tree, leaf),
  };
}

/** Append-only one-time leaf ledger. Persists ONLY used indexes + public identity metadata. */
export type LeafLedger = { root: string; used: number[]; purposes: Record<number, string> };
const STORE = LEAF_LEDGER_PREFIX;
export function createLeafLedger(root: string, storage?: Pick<Storage, "getItem" | "setItem">) {
  let state: LeafLedger = { root, used: [], purposes: {} };
  try {
    const raw = storage?.getItem(STORE + root);
    if (raw) {
      const p = JSON.parse(raw);
      if (Array.isArray(p.used))
        state = {
          root,
          used: p.used.filter(
            (n: unknown) => Number.isInteger(n) && (n as number) >= 0 && (n as number) < 256,
          ),
          purposes: p.purposes ?? {},
        };
    }
  } catch {
    /* corrupted ledger ignored */
  }
  const save = () => storage?.setItem(STORE + root, JSON.stringify(state));
  return {
    get state() {
      return state;
    },
    isUsed: (leaf: number) => state.used.includes(leaf),
    next: () => {
      for (let i = 0; i < 256; i++) if (!state.used.includes(i)) return i;
      return -1;
    },
    remaining: () => 256 - state.used.length,
    reserve(leaf: number, purpose: string) {
      if (!Number.isInteger(leaf) || leaf < 0 || leaf > 255) throw new Error("Leaf out of range.");
      if (state.used.includes(leaf))
        throw new Error(`Leaf #${leaf} already consumed. One-time leaves can never be reused.`);
      state = {
        ...state,
        used: [...state.used, leaf].sort((a, b) => a - b),
        purposes: { ...state.purposes, [leaf]: purpose },
      };
      save();
      return leaf;
    },
  };
}
export type LeafLedgerApi = ReturnType<typeof createLeafLedger>;

export function anchorMemo(id: Pick<PublicIdentity, "address" | "root">) {
  return `${IDENTITY_MEMO_PREFIX}${id.address}:${id.root}`;
}
/** Unsigned SPL Memo instruction; routed through the shared prepare → review → simulate → wallet flow. */
export function buildAnchorTransaction(
  id: Pick<PublicIdentity, "address" | "root">,
  signer: PublicKey,
) {
  return new Transaction().add(
    new TransactionInstruction({
      programId: new PublicKey(MEMO_PROGRAM_ID),
      keys: [{ pubkey: signer, isSigner: true, isWritable: false }],
      data: new TextEncoder().encode(anchorMemo(id)) as unknown as Buffer,
    }),
  );
}
export function challengeMessage(id: PublicIdentity, nonce: string, leaf: number) {
  return `${POSSESSION_MESSAGE_PREFIX}${id.address}:${id.root}:leaf=${leaf}:nonce=${nonce}`;
}
export function registrationMessage(id: PublicIdentity) {
  return `${REGISTRATION_MESSAGE_PREFIX}${id.address}:${id.root}:${id.publicSeed}:wallet=${id.wallet ?? "none"}`;
}
