import { describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { initialLaunch } from "@/lib/qli-core/launch-draft";
import { SUPPORTED_PATCH } from "@/lib/qli-core/launch-mapping";
import type { LaunchDraft } from "@/lib/qli-core/validation";

let resolveSign: (b: Uint8Array) => void = () => {};
const submit = vi.fn(async () => "sig");
const consoleState = {
  network: "devnet",
  rpc: "https://api.devnet.solana.com",
  account: { address: "11111111111111111111111111111111", chains: ["solana:devnet"] },
  wallet: { name: "Mock Phantom" },
  identity: null,
  log: vi.fn(),
};
vi.mock("@/lib/qli-core/context", () => ({ useConsole: () => consoleState }));
vi.mock("@/components/qli/wallet-dialog-context", () => ({ useWalletDialog: () => () => {} }));
vi.mock("@/lib/qli-core/wallet", () => ({
  signReviewedTransaction: () => new Promise<Uint8Array>((r) => (resolveSign = r)),
}));
vi.mock("@/lib/qli-core/dbc-launch", async (orig) => ({
  ...(await orig<typeof import("@/lib/qli-core/dbc-launch")>()),
  verifyMetadata: async () => ({}),
  buildLaunch: async () => ({
    transaction: {},
    reviewedMessage: new Uint8Array(),
    lastValidBlockHeight: 1,
    config: "C",
    baseMint: "M",
    pool: "P",
    requiredSigners: [],
    programIds: [],
    feeLamports: 5000,
    rentLamports: 1,
    balanceLamports: 1e9,
  }),
  submitAndConfirm: submit,
}));

const { OnChainLaunch } = await import("@/components/qli-core/launch-execute");
const draft: LaunchDraft = {
  ...initialLaunch,
  ...SUPPORTED_PATCH,
  endingBps: initialLaunch.startingBps,
  name: "QLi Test",
  symbol: "QLIT",
  metadata: "https://example.com/m.json",
} as LaunchDraft;

describe("post-sign fingerprint check", () => {
  it("discards wallet-signed bytes when settings change while the popup is open", async () => {
    const { rerender } = render(<OnChainLaunch d={draft} onApply={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /Build transaction/ }));
    await screen.findByRole("checkbox");
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: /Sign & send/ }));
    await waitFor(() => expect(screen.getByRole("status").textContent).toMatch(/awaiting-wallet/));
    rerender(<OnChainLaunch d={{ ...draft, name: "Changed" }} onApply={() => {}} />);
    await act(async () => resolveSign(new Uint8Array([1])));
    expect(submit).not.toHaveBeenCalled();
    expect(await screen.findByText(/discarded and not sent/)).toBeTruthy();
  });
});
