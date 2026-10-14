// Vault Sentinel: read-only analysis of verified Quantum Vault snapshots. No signing, no
// transaction bytes, no broadcast. Proposals are typed review documents for the Vault SDK only.
import type { VaultAccount, VaultDeployment } from "./quantum-vault";
import { SPEND_WINDOW_SECS } from "./quantum-vault";

export type SentinelStatus =
  { kind: "ready-for-first-vault"; label: string } | { kind: "watching"; label: string };

export function sentinelStatus(d: VaultDeployment | null): SentinelStatus {
  return d
    ? { kind: "watching", label: "Watching verified devnet vaults (on-demand reads)" }
    : {
        kind: "ready-for-first-vault",
        label: "Ready for first devnet vault — no verified deployment, no balances or alerts.",
      };
}
/** The scheduled sweep exists but reads nothing until a verified deployment is configured.
 * Coverage is true only when that config exists; UI must still require observed worker health. */
export const SENTINEL_WORKER_COVERAGE = false; // QUANTUM_VAULT_DEPLOYMENT is null

export type VaultSnapshot = {
  cluster: "devnet";
  vault: string;
  programId: string;
  programSha256: string;
  upgradeAuthority: string | null;
  state: VaultAccount;
  escrowBalance: bigint;
  slot: number;
  observedAt: number; // unix seconds
};

export type SentinelAlert = {
  level: "info" | "warn" | "critical";
  code:
    | "paused"
    | "near-limit"
    | "nonce-jump"
    | "stale-read"
    | "authority-changed"
    | "program-changed"
    | "identity-changed"
    | "slot-regressed"
    | "duplicate";
  detail: string;
  dedupKey: string;
};

export const STALE_SECS = 900;
export const NEAR_LIMIT_BPS = 8000n;

export function windowUsage(s: VaultAccount, now: bigint) {
  const reset = s.windowStart + BigInt(SPEND_WINDOW_SECS);
  const spent = now >= reset ? 0n : s.windowSpent;
  return { spent, remaining: s.dailyLimit - spent, resetsAt: now >= reset ? now : reset };
}

export function formatUnits(v: bigint, decimals: number) {
  const neg = v < 0n;
  const a = neg ? -v : v;
  const base = 10n ** BigInt(decimals);
  const frac = (a % base).toString().padStart(decimals, "0").replace(/0+$/, "");
  return `${neg ? "-" : ""}${a / base}${frac ? "." + frac : ""}`;
}

export function analyze(prev: VaultSnapshot | null, cur: VaultSnapshot, now: number) {
  const out: SentinelAlert[] = [];
  const k = (code: string, x: string | number | bigint) => `${cur.vault}:${code}:${x}`;
  const s = cur.state;
  if (s.paused)
    out.push({
      level: "warn",
      code: "paused",
      detail: "Vault is paused.",
      dedupKey: k("paused", s.epoch),
    });
  const u = windowUsage(s, BigInt(now));
  if (s.dailyLimit > 0n && u.spent * 10000n >= s.dailyLimit * NEAR_LIMIT_BPS)
    out.push({
      level: "info",
      code: "near-limit",
      detail: `Fixed-window usage ≥80% (${formatUnits(u.spent, s.decimals)} of ${formatUnits(s.dailyLimit, s.decimals)}).`,
      dedupKey: k("near", s.windowStart),
    });
  if (now - cur.observedAt > STALE_SECS)
    out.push({
      level: "warn",
      code: "stale-read",
      detail: "Snapshot older than 15 minutes.",
      dedupKey: k("stale", cur.slot),
    });
  if (prev) {
    if (prev.vault !== cur.vault) throw new Error("Snapshots belong to different vaults.");
    if (cur.slot < prev.slot)
      out.push({
        level: "critical",
        code: "slot-regressed",
        detail: "RPC returned an older slot.",
        dedupKey: k("slot", cur.slot),
      });
    if (cur.slot === prev.slot && cur.observedAt === prev.observedAt)
      out.push({
        level: "info",
        code: "duplicate",
        detail: "Duplicate snapshot ignored.",
        dedupKey: k("dup", cur.slot),
      });
    if (cur.upgradeAuthority !== prev.upgradeAuthority)
      out.push({
        level: "critical",
        code: "authority-changed",
        detail: "Program upgrade authority changed.",
        dedupKey: k("auth", cur.upgradeAuthority ?? "none"),
      });
    if (cur.programSha256 !== prev.programSha256 || cur.programId !== prev.programId)
      out.push({
        level: "critical",
        code: "program-changed",
        detail: "Deployed program bytes changed.",
        dedupKey: k("prog", cur.programSha256),
      });
    if (
      !s.mint.equals(prev.state.mint) ||
      !s.owner.equals(prev.state.owner) ||
      !s.destination.equals(prev.state.destination)
    )
      out.push({
        level: "critical",
        code: "identity-changed",
        detail: "Vault mint/owner/destination differ from prior read (bogus account?).",
        dedupKey: k("id", cur.slot),
      });
    if (s.nonce > prev.state.nonce + 1n)
      out.push({
        level: "warn",
        code: "nonce-jump",
        detail: `Nonce advanced by ${s.nonce - prev.state.nonce}.`,
        dedupKey: k("nonce", s.nonce),
      });
  }
  return out;
}

export function dedup(existing: Iterable<string>, alerts: SentinelAlert[]) {
  const seen = new Set(existing);
  return alerts.filter((a) => (seen.has(a.dedupKey) ? false : (seen.add(a.dedupKey), true)));
}

export type VaultProposal = {
  operation: "pause" | "withdraw";
  cluster: "devnet";
  vault: string;
  mint: string;
  recipient: string;
  amount: bigint;
  nonce: bigint;
  epoch: number;
  expiresAt: bigint;
  evidence: string[];
  executable: false;
};

/** Typed review document. Must be rebuilt from a fresh chain read and wallet-signed by the owner. */
export function proposeFromAlerts(
  cur: VaultSnapshot,
  alerts: SentinelAlert[],
  now: number,
): VaultProposal | null {
  const crit = alerts.filter((a) => a.level === "critical");
  if (!crit.length || cur.state.paused) return null;
  return {
    operation: "pause",
    cluster: "devnet",
    vault: cur.vault,
    mint: cur.state.mint.toBase58(),
    recipient: cur.state.destination.toBase58(),
    amount: 0n,
    nonce: cur.state.nonce,
    epoch: cur.state.epoch,
    expiresAt: BigInt(now + 600),
    evidence: crit.map((a) => a.detail),
    executable: false,
  };
}
