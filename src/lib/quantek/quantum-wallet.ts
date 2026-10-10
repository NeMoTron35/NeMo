// QUANTEK Quantum Wallet model + adapter boundary. QUANTEK has NOT deployed an on-chain WOTS verifier/vault program.
import { DOMAINS, H, hex, utf8, PQ_PARAMETERS } from "./pq";

/** Explicitly not deployed. Never substitute a third-party program id. */
export const QUANTEK_QUANTUM_WALLET_PROGRAM_ID: string | null = null;
export const QUANTUM_WALLET_STATUS = "Protocol adapter not deployed" as const;
export const STAGE_CHUNK_BYTES = 900; // conservative payload per staging transaction (1,232-byte packet limit)

export type VaultState = "active" | "staged" | "consumed" | "pending";
export type Vault = {
  index: number;
  leaf: number;
  publicKeyHash: string;
  addressPreview: string;
  state: VaultState;
};
export type AssetRow = {
  symbol: string;
  mint: string;
  program: "Native" | "SPL Token" | "Token-2022";
  amount: number;
  decimals: number;
};
export type WithdrawalIntent = {
  recipient: string;
  mint: string;
  amount: number;
  vaultIndex: number;
};
export type Commitment = {
  digest: string;
  nextVaultHash: string;
  namespace: string;
  fields: Record<string, string>;
};

export function vaultPublicKeyHash(leafPublicHash: string) {
  return hex(H(utf8(DOMAINS.quantumWallet), utf8("vault-pkh"), utf8(leafPublicHash)));
}
export function vaultAddressPreview(pkh: string) {
  return `vault-preview:${pkh.slice(0, 8)}…${pkh.slice(-8)}`;
}
export function vaultChain(identityRoot: string, count = 4, consumed = 0): Vault[] {
  return Array.from({ length: count }, (_, i) => {
    const pkh = vaultPublicKeyHash(hex(H(utf8(identityRoot), utf8(`leaf:${i + 1}`))));
    return {
      index: i,
      leaf: i + 1,
      publicKeyHash: pkh,
      addressPreview: vaultAddressPreview(pkh),
      state: i < consumed ? "consumed" : i === consumed ? "active" : "pending",
    };
  });
}
/** Withdrawal commits to recipient, mint, amount, next-vault hash and program/version namespace. */
export function withdrawalCommitment(intent: WithdrawalIntent, vaults: Vault[]): Commitment {
  const next = vaults[intent.vaultIndex + 1];
  if (!next) throw new Error("No next vault available for remainder rollover.");
  const fields = {
    namespace: DOMAINS.quantumWallet,
    program: QUANTEK_QUANTUM_WALLET_PROGRAM_ID ?? "not-deployed",
    vault: String(intent.vaultIndex),
    recipient: intent.recipient,
    mint: intent.mint,
    amount: String(intent.amount),
    nextVault: next.publicKeyHash,
  };
  const digest = hex(H(...Object.entries(fields).map(([k, v]) => utf8(`${k}=${v};`))));
  return { digest, nextVaultHash: next.publicKeyHash, namespace: DOMAINS.quantumWallet, fields };
}
export function stagingPlan(bytes: number = PQ_PARAMETERS.signatureBytes) {
  const chunks = Math.ceil(bytes / STAGE_CHUNK_BYTES);
  return Array.from({ length: chunks }, (_, i) => ({
    chunk: i + 1,
    from: i * STAGE_CHUNK_BYTES,
    to: Math.min(bytes, (i + 1) * STAGE_CHUNK_BYTES),
  }));
}

export interface QuantumWalletAdapter {
  readonly programId: string | null;
  readonly deployed: boolean;
  buildDeposit(intent: { vault: Vault; mint: string; amount: number }): Promise<never>;
  buildStageSignature(intent: { vault: Vault; chunk: number }): Promise<never>;
  buildWithdraw(intent: WithdrawalIntent): Promise<never>;
}
export class ProtocolNotDeployedError extends Error {
  constructor() {
    super(
      `${QUANTUM_WALLET_STATUS}. An audited on-chain WOTS verifier is required for live Quantum Wallet custody.`,
    );
    this.name = "ProtocolNotDeployedError";
  }
}
export function createQuantumWalletAdapter(): QuantumWalletAdapter {
  const refuse = async (): Promise<never> => {
    throw new ProtocolNotDeployedError();
  };
  return {
    programId: QUANTEK_QUANTUM_WALLET_PROGRAM_ID,
    deployed: QUANTEK_QUANTUM_WALLET_PROGRAM_ID !== null,
    buildDeposit: refuse,
    buildStageSignature: refuse,
    buildWithdraw: refuse,
  };
}
export function canExecuteLive() {
  return QUANTEK_QUANTUM_WALLET_PROGRAM_ID !== null;
}