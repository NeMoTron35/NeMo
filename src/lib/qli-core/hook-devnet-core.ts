// Browser/SSR-safe Hook Devnet constants (no spl-token import).
import { PublicKey } from "@solana/web3.js";

export const DEVNET_GENESIS = "EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG";
export const MAX_ALLOW = 8;
export type Policy = { paused: boolean; allowlist: boolean; allowed: string[] };

export function validatePolicy(p: Policy): string | null {
  if (p.allowed.length > MAX_ALLOW) return `At most ${MAX_ALLOW} allowlist entries.`;
  if (p.allowlist && p.allowed.length === 0) return "Allowlist mode needs at least one wallet.";
  const seen = new Set<string>();
  for (const a of p.allowed) {
    try {
      new PublicKey(a);
    } catch {
      return `Not a Solana address: ${a.slice(0, 12)}…`;
    }
    if (seen.has(a)) return "Allowlist entries must be unique.";
    seen.add(a);
  }
  return null;
}

export const explorerTx = (sig: string) =>
  `https://explorer.solana.com/tx/${encodeURIComponent(sig)}?cluster=devnet`;

/** Code fingerprint = SHA-256 of program bytes with trailing zero padding removed. Only these are
 *  labelled QLi code; anything else is UNKNOWN THIRD-PARTY unless it equals the owner's reviewed hash. */
export const KNOWN_HOOK_BUILDS: { fingerprint: string; label: string }[] = [
  {
    fingerprint: "81e643e4a6d9efdabc2d2adfec2765651e49a91abfc83f991b068b4ffc434a89",
    label:
      "QLi hook v2.2 (qlihk:db), Agave 2.2.20 / platform-tools v1.48, --arch v0, sandbox build",
  },
];

/** Honest DBC/DAMM v2 limits shown in steps 8–9. */
export const DBC_HOOK_NOTES = [
  "A DBC-created mint's TransferHook authority is the Meteora DBC pool authority PDA, not your wallet. QLi binds your wallet as POLICY authority via qlihk:db, which the one-time mint key co-signs in the pool-creation transaction.",
  "Allowlist mode would refuse transfers to program-owned pool vaults; qlihk:db forces paused=false, allowlist=false. Pausing later blocks swaps, ordinary transfers and probably migration.",
  "No end-to-end DBC swap or migration with this hook has been run on public devnet by this tool; every step is simulated first and only sendable if simulation succeeds.",
  "SDK 1.5.13 migrateToDammV2 attaches no transfer-hook extra accounts; whether migration succeeds for a hook mint is decided only by simulation against a ready pool.",
];
export const explorerAddress = (a: string) =>
  `https://explorer.solana.com/address/${encodeURIComponent(a)}?cluster=devnet`;