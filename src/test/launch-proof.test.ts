// @vitest-environment node
import { describe, expect, it } from "vitest";
import { Keypair, PublicKey } from "@solana/web3.js";
import {
  DBC_PROGRAM,
  PROOF_GENESIS,
  isAddress,
  isSignature,
  proofPath,
  readIntents,
  saveIntent,
  verifyLaunch,
  verifyReceipt,
  type DecodedPool,
  type ProofDecoder,
  type ProofRpc,
  type TxView,
} from "@/lib/qli-core/launch-proof";

const k = () => Keypair.generate().publicKey.toBase58();
const sig = (n: number) =>
  new Keypair().publicKey.toBase58().slice(0, 0) + b58(new Uint8Array(64).fill(n));
function b58(b: Uint8Array) {
  const A = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  let x = BigInt("0x" + [...b].map((v) => v.toString(16).padStart(2, "0")).join(""));
  let o = "";
  while (x > 0n) {
    o = A[Number(x % 58n)] + o;
    x /= 58n;
  }
  for (const v of b) {
    if (v) break;
    o = "1" + o;
  }
  return o;
}
const SIG = sig(7);
const creator = k(),
  pool = k(),
  config = k(),
  mint = k(),
  quote = "So11111111111111111111111111111111111111112";
const POOL_DATA = new Uint8Array([1]),
  CFG_DATA = new Uint8Array([2]);
const decodedPool: DecodedPool = {
  config,
  creator,
  baseMint: mint,
  baseReserve: "1000000",
  quoteReserve: "5000",
};

const dec = (over: Partial<ProofDecoder> = {}): ProofDecoder => ({
  pool: (d) => (d[0] === 1 ? decodedPool : null),
  config: (d) => (d[0] === 2 ? { quoteMint: quote, migrationOption: 1 } : null),
  derivePool: (q, b, c) => (q === quote && b === mint && c === config ? pool : k()),
  ...over,
});

function tx(over: Partial<TxView> = {}): TxView {
  const keys = [
    { pubkey: creator, signer: true, writable: true },
    { pubkey: config, signer: true, writable: true },
    { pubkey: mint, signer: true, writable: true },
    { pubkey: pool, signer: false, writable: true },
    { pubkey: DBC_PROGRAM, signer: false, writable: false },
  ];
  return {
    slot: 123,
    blockTime: 1_700_000_000,
    err: null,
    accountKeys: keys,
    preBalances: [5e9, 0, 0, 0, 1],
    postBalances: [4e9, 1e6, 1e6, 1e6, 1],
    logs: [
      `Program ${DBC_PROGRAM} invoke [1]`,
      "Program log: Instruction: CreateConfig",
      "Program log: Instruction: InitializeVirtualPoolWithSplToken",
    ],
    instructions: [
      { programIndex: 4, accounts: [0, 1] },
      { programIndex: 4, accounts: [0, 1, 2, 3] },
    ],
    ...over,
  };
}

function rpc(over: Partial<ProofRpc> = {}, t: TxView | null = tx(), owner = DBC_PROGRAM): ProofRpc {
  return {
    genesis: async () => PROOF_GENESIS.devnet,
    status: async () => ({ confirmationStatus: "finalized", err: null, slot: 123 }),
    transaction: async () => t,
    accounts: async (keys) => ({
      slot: 130,
      values: keys.map((a) =>
        a === pool
          ? { owner, lamports: 1, data: POOL_DATA }
          : a === config
            ? { owner, lamports: 1, data: CFG_DATA }
            : null,
      ),
    }),
    ...over,
  };
}
const go = (r: ProofRpc, d = dec(), input = { network: "devnet", signature: SIG }) =>
  verifyLaunch(input, r, d, () => 1_800_000_000);

