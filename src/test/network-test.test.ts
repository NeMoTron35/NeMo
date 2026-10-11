// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { Keypair, PublicKey, SystemProgram, Transaction } from "@solana/web3.js";
import { SolanaSignTransaction } from "@solana/wallet-standard-features";
import type { Wallet, WalletAccount } from "@wallet-standard/base";
import {
  allowlistCovers,
  classifyRpcError,
  probePrograms,
  probeRpc,
  readiness,
  signatureStatus,
  walletDiagnostics,
  type Facts,
} from "@/lib/qli-core/network-test";
import { GENESIS } from "@/lib/qli-core/dbc-launch";
import { signReviewedTransaction } from "@/lib/qli-core/wallet";

const payer = Keypair.generate();
function mockWallet(chains: `${string}:${string}`[], sign?: (b: Uint8Array) => Uint8Array) {
  const account: WalletAccount = {
    address: payer.publicKey.toBase58(),
    publicKey: payer.publicKey.toBytes(),
    chains,
    features: [],
  };
  const wallet = {
    version: "1.0.0",
    name: "MockPhantom",
    icon: "data:image/png;base64,",
    chains,
    accounts: [account],
    features: {
      [SolanaSignTransaction]: {
        version: "1.0.0",
        supportedTransactionVersions: ["legacy"],
        signTransaction: vi.fn(async ({ transaction }: { transaction: Uint8Array }) => [
          { signedTransaction: sign ? sign(transaction) : transaction },
        ]),
      },
    },
  } as unknown as Wallet;
  return { wallet, account };
}
function tx() {
  const t = new Transaction({
    feePayer: payer.publicKey,
    recentBlockhash: PublicKey.default.toBase58(),
  }).add(
    SystemProgram.transfer({ fromPubkey: payer.publicKey, toPubkey: payer.publicKey, lamports: 1 }),
  );
  return { t, reviewed: t.serializeMessage() };
}
function conn(net: "devnet" | "mainnet-beta" = "devnet") {
  return {
    getGenesisHash: vi.fn(async () => GENESIS[net]),
    getBlockHeight: vi.fn(async () => 10),
    isBlockhashValid: vi.fn(async () => ({ value: true })),
    simulateTransaction: vi.fn(async () => ({ value: { err: null } })),
    sendRawTransaction: vi.fn(),
  };
}
const signOk = (b: Uint8Array) => {
  const t = Transaction.from(b);
  t.partialSign(payer);
  return t.serialize();
};

describe("network test center core", () => {
  it("classifies 403/429 and wrong genesis without raw payloads", async () => {
    expect(classifyRpcError(new Error("403 Forbidden https://x"))).toBe("forbidden");
    expect(classifyRpcError(new Error("429 Too Many Requests"))).toBe("rate-limited");
    const bad = await probeRpc(
      { getGenesisHash: async () => GENESIS.devnet, getSlot: async () => 1 } as never,
      "mainnet-beta",
    );
    expect(bad).toMatchObject({ ok: false, kind: "wrong-genesis" });
    const err = await probeRpc(
      {
        getGenesisHash: async () => {
          throw new Error("429 https://secret-rpc/key");
        },
        getSlot: async () => 1,
      } as never,
      "devnet",
    );
    expect(JSON.stringify(err)).not.toContain("secret-rpc");
  });
  it("reports non-executable / unreadable programs as not ok", async () => {
    const r = await probePrograms(
      { getAccountInfo: async () => ({ executable: false }) } as never,
      "devnet",
    );
    expect(r.every((p) => p.executable === false)).toBe(true);
    expect(allowlistCovers()).toBe(true);
  });
  it("wallet diagnostics detect wrong network", () => {
    const { wallet, account } = mockWallet(["solana:devnet"]);
    expect(walletDiagnostics(wallet, account, "devnet").supportsChain).toBe(true);
    expect(walletDiagnostics(wallet, account, "mainnet-beta").supportsChain).toBe(false);
  });
  const facts = (o: Partial<Facts> = {}): Facts => ({
    rpc: { ok: true, genesis: GENESIS.devnet, slot: 5 },
    wallet: { connected: true, supportsChain: true, canSignTransaction: true, address: "x" },
    balance: 2e9,
    minLamports: 1e8,
    programsOk: true,
    sessionMatches: true,
    ...o,
  });
  it("fails closed and never fakes confirmation", () => {
    const st = (n: "devnet" | "mainnet-beta", f: Facts, id: string) =>
      readiness(n, f).find((i) => i.id === id)!.status;
    expect(st("devnet", facts(), "standard-launch")).toBe("requires-owner-signature");
    expect(st("devnet", facts({ balance: 1 }), "standard-launch")).toBe("blocked");
    expect(st("devnet", facts({ programsOk: false }), "standard-launch")).toBe("blocked");
    expect(st("devnet", facts(), "hook-dbc")).toBe("blocked"); // no reviewed deployment
    expect(st("devnet", facts(), "graduation")).toBe("blocked");
    expect(st("mainnet-beta", facts(), "mainnet-hook")).toBe("blocked");
    expect(st("mainnet-beta", facts(), "mainnet-vault")).toBe("blocked");
    expect(readiness("devnet", facts()).some((i) => i.status === "confirmed-by-chain")).toBe(false);
  });
  it("generic signature status is informational and genesis-bound", async () => {
    const sig = "2".repeat(88);
    const c = (status: unknown, g: string = GENESIS.devnet) => ({
      getGenesisHash: async (): Promise<string> => g,
      getSignatureStatuses: async () => ({ value: [status] }),
    });
    const s = (x: unknown, g?: string) => signatureStatus(c(x, g) as never, "devnet", sig);
    expect(await s({ slot: 9, err: null, confirmationStatus: "confirmed" })).toEqual({
      state: "confirmed",
      slot: 9,
    });
    expect((await s({ slot: 9, err: { x: 1 }, confirmationStatus: "confirmed" }))?.state).toBe(
      "failed",
    );
    expect((await s({ slot: 9, err: null, confirmationStatus: "processed" }))?.state).toBe(
      "pending",
    );
    expect(
      await s({ slot: 9, err: null, confirmationStatus: "finalized" }, GENESIS["mainnet-beta"]),
    ).toBe(null);
    expect(await signatureStatus(c(null) as never, "devnet", "fake")).toBe(null);
  });
});

