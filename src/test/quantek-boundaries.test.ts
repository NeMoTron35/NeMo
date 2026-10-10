// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  Connection,
  Keypair,
  SystemProgram,
  Transaction,
  VersionedTransaction,
} from "@solana/web3.js";
import type { Wallet, WalletAccount } from "@wallet-standard/base";
import { signReviewedTransaction } from "@/lib/quantek/wallet";
import { createDBCServices, DBC_PROGRAM_ID, DEFAULT_MIGRATION } from "@/lib/quantek/dbc";
import { MigrationOption } from "@meteora-ag/dynamic-bonding-curve-sdk";
import { createSessionStrategyRepository } from "@/lib/quantek/repository";
import { rpcSchema } from "@/lib/quantek/validation";
import { makeDemoProof, verifyDemoProof } from "@/lib/quantek/pq";
import { webcrypto } from "node:crypto";
Object.defineProperty(globalThis, "crypto", { value: webcrypto, configurable: true });
afterEach(() => vi.restoreAllMocks());
function fixture() {
  const payer = Keypair.fromSeed(new Uint8Array(32).fill(7));
  const account: WalletAccount = {
    address: payer.publicKey.toBase58(),
    publicKey: new Uint8Array(payer.publicKey.toBytes()),
    chains: ["solana:devnet"],
    features: ["solana:signTransaction"],
  };
  const sign = vi.fn(async (input: { transaction: Uint8Array }) => {
    const tx = Transaction.from(input.transaction);
    tx.partialSign(payer);
    return [{ signedTransaction: new Uint8Array(tx.serialize()) }];
  });
  const wallet: Wallet = {
    version: "1.0.0",
    name: "Test wallet",
    icon: "data:image/svg+xml;base64,",
    chains: ["solana:devnet"],
    accounts: [account],
    features: {
      "solana:signTransaction": {
        version: "1.0.0",
        supportedTransactionVersions: ["legacy"],
        signTransaction: sign,
      },
    },
  };
  const connection = new Connection("http://localhost:8899", "confirmed");
  const transaction = new Transaction({
    feePayer: payer.publicKey,
    recentBlockhash: SystemProgram.programId.toBase58(),
  }).add(
    SystemProgram.transfer({
      fromPubkey: payer.publicKey,
      toPubkey: Keypair.fromSeed(new Uint8Array(32).fill(9)).publicKey,
      lamports: 1,
    }),
  );
  vi.spyOn(connection, "getGenesisHash").mockResolvedValue("EtWTRABZaYq6iMfeYKouRu166VU2xqa1");
  vi.spyOn(connection, "getBlockHeight").mockResolvedValue(10);
  vi.spyOn(connection, "isBlockhashValid").mockResolvedValue({ context: { slot: 1 }, value: true });
  const simulate = vi.spyOn(connection, "simulateTransaction").mockResolvedValue({
    context: { slot: 1 },
    value: { err: null, logs: [], accounts: null, unitsConsumed: 200 },
  });
  return {
    payer,
    sign,
    simulate,
    transaction,
    args: {
      wallet,
      account,
      connection,
      transaction,
      lastValidBlockHeight: 100,
      network: "devnet" as const,
      reviewedMessage: new Uint8Array(transaction.serializeMessage()),
    },
  };
}
describe("Reviewed wallet boundary", () => {
  it("simulates the exact message and returns signed bytes without sending", async () => {
    const f = fixture();
    const send = vi.spyOn(f.args.connection, "sendRawTransaction");
    const bytes = await signReviewedTransaction(f.args);
    expect(Transaction.from(bytes).verifySignatures()).toBe(true);
    const simulated = f.simulate.mock.calls[0]?.[0];
    expect(simulated).toBeInstanceOf(VersionedTransaction);
    if (simulated instanceof VersionedTransaction)
      expect(Array.from(simulated.message.serialize())).toEqual(Array.from(f.args.reviewedMessage));
    expect(f.simulate.mock.calls[0]?.[1]).toEqual({
      sigVerify: false,
      replaceRecentBlockhash: false,
    });
    expect(send).not.toHaveBeenCalled();
  });
  it("rejects post-review mutation before signing", async () => {
    const f = fixture();
    f.transaction.instructions[0]?.data.fill(0);
    await expect(signReviewedTransaction(f.args)).rejects.toThrow("changed after review");
    expect(f.sign).not.toHaveBeenCalled();
  });
  it("rejects RPC network mismatch", async () => {
    const f = fixture();
    vi.spyOn(f.args.connection, "getGenesisHash").mockResolvedValue("wrong-network");
    await expect(signReviewedTransaction(f.args)).rejects.toThrow("RPC network");
    expect(f.sign).not.toHaveBeenCalled();
  });
  it("rejects stale blockhashes", async () => {
    const f = fixture();
    vi.spyOn(f.args.connection, "getBlockHeight").mockResolvedValue(101);
    await expect(signReviewedTransaction(f.args)).rejects.toThrow("expired");
    expect(f.sign).not.toHaveBeenCalled();
  });
  it("never requests signing after failed simulation", async () => {
    const f = fixture();
    f.simulate.mockResolvedValue({
      context: { slot: 1 },
      value: { err: "AccountNotFound", logs: [], accounts: null },
    });
    await expect(signReviewedTransaction(f.args)).rejects.toThrow("Simulation failed");
    expect(f.sign).not.toHaveBeenCalled();
  });
  it("rechecks mutation while simulation is pending", async () => {
    const f = fixture();
    f.simulate.mockImplementation(async () => {
      f.transaction.instructions[0]?.data.fill(0);
      return { context: { slot: 1 }, value: { err: null, logs: [], accounts: null } };
    });
    await expect(signReviewedTransaction(f.args)).rejects.toThrow("changed during simulation");
    expect(f.sign).not.toHaveBeenCalled();
  });
  it("rejects missing signatures in returned bytes", async () => {
    const f = fixture();
    f.sign.mockImplementation(async () => [
      {
        signedTransaction: new Uint8Array(
          f.transaction.serialize({ requireAllSignatures: false, verifySignatures: false }),
        ),
      },
    ]);
    await expect(signReviewedTransaction(f.args)).rejects.toThrow("missing signature");
  });
  it("rejects wallet mutation of the signed message", async () => {
    const f = fixture();
    f.sign.mockImplementation(async (input) => {
      const changed = Transaction.from(input.transaction);
      changed.instructions[0]?.data.fill(0);
      changed.partialSign(f.payer);
      return [{ signedTransaction: new Uint8Array(changed.serialize()) }];
    });
    await expect(signReviewedTransaction(f.args)).rejects.toThrow("Wallet changed");
  });
});
describe("SDK and session boundaries", () => {
  it("exposes all five SDK services with DAMM v2 defaults", () => {
    const s = createDBCServices("http://localhost:8899");
    expect(DEFAULT_MIGRATION).toBe(MigrationOption.MET_DAMM_V2);
    expect(DBC_PROGRAM_ID).toBe("dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN");
    for (const service of ["partner", "creator", "pool", "migration", "state"])
      expect(s).toHaveProperty(service);
    expect(s.state.getFeeBreakdown).toBeTypeOf("function");
  });
  it("isolates repositories and clones saved snapshots", () => {
    const a = createSessionStrategyRepository();
    const b = createSessionStrategyRepository();
    const snapshot = {
      mode: "Observe",
      pool: "arc",
      dryRun: true,
      values: {
        lower: 40,
        upper: 60,
        threshold: 5,
        slippage: 50,
        trade: 2,
        reserve: 0.1,
        cooldown: 120,
        actions: 12,
        harvest: 0.05,
      },
      modules: ["Fee Harvester"],
      pauseConditions: ["Wallet disconnect"],
    };
    a.save(snapshot);
    snapshot.modules.push("other");
    expect(a.load()?.modules).toEqual(["Fee Harvester"]);
    expect(b.load()).toBeUndefined();
    a.reset();
    expect(a.load()).toBeUndefined();
  });
  it("rejects localhost impersonation and credentials in RPC URLs", () => {
    expect(rpcSchema.safeParse("http://localhost.evil.test").success).toBe(false);
    const credentialUrl = new URL("https://example.invalid");
    credentialUrl.username = "test-user";
    credentialUrl.password = "test-password";
    expect(rpcSchema.safeParse(credentialUrl.href).success).toBe(false);
    expect(rpcSchema.safeParse("http://localhost:8899").success).toBe(true);
  });
  it("rejects malformed proof dimensions instead of padding or truncating", async () => {
    const p = await makeDemoProof();
    await expect(verifyDemoProof({ ...p, leaf: 256 })).rejects.toThrow();
    await expect(verifyDemoProof({ ...p, signature: [...p.signature, "00"] })).rejects.toThrow();
    await expect(verifyDemoProof({ ...p, publicSeed: "f" })).rejects.toThrow(/32-byte/);
  }, 30000);
});
