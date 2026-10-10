import { createContext, useContext, useState, type ReactNode } from "react";
import { Wallet, ArrowUpRight, LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useConsole } from "@/lib/quantek/context";
import { WalletDialogContext as Context } from "./wallet-dialog-context";
export function WalletProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const c = useConsole();
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
                  <div className="empty-state">
                    <Wallet />
                    No compatible browser wallet detected.
                  </div>
                  <a
                    href="https://phantom.com/download"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="desk-link"
                  >
                    Get Phantom ↗
                  </a>
                  <a
                    href="https://solflare.com/download"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="desk-link"
                  >
                    Get Solflare ↗
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
            Local demonstrations stay simulated after connection. Wallet rejection and unavailable
            RPC never imply success.
          </p>
        </DialogContent>
      </Dialog>
    </Context.Provider>
  );
}
