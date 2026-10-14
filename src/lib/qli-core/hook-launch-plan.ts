// Devnet-only Transfer Hook launch PLAN (Hook Forge v2). Deterministic account planning and an
// ordered owner runbook. Signing is BLOCKED: no reviewed, deployed hook program is configured and no
// funded devnet end-to-end run has passed. This module builds no transaction.
import { PublicKey } from "@solana/web3.js";
import { isAddress } from "./launch-proof";

/** Stays null until an owner-deployed devnet hook program is verified via /hook-proofs. */
/** Owner-reviewed record; it is only a claim until verified live (program, ProgramData fingerprint, authority). */
export type HookDeployment = {
  programId: string;
  verifiedSlot: number;
  codeFingerprint: string;
  upgradeAuthority: string;
};
export const HOOK_DEVNET_DEPLOYMENT: HookDeployment | null = null;

export type PlanStep = {
  n: number;
  title: string;
  program: string;
  signer: string;
  sdkOrCli: string;
  evidence: string;
};

export const PLAN_STEPS: PlanStep[] = [
  {
    n: 1,
    title: "Build and test the research hook locally",
    program: "local",
    signer: "none",
    sdkOrCli: "cargo test (programs/quantum_transfer_hook, _cpi_test)",
    evidence: "LOCAL_UNIT_TESTED / LOCAL_VALIDATOR_TESTED",
  },
  {
    n: 2,
    title: "Owner deploys hook program to devnet",
    program: "BPF Upgradeable Loader",
    signer: "owner wallet + owner-generated program keypair",
    sdkOrCli: "cargo build-sbf; solana program deploy --url devnet",
    evidence: "hook executable on devnet",
  },
  {
    n: 3,
    title: "Create Token-2022 mint with TransferHook extension",
    program: "Token-2022",
    signer: "owner",
    sdkOrCli: "spl-token --program-2022 create-token --transfer-hook <HOOK>",
    evidence: "mint extension bound",
  },
  {
    n: 4,
    title: "Initialize hook policy and ExtraAccountMetaList",
    program: "hook (IX qlihk:in)",
    signer: "mint TransferHook authority",
    sdkOrCli: "runbook script in docs/HOOK_FORGE_V2.md",
    evidence: "metas PDA + config PDA owned by hook",
  },
  {
    n: 5,
    title: "Create DBC config + TransferHookPool",
    program: "Meteora DBC",
    signer: "owner",
    sdkOrCli: "SDK createConfigAndPoolWithTransferHook",
    evidence: "DBC_VERIFIED (with swaps and transfers)",
  },
  {
    n: 6,
    title: "Swap on the curve",
    program: "Meteora DBC",
    signer: "trader",
    sdkOrCli: "SDK swap2WithTransferHook",
    evidence: "swap tx with hook invoked",
  },
  {
    n: 7,
    title: "Allowed and denied transfers before graduation",
    program: "Token-2022",
    signer: "holder",
    sdkOrCli: "spl-token transfer (hook resolves extra metas)",
    evidence: "allow + hook-attributed deny",
  },
  {
    n: 8,
    title: "Graduate to DAMM v2",
    program: "Meteora DBC",
    signer: "permissionless / migrator",
    sdkOrCli: "SDK migrateToDammV2",
    evidence: "MIGRATION_VERIFIED",
  },
  {
    n: 9,
    title: "Allowed and denied transfers after graduation",
    program: "Token-2022",
    signer: "holder",
    sdkOrCli: "spl-token transfer",
    evidence: "POST_GRAD_VERIFIED",
  },
];

export const SIGNING_BLOCKERS = [
  "No owner-deployed hook program is configured (HOOK_DEVNET_DEPLOYMENT is null).",
  "The research hook is not audited and has no independent security review.",
  "No funded devnet end-to-end run (steps 2 to 9) has been verified.",
  "Whether DBC accepts a given hook program (token badge / program checks) is not verified.",
  "Mainnet custom-hook launches are disabled in code.",
];

export function planAccounts(mint: string, hookProgram: string) {
  if (!isAddress(mint) || !isAddress(hookProgram)) return null;
  const m = new PublicKey(mint);
  const h = new PublicKey(hookProgram);
  const enc = new TextEncoder();
  return {
    extraAccountMetaList: PublicKey.findProgramAddressSync(
      [enc.encode("extra-account-metas"), m.toBytes()],
      h,
    )[0].toBase58(),
    qliPolicyConfig: PublicKey.findProgramAddressSync(
      [enc.encode("qli-hook-config"), m.toBytes()],
      h,
    )[0].toBase58(),
    note: "DBC pool, vault and DAMM v2 addresses are derived by the pinned SDK at build time and must be re-checked in review.",
  };
}

export function signingAllowed(network: string): { allowed: false; reasons: string[] } {
  return {
    allowed: false,
    reasons:
      network === "mainnet-beta"
        ? ["Mainnet custom-hook launches are disabled in code.", ...SIGNING_BLOCKERS]
        : SIGNING_BLOCKERS,
  };
}
