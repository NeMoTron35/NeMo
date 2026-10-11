// Pure, testable rules for persisted Vault Sentinel monitoring. No I/O, no signing.
import type { VaultAccount, VaultDeployment } from "./quantum-vault";

export const VAULT_QUOTA = 3;
export const VAULT_INTERVAL_S = 600;
export const U64_RE = /^[0-9]{1,20}$/;

export type MonitorAvailability =
  { available: false; reason: string } | { available: true; deployment: VaultDeployment };

/** Registration/monitoring is unavailable until a source-reviewed deployment config exists. */
export function monitorAvailability(d: VaultDeployment | null): MonitorAvailability {
  if (!d)
    return {
      available: false,
      reason:
        "No verified Quantum Vault devnet deployment is configured. Registration and monitoring are unavailable.",
    };
  if (d.cluster !== "devnet")
    return { available: false, reason: "Only devnet deployments are supported." };
  return { available: true, deployment: d };
}

/** Server-side ownership rule: the signed-session wallet must equal the on-chain vault owner. */
export function assertOwnedVault(
  sessionWallet: string,
  sessionNetwork: string,
  state: Pick<VaultAccount, "owner" | "version">,
  expectedVersion: number,
) {
  if (sessionNetwork !== "devnet")
    throw new Error("Vault monitoring is devnet only. Sign in on devnet.");
  if (state.version !== expectedVersion) throw new Error("Unsupported vault account version.");
  if (state.owner.toBase58() !== sessionWallet)
    throw new Error("Vault owner is not your signed-in wallet.");
}

/** Monotonic confirmed slots: older or equal slots are ignored (reorg/lagging RPC). */
export function acceptSlot(lastSlot: number | null, slot: number) {
  return lastSlot === null || slot > lastSlot;
}

export function u64String(v: bigint) {
  if (v < 0n || v > (1n << 64n) - 1n) throw new Error("u64 out of range");
  return v.toString();
}

export type StoredMonitor = {
  program_id: string;
  program_sha256: string;
  upgrade_authority: string | null;
  mint: string;
  escrow: string;
  destination: string;
  owner: string;
};
/** Drift vs the registration snapshot is a critical anomaly, never silently re-baselined. */
export function driftFindings(reg: StoredMonitor, now: StoredMonitor) {
  const out: string[] = [];
  for (const k of Object.keys(reg) as (keyof StoredMonitor)[])
    if (reg[k] !== now[k]) out.push(`${k} changed since registration`);
  return out;
}