describe("Launch Proof Engine v1", () => {
  it("validates signatures and addresses by decoded length", () => {
    expect(isSignature(SIG)).toBe(true);
    expect(isSignature(b58(new Uint8Array(32).fill(1)))).toBe(false);
    expect(isSignature("0OIl" + SIG.slice(4))).toBe(false);
    expect(isSignature("../../etc/passwd")).toBe(false);
    expect(isAddress(DBC_PROGRAM)).toBe(true);
    expect(() => proofPath("devnet", "x")).toThrow();
  });

  it("verifies a genuine pool+config creation and emits a receipt whose digest checks", async () => {
    const r = await go(rpc());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.receipt.facts).toMatchObject({
      pool,
      config,
      baseMint: mint,
      creator,
      migration: "damm-v2",
      configCreatedInTx: true,
      mintCreatedInTx: true,
    });
    expect(r.receipt.intentLinkage).toBe("unverified");
    expect((await verifyReceipt(r.receipt)).digestMatches).toBe(true);
    const tampered = { ...r.receipt, facts: { ...r.receipt.facts, creator: k() } };
    expect((await verifyReceipt(tampered)).digestMatches).toBe(false);
    expect((await verifyReceipt({ ...r.receipt, extra: 1 })).structure).toBe(false);
    expect(
      (await verifyReceipt({ ...r.receipt, genesis: PROOF_GENESIS["mainnet-beta"] })).digestMatches,
    ).toBe(false);
  });

  it("maps every failure state without issuing a receipt", async () => {
    const cases: [ProofRpc, string, ProofDecoder?][] = [
      [rpc({ genesis: async () => PROOF_GENESIS["mainnet-beta"] }), "wrong-genesis"],
      [rpc({ status: async () => null }), "not-found"],
      [
        rpc({ status: async () => ({ confirmationStatus: "processed", err: null, slot: 1 }) }),
        "pending",
      ],
      [
        rpc({
          status: async () => ({
            confirmationStatus: "confirmed",
            err: { InstructionError: [0, "x"] },
            slot: 1,
          }),
        }),
        "failed",
      ],
      [rpc({}, null), "pending"],
      [
        rpc({
          genesis: async () => {
            throw new Error("429 Too Many Requests");
          },
        }),
        "rate-limited",
      ],
      [
        rpc({
          genesis: async () => {
            throw new Error("fetch failed");
          },
        }),
        "rpc-unavailable",
      ],
      [rpc({}, tx({ logs: ["Program log: Instruction: Swap"] })), "not-a-dbc-launch"],
      [rpc({}, tx({ instructions: [{ programIndex: 0, accounts: [3] }] })), "not-a-dbc-launch"],
      [rpc({}, tx(), k()), "incomplete-link"], // spoofed owner
      [rpc({}, tx({ preBalances: [5e9, 0, 0, 9, 1] })), "incomplete-link"], // pool pre-existed
      [rpc(), "account-mismatch", dec({ derivePool: () => k() })],
      [
        rpc(),
        "account-mismatch",
        dec({ pool: (d) => (d[0] === 1 ? { ...decodedPool, creator: k() } : null) }),
      ],
      [rpc(), "account-mismatch", dec({ config: () => null })],
      [
        rpc(
          {
            accounts: async (ks) => ({
              slot: 1,
              values: ks.map(() => ({ owner: DBC_PROGRAM, lamports: 1, data: POOL_DATA })),
            }),
          },
          tx({
            accountKeys: [...tx().accountKeys, { pubkey: k(), signer: false, writable: true }],
            preBalances: [...tx().preBalances, 0],
            postBalances: [...tx().postBalances, 1],
            instructions: [{ programIndex: 4, accounts: [0, 1, 2, 3, 5] }],
          }),
        ),
        "ambiguous",
      ],
    ];
    for (const [r, code, d] of cases) {
      const out = await go(r, d);
      expect(out.ok, code).toBe(false);
      if (!out.ok) expect(out.code).toBe(code);
    }
    for (const input of [
      { network: "testnet", signature: SIG },
      { network: "devnet", signature: "abc" },
    ]) {
      const out = await go(rpc(), dec(), input);
      expect(!out.ok && out.code).toBe("invalid-input");
    }
  });

  it("bounds account reads: too many candidates is refused", async () => {
    const many = Array.from({ length: 20 }, () => ({ pubkey: k(), signer: false, writable: true }));
    const t = tx({
      accountKeys: [...tx().accountKeys, ...many],
      preBalances: [...tx().preBalances, ...many.map(() => 0)],
      postBalances: [...tx().postBalances, ...many.map(() => 1)],
      instructions: [{ programIndex: 4, accounts: [3, ...many.map((_, i) => 5 + i)] }],
    });
    let reads = 0;
    const out = await go(
      rpc(
        {
          accounts: async () => {
            reads++;
            return { slot: 1, values: [] };
          },
        },
        t,
      ),
    );
    expect(!out.ok && out.code).toBe("oversized");
    expect(reads).toBe(0);
  });

  it("keeps a bounded local intent list and drops malformed rows", () => {
    const store = new Map<string, string>();
    const s = {
      getItem: (x: string) => store.get(x) ?? null,
      setItem: (x: string, v: string) => void store.set(x, v),
    };
    for (let i = 0; i < 15; i++)
      saveIntent(s, {
        signature: sig(i + 1),
        network: "devnet",
        intentHash: "a".repeat(64),
        symbol: "QLI",
        savedAt: i,
      });
    expect(readIntents(s)).toHaveLength(10);
    store.set("qli.launch-intents.v1", JSON.stringify([{ signature: "x", seed: "secret" }]));
    expect(readIntents(s)).toEqual([]);
  });

  it("decodes with the real SDK coder and rejects non-DBC bytes", async () => {
    const { sdkDecoder } = await import("@/lib/qli-core/launch-proof.server");
    const { Connection } = await import("@solana/web3.js");
    const d = sdkDecoder(new Connection("http://127.0.0.1:1"));
    expect(d.pool(new Uint8Array(400))).toBeNull();
    expect(d.config(new Uint8Array(400))).toBeNull();
    const { deriveDbcPoolAddress } = await import("@meteora-ag/dynamic-bonding-curve-sdk");
    expect(d.derivePool(quote, mint, config)).toBe(
      deriveDbcPoolAddress(
        new PublicKey(quote),
        new PublicKey(mint),
        new PublicKey(config),
      ).toBase58(),
    );
  }, 30_000); // cold dynamic import of the Meteora SDK under full-suite load

  it("rate-limits per client key", async () => {
    const { rateLimited, RATE } = await import("@/lib/qli-core/launch-proof.server");
    const t = 1_000_000;
    for (let i = 0; i < RATE.perMinute; i++) expect(rateLimited("ip-x", t)).toBe(false);
    expect(rateLimited("ip-x", t)).toBe(true);
    expect(rateLimited("ip-x", t + 61_000)).toBe(false);
  });
});
