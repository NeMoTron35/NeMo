// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { Connection, Keypair, PublicKey, SystemProgram, Transaction } from "@solana/web3.js";
import type { Wallet, WalletAccount } from "@wallet-standard/base";
import { signReviewedTransaction } from "@/lib/qli-core/wallet";
import { parseMetadataAuthority } from "@/lib/qli-core/dbc-launch";
import { explainTransactionError } from "@/lib/qli-core/dbc";
afterEach(() => vi.restoreAllMocks());

type Tamper = "none" | "drop-config" | "drop-mint" | "alter-mint" | "no-payer";
function setup(tamper: Tamper) {
  const payer = Keypair.fromSeed(new Uint8Array(32).fill(7));
  const config = Keypair.fromSeed(new Uint8Array(32).fill(3));
  const mint = Keypair.fromSeed(new Uint8Array(32).fill(4));
  const account: WalletAccount = {
    address: payer.publicKey.toBase58(),
    publicKey: new Uint8Array(payer.publicKey.toBytes()),
    chains: ["solana:devnet"],
    features: ["solana:signTransaction"],
  };
  const signTransaction = vi.fn(async (input: { transaction: Uint8Array }) => {
    const tx = Transaction.from(input.transaction);
    if (tamper !== "no-payer") tx.partialSign(payer);
    const zero = (k: PublicKey, fill = 0) => {
      const e = tx.signatures.find((s) => s.publicKey.equals(k))!;
      e.signature = Buffer.alloc(64, fill);
    };
    if (tamper === "drop-config") zero(config.publicKey);
    if (tamper === "drop-mint") zero(mint.publicKey);
    if (tamper === "alter-mint") zero(mint.publicKey, 1);
    return [
      {
        signedTransaction: new Uint8Array(
          tx.serialize({ requireAllSignatures: false, verifySignatures: false }),
        ),
      },
    ];
  });
  const wallet: Wallet = {
    version: "1.0.0",
    name: "Mock wallet",
    icon: "data:image/svg+xml;base64,",
    chains: ["solana:devnet"],
    accounts: [account],
    features: {
      "solana:signTransaction": {
        version: "1.0.0",
        supportedTransactionVersions: ["legacy"],
        signTransaction,
      },
    },
  };
  const connection = new Connection("http://localhost:8899", "confirmed");
  vi.spyOn(connection, "getGenesisHash").mockResolvedValue(
    "EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG",
  );
  vi.spyOn(connection, "getBlockHeight").mockResolvedValue(10);
  vi.spyOn(connection, "isBlockhashValid").mockResolvedValue({ context: { slot: 1 }, value: true });
  vi.spyOn(connection, "simulateTransaction").mockResolvedValue({
    context: { slot: 1 },
    value: { err: null, logs: [], accounts: null, unitsConsumed: 1 },
  });
  const send = vi.spyOn(connection, "sendRawTransaction");
  const transaction = new Transaction({
    feePayer: payer.publicKey,
    recentBlockhash: SystemProgram.programId.toBase58(),
  }).add(
    SystemProgram.createAccount({
      fromPubkey: payer.publicKey,
      newAccountPubkey: config.publicKey,
      lamports: 1,
      space: 0,
      programId: SystemProgram.programId,
    }),
    SystemProgram.createAccount({
      fromPubkey: payer.publicKey,
      newAccountPubkey: mint.publicKey,
      lamports: 1,
      space: 0,
      programId: SystemProgram.programId,
    }),
  );
  transaction.partialSign(config, mint);
  return {
    send,
    run: () =>
      signReviewedTransaction({
        wallet,
        account,
        connection,
        transaction,
        lastValidBlockHeight: 100,
        network: "devnet",
        reviewedMessage: new Uint8Array(transaction.serializeMessage()),
      }),
  };
}

describe("all three launch signatures are required", () => {
  it("passes when the wallet preserves config and mint signatures", async () => {
    const s = setup("none");
    const bytes = await s.run();
    expect(Transaction.from(bytes).verifySignatures(true)).toBe(true);
    expect(s.send).not.toHaveBeenCalled();
  });
  for (const t of ["drop-config", "drop-mint", "alter-mint"] as const)
    it(`rejects when the wallet ${t}`, async () => {
      const s = setup(t);
      await expect(s.run()).rejects.toThrow(/dropped or altered/);
      expect(s.send).not.toHaveBeenCalled();
    });
  it("rejects a missing payer signature", async () => {
    const s = setup("no-payer");
    await expect(s.run()).rejects.toThrow(/invalid or missing/);
  });
});

describe("metadata authority parsing and RPC errors", () => {
  it("reads update authority and isMutable from a Metaplex layout", () => {
    const ua = Keypair.generate().publicKey;
    const str = (v: string) => {
      const b = new TextEncoder().encode(v);
      const out = new Uint8Array(4 + b.length);
      new DataView(out.buffer).setUint32(0, b.length, true);
      out.set(b, 4);
      return out;
    };
    const parts = [
      new Uint8Array([4]),
      ua.toBytes(),
      new Uint8Array(32),
      str("Name"),
      str("SYM"),
      str("https://x/y.json"),
      new Uint8Array([0, 0]),
      new Uint8Array([0]),
      new Uint8Array([0]),
      new Uint8Array([0]),
    ];
    const data = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
    let o = 0;
    for (const p of parts) {
      data.set(p, o);
      o += p.length;
    }
    expect(parseMetadataAuthority(data)).toEqual({
      updateAuthority: ua.toBase58(),
      isMutable: false,
    });
    data[data.length - 1] = 1;
    expect(parseMetadataAuthority(data).isMutable).toBe(true);
  });
  it("explains 403/429 with a dedicated-RPC hint and no URL", () => {
    const m = explainTransactionError(
      new Error("429 Too Many Requests https://rpc.example/?api-key=SECRET"),
    );
    expect(m).toMatch(/dedicated RPC/);
    expect(m).not.toMatch(/SECRET|https:/);
  });
});