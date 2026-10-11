// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { Keypair, PublicKey, Transaction } from "@solana/web3.js";
import {
  parseArgs,
  assertBudget,
  createSender,
  validateReceipt,
  type PublicReceipt,
} from "../../scripts/hook-e2e-core";
import {
  DEVNET_GENESIS,
  BPF_UPGRADEABLE_LOADER,
  dbcInitInstruction,
  inspectProgram,
  type Built,
} from "@/lib/qli-core/hook-devnet";

const owner = Keypair.generate();
const hook = Keypair.generate().publicKey;
const fingerprint = "a".repeat(64);
const args = [
  "--program",
  hook.toBase58(),
  "--fingerprint",
  fingerprint,
  "--wallet",
  owner.publicKey.toBase58(),
];

function plan(signer = owner.publicKey): Built {
  const tx = new Transaction({
    feePayer: owner.publicKey,
    recentBlockhash: PublicKey.default.toBase58(),
  }).add(dbcInitInstruction(hook, owner.publicKey, signer));
  return {
    transaction: tx,
    reviewedMessage: tx.serializeMessage(),
    kind: "dbc-pool",
    lastValidBlockHeight: 100,
    estimatedLamports: 10000,
    summary: [],
    ...(signer.equals(owner.publicKey) ? {} : { ephemeralSigner: signer.toBase58() }),
  };
}
function connection(err: unknown = null) {
  return {
    getGenesisHash: vi.fn(async () => DEVNET_GENESIS),
    getBlockHeight: vi.fn(async () => 10),
    isBlockhashValid: vi.fn(async () => ({ value: true })),
    simulateTransaction: vi.fn(async () => ({ value: { err } })),
    sendRawTransaction: vi.fn(),
  };
}

describe("owner CLI gates", () => {
  it("defaults read-only and requires both execution acknowledgements", () => {
    expect(parseArgs(args).execute).toBe(false);
    expect(() => parseArgs([...args, "--execute"])).toThrow(/ack-devnet/);
    expect(parseArgs([...args, "--execute", "--ack-devnet"]).execute).toBe(true);
    expect(() => parseArgs([...args, "--dry-run", "--execute", "--ack-devnet"])).toThrow(
      /OR execute/,
    );
    expect(() => parseArgs([...args, "--rpc", "https://evil.example"])).toThrow(/Unknown/);
  });
  it("rejects bad fingerprint, slippage, tiny/oversized input and debit caps", () => {
    expect(() => parseArgs([...args, "--fingerprint", "bad"])).toThrow(/fingerprint/);
    for (const value of ["0", "1001", "NaN"])
      expect(() => parseArgs([...args, "--slippage-bps", value])).toThrow();
    for (const value of ["0", "100000001", "-1"])
      expect(() => parseArgs([...args, "--buy-lamports", value])).toThrow();
    expect(() => parseArgs([...args, "--max-lamports", "500000001"])).toThrow(/debit/);
    expect(() => assertBudget(10, 91, 100)).toThrow(/budget/);
    expect(() => assertBudget(10, 90, 100)).not.toThrow();
  });
  it("refuses wrong genesis without any signing or send", async () => {
    const conn = connection();
    conn.getGenesisHash.mockResolvedValue("wrong");
    await expect(
      createSender()(conn as never, plan(), owner, hook, async () => {}),
    ).rejects.toThrow(/genesis/);
    expect(conn.sendRawTransaction).not.toHaveBeenCalled();
  });
  it("refuses a missing one-time signer", async () => {
    const conn = connection();
    await expect(
      createSender()(
        conn as never,
        plan(Keypair.generate().publicKey),
        owner,
        hook,
        async () => {},
      ),
    ).rejects.toThrow(/one-time signer/);
    expect(conn.sendRawTransaction).not.toHaveBeenCalled();
  });
  it("refuses changed reviewed bytes and failed simulation", async () => {
    const conn = connection({ InstructionError: [0, { Custom: 0x5100 }] });
    const b = plan();
    await expect(createSender()(conn as never, b, owner, hook, async () => {})).rejects.toThrow(
      /simulation failed/,
    );
    expect(conn.sendRawTransaction).not.toHaveBeenCalled();
    b.reviewedMessage = new Uint8Array([0]);
    await expect(createSender()(conn as never, b, owner, hook, async () => {})).rejects.toThrow(
      /message changed/,
    );
  });
  it("never retries an ambiguous send", async () => {
    const conn = connection();
    conn.sendRawTransaction.mockRejectedValue(new Error("ambiguous RPC"));
    const send = createSender(),
      b = plan();
    await expect(send(conn as never, b, owner, hook, async () => {})).rejects.toThrow(/ambiguous/);
    await expect(send(conn as never, b, owner, hook, async () => {})).rejects.toThrow(
      /already attempted/,
    );
    expect(conn.sendRawTransaction).toHaveBeenCalledTimes(1);
  });
  it("confirms only the identical successful on-chain message, once", async () => {
    const b = plan();
    const signature = "2".repeat(88);
    const conn = {
      ...connection(),
      sendRawTransaction: vi.fn(async () => signature),
      confirmTransaction: vi.fn(async () => ({ value: { err: null } })),
      getTransaction: vi.fn(async () => ({
        slot: 42,
        meta: { err: null },
        transaction: { signatures: [signature], message: b.transaction.compileMessage() },
      })),
    };
    const send = createSender();
    await expect(send(conn as never, b, owner, hook, async () => {})).resolves.toEqual({
      signature,
      slot: 42,
    });
    await expect(send(conn as never, b, owner, hook, async () => {})).rejects.toThrow(
      /already attempted/,
    );
    expect(conn.sendRawTransaction).toHaveBeenCalledTimes(1);
  });
  it("rejects expired blockhash and simulation-time mutation before signing", async () => {
    const b = plan();
    const conn = connection();
    conn.isBlockhashValid.mockResolvedValue({ value: false });
    await expect(createSender()(conn as never, b, owner, hook, async () => {})).rejects.toThrow(
      /expired/,
    );
    conn.isBlockhashValid.mockResolvedValue({ value: true });
    conn.simulateTransaction.mockImplementation(async () => {
      b.transaction.recentBlockhash = hook.toBase58();
      return { value: { err: null } };
    });
    await expect(createSender()(conn as never, b, owner, hook, async () => {})).rejects.toThrow(
      /changed during simulation/,
    );
    expect(conn.sendRawTransaction).not.toHaveBeenCalled();
  });
});

