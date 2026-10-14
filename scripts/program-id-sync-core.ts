// Public-key-only program id configuration for the Mode B vault. Pure text transforms, tested.
// Each SBF compilation carries exactly one declare_id!, selected by the same `mainnet` feature that
// freezes the genesis constant, so per-network ids are frozen per build from ONE source tree.
import { PublicKey } from "@solana/web3.js";

export type SyncNetwork = "devnet" | "mainnet-beta";
export const MAINNET_UNSET_ID = "QLiMainnetProgramUNSET111111111111111111111";
export const DEVNET_PLACEHOLDER_ID = "9EqcFT8B8NTkTZCXRFTEZxr7zUz3zXHrWgGZYJvViJ4T";
const TAG: Record<SyncNetwork, string> = {
  devnet: "qli:program-id:devnet",
  "mainnet-beta": "qli:program-id:mainnet-beta",
};
const SECTION: Record<SyncNetwork, string> = { devnet: "devnet", "mainnet-beta": "mainnet" };
const NAME = "quantum_pq_first_buy_vault";
const other = (n: SyncNetwork): SyncNetwork => (n === "devnet" ? "mainnet-beta" : "devnet");

export class SyncError extends Error {}
const fail = (m: string): never => {
  throw new SyncError(m);
};

const lineRe = (n: SyncNetwork) =>
  new RegExp(`^declare_id!\\("([^"]*)"\\);\\s*//[ \\t]*${TAG[n]}[ \\t]*$`, "m");
const sectionRe = (n: SyncNetwork) =>
  new RegExp(
    `(^\\[programs\\.${SECTION[n]}\\]\\s*\\n(?:[^\\[\\n].*\\n|\\n)*?${NAME}\\s*=\\s*")([^"]*)(")`,
    "m",
  );

export function readProgramIds(libRs: string, toml: string) {
  const out = {} as Record<SyncNetwork, string>;
  for (const n of ["devnet", "mainnet-beta"] as const) {
    const all = libRs.match(new RegExp(lineRe(n).source, "gm")) ?? [];
    if (all.length !== 1) fail(`Expected exactly one tagged declare_id! for ${n}.`);
    const lib = libRs.match(lineRe(n))![1]!;
    const t = toml.match(sectionRe(n))?.[2];
    if (!t) fail(`Anchor.toml has no [programs.${SECTION[n]}] ${NAME} entry.`);
    if (t !== lib) fail(`${n}: declare_id! and Anchor.toml disagree.`);
    out[n] = lib;
  }
  return out;
}

export function isUnset(id: string) {
  return id === MAINNET_UNSET_ID || /UNSET/.test(id);
}

/** Owner public key only. Rejects secrets, placeholders, non-canonical keys and cross-network reuse. */
export function validateOwnerProgramId(id: string | undefined): string {
  if (!id) return fail("--program-id <OWNER_PUBLIC_KEY> is required.");
  if (/[[\],\s]/.test(id) || id.length > 44) fail("Pass a public key only, never keypair content.");
  if (isUnset(id) || id === DEVNET_PLACEHOLDER_ID || id === "11111111111111111111111111111111")
    fail("Program id is a placeholder.");
  let k: PublicKey;
  try {
    k = new PublicKey(id);
  } catch {
    return fail("Program id is not valid base58.");
  }
  if (k.toBase58() !== id) fail("Program id is not canonical base58.");
  return id;
}

export function syncProgramId(libRs: string, toml: string, network: SyncNetwork, id: string) {
  validateOwnerProgramId(id);
  const ids = readProgramIds(libRs, toml);
  if (ids[other(network)] === id)
    fail(`Program id is already used for ${other(network)}; ids must differ per network.`);
  const nextLib = libRs.replace(lineRe(network), `declare_id!("${id}"); // ${TAG[network]}`);
  const nextToml = toml.replace(sectionRe(network), `$1${id}$3`);
  const after = readProgramIds(nextLib, nextToml);
  if (after[network] !== id || after[other(network)] !== ids[other(network)])
    fail("Sync produced an unexpected result; nothing written.");
  return { libRs: nextLib, toml: nextToml, changed: nextLib !== libRs || nextToml !== toml };
}