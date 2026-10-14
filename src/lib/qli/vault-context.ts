import { createContext, useContext } from "react";

type KeyState = { publicKey: Uint8Array; secretKey: Uint8Array; seed: Uint8Array };
export type VaultState = {
  fingerprint: string | null;
  generate: (seed?: string) => void;
  backup: () => string;
  clear: () => void;
  sign: (message: string) => { signature: Uint8Array; valid: boolean };
};
export const VaultContext = createContext<VaultState | null>(null);

export function useVault() {
  const c = useContext(VaultContext);
  if (!c) throw new Error("Vault provider missing");
  return c;
}