describe("reviewed signing boundary (both networks)", () => {
  for (const network of ["devnet", "mainnet-beta"] as const) {
    const chain = network === "devnet" ? "solana:devnet" : "solana:mainnet";
    it(`${network}: signs only preserved bytes and never submits`, async () => {
      const { wallet, account } = mockWallet([chain], signOk);
      const { t, reviewed } = tx();
      const c = conn(network);
      const out = await signReviewedTransaction({
        wallet,
        account,
        connection: c as never,
        transaction: t,
        lastValidBlockHeight: 100,
        network,
        reviewedMessage: reviewed,
      });
      expect(Transaction.from(out).serializeMessage()).toEqual(Buffer.from(reviewed));
      expect(c.sendRawTransaction).not.toHaveBeenCalled();
    });
    it(`${network}: rejects wrong wallet network and wrong genesis`, async () => {
      const other = network === "devnet" ? "solana:mainnet" : "solana:devnet";
      const { wallet, account } = mockWallet([other], signOk);
      const { t, reviewed } = tx();
      await expect(
        signReviewedTransaction({
          wallet,
          account,
          connection: conn(network) as never,
          transaction: t,
          lastValidBlockHeight: 100,
          network,
          reviewedMessage: reviewed,
        }),
      ).rejects.toThrow(/network/);
      const w2 = mockWallet([chain], signOk);
      const wrong = conn(network === "devnet" ? "mainnet-beta" : "devnet");
      await expect(
        signReviewedTransaction({
          ...w2,
          connection: wrong as never,
          transaction: t,
          lastValidBlockHeight: 100,
          network,
          reviewedMessage: reviewed,
        }),
      ).rejects.toThrow(/RPC network/);
    });
  }
  it("rejects expiry, rejected signature, altered bytes, account change and network change mid-review", async () => {
    const { t, reviewed } = tx();
    const base = () => ({
      ...mockWallet(["solana:devnet"], signOk),
      transaction: t,
      lastValidBlockHeight: 100,
      network: "devnet" as const,
      reviewedMessage: reviewed,
    });
    const exp = conn();
    exp.getBlockHeight.mockResolvedValue(101);
    await expect(signReviewedTransaction({ ...base(), connection: exp as never })).rejects.toThrow(
      /expired/,
    );
    const rej = mockWallet(["solana:devnet"]);
    (
      rej.wallet.features[SolanaSignTransaction] as { signTransaction: ReturnType<typeof vi.fn> }
    ).signTransaction.mockRejectedValue(new Error("User rejected"));
    await expect(
      signReviewedTransaction({ ...base(), ...rej, connection: conn() as never }),
    ).rejects.toThrow(/rejected/);
    const alt = mockWallet(["solana:devnet"], (b) => {
      const x = Transaction.from(b);
      x.recentBlockhash = payer.publicKey.toBase58();
      x.partialSign(payer);
      return x.serialize();
    });
    await expect(
      signReviewedTransaction({ ...base(), ...alt, connection: conn() as never }),
    ).rejects.toThrow(/changed/);
    const ch = base();
    const c = conn();
    c.simulateTransaction.mockImplementation(async () => {
      (ch.wallet as unknown as { accounts: WalletAccount[] }).accounts = [];
      return { value: { err: null } };
    });
    await expect(signReviewedTransaction({ ...ch, connection: c as never })).rejects.toThrow(
      /changed/,
    );
    const net = conn();
    net.getGenesisHash.mockResolvedValue(GENESIS["mainnet-beta"]);
    await expect(signReviewedTransaction({ ...base(), connection: net as never })).rejects.toThrow(
      /RPC network/,
    );
  });
});