describe("public receipt validation", () => {
  const receipt: PublicReceipt = {
    schema: "qli-hook-e2e-v1",
    network: "devnet",
    genesis: DEVNET_GENESIS,
    program: hook.toBase58(),
    codeFingerprint: fingerprint,
    owner: owner.publicKey.toBase58(),
    config: null,
    pool: null,
    mint: null,
    evidence: "DEVNET_DEPLOYED",
    transactions: [],
    simulations: [],
    migration: "UNVERIFIED_ISSUE_17",
  };
  it("rejects mixed network, malformed signatures and invented swap tier", () => {
    expect(() => validateReceipt({ ...receipt, network: "mainnet-beta" } as never)).toThrow(
      /Malformed/,
    );
    expect(() => validateReceipt({ ...receipt, evidence: "DBC_SWAP_VERIFIED" })).toThrow(
      /confirmed swap/,
    );
    expect(() =>
      validateReceipt({
        ...receipt,
        transactions: [
          { kind: "dbc-swap", signature: "fake", slot: 1, messageSha256: fingerprint },
        ],
      }),
    ).toThrow(/Malformed/);
  });
  it("strips any unrecognized fields from exported data", () => {
    const result = validateReceipt({ ...receipt, privateKey: "must-not-export" } as PublicReceipt);
    expect(JSON.stringify(result)).not.toContain("privateKey");
  });
});

describe("ProgramData ownership", () => {
  it("refuses a spoofed ProgramData owner even if its payload has a reviewed hash", async () => {
    const loader = new PublicKey(BPF_UPGRADEABLE_LOADER);
    const pd = PublicKey.findProgramAddressSync([hook.toBuffer()], loader)[0];
    const data = Buffer.alloc(36);
    data.writeUInt32LE(2);
    pd.toBuffer().copy(data, 4);
    const payload = Buffer.alloc(48);
    payload.writeUInt32LE(3);
    payload[12] = 1;
    const conn = {
      getGenesisHash: async () => DEVNET_GENESIS,
      getAccountInfoAndContext: async () => ({
        context: { slot: 1 },
        value: { executable: true, owner: loader, data },
      }),
      getAccountInfo: async () => ({ executable: false, owner: hook, data: payload }),
    };
    const result = await inspectProgram(conn as never, hook);
    expect(result.codeFingerprint).toBe(null);
    expect(result.checks.some((c) => c.label === "ProgramData" && c.ok === false)).toBe(true);
  });
});

const live =
  process.env["QLI_HOOK_DEVNET_READ_TEST"] === "1" &&
  process.env["QLI_HOOK_MANUAL_ACK"] === "devnet-read-only";
it.skipIf(!live)(
  "opt-in actual public devnet program verification (no signer/no sends)",
  async () => {
    const { Connection } = await import("@solana/web3.js");
    const id = process.env["QLI_HOOK_PROGRAM_ID"],
      fp = process.env["QLI_HOOK_EXPECTED_FP"];
    if (!id || !fp) throw new Error("Public program and reviewed fingerprint required.");
    const result = await inspectProgram(
      new Connection("https://api.devnet.solana.com"),
      new PublicKey(id),
    );
    expect(result.executable).toBe(true);
    expect(result.codeFingerprint).toBe(fp);
  },
  60000,
);