// Central, typed per-network capability policy. Fail closed: anything not listed is denied.
import { HOOK_DEVNET_DEPLOYMENT, type HookDeployment } from "./hook-launch-plan";

export type CapNetwork = "devnet" | "mainnet-beta";
export type Capability =
  | "wallet-connect"
  | "read-only-rpc"
  | "standard-dbc-launch"
  | "hook-program-deploy"
  | "hook-mint-policy"
  | "hook-dbc-launch"
  | "hook-swap"
  | "hook-migration"
  | "quantum-vault-deposit";

export type Gate = { allowed: boolean; reason: string };

/** Mainnet hook flags are compile-time false; lifting them needs audit + real devnet evidence. */
export const MAINNET_CUSTOM_HOOKS_ENABLED = false as const;

export function capability(
  cap: Capability,
  network: CapNetwork,
  deployment: HookDeployment | null = HOOK_DEVNET_DEPLOYMENT,
): Gate {
  switch (cap) {
    case "wallet-connect":
    case "read-only-rpc":
      return { allowed: true, reason: "Read-only." };
    case "standard-dbc-launch":
      return {
        allowed: true,
        reason:
          network === "mainnet-beta"
            ? "Real SOL: genesis, allowlist, simulation, 0.1 SOL preflight threshold (heuristic, not an on-chain cap) and separate acknowledgement."
            : "Devnet: genesis, allowlist, simulation and wallet approval.",
      };
    case "hook-program-deploy":
      return {
        allowed: false,
        reason: "Owner-only via Solana CLI on the owner's computer; never from the app.",
      };
    case "hook-mint-policy":
    case "hook-dbc-launch":
    case "hook-swap":
      if (network === "mainnet-beta" || MAINNET_CUSTOM_HOOKS_ENABLED !== false)
        return { allowed: false, reason: "Custom Token-2022 hooks are disabled on mainnet." };
      return deployment
        ? {
            allowed: true,
            reason: "Devnet only; the deployment must still verify live before use.",
          }
        : {
            allowed: false,
            reason: "No independently verified hook program ID / fingerprint / authority yet.",
          };
    case "hook-migration":
      return { allowed: false, reason: "DAMM v2 migration with hook is unverified (issue #17)." };
    case "quantum-vault-deposit":
      return { allowed: false, reason: "Vault deposits are disabled." };
  }
}

/** Throws unless allowed; call at transaction-construction boundaries. */
export function assertCapability(cap: Capability, network: CapNetwork) {
  const g = capability(cap, network);
  if (!g.allowed) throw new Error(`Refused: ${g.reason}`);
}