import { createContext, useContext } from "react";

export const WalletDialogContext = createContext<() => void>(() => {});

export function useWalletDialog() {
  return useContext(WalletDialogContext);
}