import type { Wallet, WalletAccount } from "@wallet-standard/base";
/** Wallets may report chains on the account or only on the wallet; both are standard-compliant. */
export function pickAccount(w: Wallet, accounts: readonly WalletAccount[], chain: string) {
  const c = chain as `${string}:${string}`;
  return (
    accounts.find((a) => a.chains.includes(c)) ??
    (w.chains.includes(c) ? accounts.find((a) => a.chains.length === 0) : undefined)
  );
}
export type WalletEnvironment = "framed" | "mobile-no-wallet" | "desktop-no-wallet" | "ok";
/** Read-only diagnostics; never touches a wallet provider. Call after hydration. */
export function walletEnvironment(w: Window, detected: number): WalletEnvironment {
  if (detected > 0) return "ok";
  let framed = false;
  try {
    framed = w.self !== w.top;
  } catch {
    framed = true;
  }
  if (framed) return "framed";
  return /Android|iPhone|iPad|iPod/i.test(w.navigator.userAgent)
    ? "mobile-no-wallet"
    : "desktop-no-wallet";
}
export function phantomBrowseLink(url: string) {
  const u = new URL(url);
  return `https://phantom.app/ul/browse/${encodeURIComponent(u.href)}?ref=${encodeURIComponent(u.origin)}`;
}
/** Same rule as pickAccount: the account lists the chain, or lists none and the wallet lists it. */
export function accountSupportsChain(w: Wallet, a: WalletAccount, chain: string) {
  const c = chain as `${string}:${string}`;
  return a.chains.includes(c) || (a.chains.length === 0 && w.chains.includes(c));
}
