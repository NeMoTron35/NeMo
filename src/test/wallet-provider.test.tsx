import { afterEach, describe, it, expect, vi } from "vitest";
import { act, render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import type { Wallet } from "@wallet-standard/base";
import { Connection } from "@solana/web3.js";
import { ConsoleProvider } from "@/lib/qli-core/console-provider";
import { useConsole } from "@/lib/qli-core/context";

const disconnect = vi.fn(async () => {
  throw new Error("disconnect failed");
});
const connect = vi.fn(async () => ({ accounts: wallet.accounts }));
const wallet = {
  version: "1.0.0",
  name: "Mock Phantom",
  icon: "data:image/png;base64,",
  chains: ["solana:mainnet"],
  accounts: [
    { address: "test", publicKey: new Uint8Array(32), chains: ["solana:mainnet"], features: [] },
  ],
  features: {
    "standard:connect": { version: "1.0.0", connect },
    "standard:disconnect": { version: "1.0.0", disconnect },
  },
} as unknown as Wallet;
function Harness() {
  const c = useConsole();
  return (
    <>
      <p data-testid="account">{c.account?.address ?? "disconnected"}</p>
      <p data-testid="handoff">{c.agentHandoff ? "present" : "none"}</p>
      <p>{c.walletError}</p>
      <button onClick={() => void c.connect(wallet)}>Connect</button>
      <button onClick={() => c.setAgentHandoff({ review: true })}>Stage</button>
      <button onClick={() => c.setNetwork("devnet")}>Devnet</button>
      <button onClick={() => void c.disconnect()}>Disconnect</button>
    </>
  );
}
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
function mount() {
  vi.spyOn(Connection.prototype, "getGenesisHash").mockResolvedValue("unavailable-test-genesis");
  render(
    <ConsoleProvider>
      <Harness />
    </ConsoleProvider>,
  );
}
describe("Wallet Standard lifecycle", () => {
  it("connects and invalidates handoff on incompatible network switch", async () => {
    mount();
    fireEvent.click(screen.getByText("Connect"));
    await waitFor(() => expect(screen.getByTestId("account").textContent).toBe("test"));
    fireEvent.click(screen.getByText("Stage"));
    await act(async () => {
      fireEvent.click(screen.getByText("Devnet"));
    });
    expect(screen.getByTestId("account").textContent).toBe("disconnected");
    expect(screen.getByTestId("handoff").textContent).toBe("none");
    expect(screen.getByText(/Reconnect on that network/)).toBeTruthy();
  });
  it("clears local connection even if wallet disconnect rejects", async () => {
    mount();
    fireEvent.click(screen.getByText("Connect"));
    await waitFor(() => expect(screen.getByTestId("account").textContent).toBe("test"));
    fireEvent.click(screen.getByText("Stage"));
    fireEvent.click(screen.getByText("Disconnect"));
    await waitFor(() => expect(screen.getByTestId("account").textContent).toBe("disconnected"));
    expect(screen.getByTestId("handoff").textContent).toBe("none");
  });
});