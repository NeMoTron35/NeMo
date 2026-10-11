import { useEffect, useState, type ReactNode } from "react";
import {
  phantomBrowseLink,
  walletEnvironment,
  type WalletEnvironment,
} from "@/lib/qli-core/wallet-accounts";
import { Wallet, ArrowUpRight, LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useConsole } from "@/lib/qli-core/context";
import { WalletDialogContext as Context } from "./wallet-dialog-context";
export function WalletProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const c = useConsole();
  const [env, setEnv] = useState<WalletEnvironment | "checking">("checking");
  useEffect(() => {
    if (!open) return;
    // Wallet Standard registration is asynchronous; give injected wallets time to register.
    const t = setTimeout(() => setEnv(walletEnvironment(window, c.wallets.length)), 600);
    return () => clearTimeout(t);
  }, [open, c.wallets.length]);
  return (
    <Context.Provider value={() => setOpen(true)}>
      {children}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogTitle>{c.account ? "Connected wallet" : "Connect a Solana wallet"}</DialogTitle>
          <DialogDescription>
            Quantum QLi never asks for private keys. Connection alone cannot authorize a
            transaction.
          </DialogDescription>
          {c.account ? (
            <>
              <pre className="code-block">{c.account.address}</pre>
              <p className="notice">
                {c.wallet?.name} · Solana {c.network}
              </p>
              <Button
                disabled={c.walletBusy}
                variant="outline"
                onClick={async () => {
                  await c.disconnect();
                  setOpen(false);
                }}
              >
                Disconnect wallet
              </Button>
            </>
          ) : (
            <div className="wallet-list">
              {c.wallets.length ? (
                c.wallets.map((w) => (
                  <Button
                    key={w.name}
                    variant="outline"
                    disabled={c.walletBusy}
                    onClick={async () => {
                      if (await c.connect(w)) setOpen(false);
                    }}
                  >
                    {c.walletBusy && <LoaderCircle className="animate-spin" />}
                    <img src={w.icon} alt="" />
                    {w.name}
                    <ArrowUpRight />
                  </Button>
                ))
              ) : (
                <>
                  <div className="empty-state" role="status">
                    <Wallet />
                    {env === "checking"
                      ? "Looking for Phantom and other Solana wallets…"
                      : env === "framed"
                        ? "Wallets cannot connect inside an embedded preview. Open quantumqli.app in its own tab."
                        : env === "mobile-no-wallet"
                          ? "Mobile Safari and Chrome cannot reach Phantom. Open this page inside the Phantom app's browser."
                          : "No Solana wallet detected. Install or enable the Phantom extension, then reload."}
                  </div>
                  {env === "mobile-no-wallet" && (
                    <a href={phantomBrowseLink(window.location.href)} className="desk-link">
                      Open in Phantom ↗
                    </a>
                  )}
                  <a
                    href="https://phantom.com/download"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="desk-link"
                  >
                    Get Phantom ↗
                  </a>
                </>
              )}
            </div>
          )}
          {c.walletError && (
            <p role="alert" className="error-message">
              {c.walletError}
            </p>
          )}
          <p className="notice">
            Connecting shares only your public address. Every transaction needs a separate approval
            in your wallet.
          </p>
        </DialogContent>
      </Dialog>
    </Context.Provider>
  );
}