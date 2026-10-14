// @vitest-environment node
import { describe, expect, it } from "vitest";
import { Keypair, PublicKey } from "@solana/web3.js";
import {
  DAMM_V2_PROGRAM,
  MIGRATION_IX,
  SWAP_HOOK_ACCOUNTS,
  TOKEN_2022,
  TRANSFER_HOOK_POOL_DISC,
  verifyHookProof,
  mintHookProgram,
  decodeQliConfig,
  b58,
  type ChainAccount,
  type ChainTx,
  type ProofDecoder,
  type ProofRpc,
} from "@/lib/qli-core/hook-proof";
import { DBC_PROGRAM, PROOF_GENESIS } from "@/lib/qli-core/launch-proof";
import { derive } from "@/lib/qli-core/hook-proof.server";
import { dbcAccountKind } from "@/lib/qli-core/lifecycle";
import {
  planAccounts,
  signingAllowed,
  HOOK_DEVNET_DEPLOYMENT,
} from "@/lib/qli-core/hook-launch-plan";

const k = () => Keypair.generate().publicKey.toBase58();
const SIGA = "5".repeat(87) + "1";
const sig = (c: string) => b58(new Uint8Array(64).fill(c.charCodeAt(0)));

function mintData(hook: string) {
  const d = new Uint8Array(166 + 4 + 64);
  d[165] = 1;
  d[166] = 14;
  d[168] = 64;
  d.set(new PublicKey(hook).toBytes(), 170 + 32);
  return d;
}
function cfgData(mint: string, paused: boolean) {
  const d = new Uint8Array(333);
  d.set(new TextEncoder().encode("QLIHOOK1"));
  d[8] = 1;
  d[10] = paused ? 1 : 0;
  d.set(new PublicKey(mint).toBytes(), 44);
  return d;
}
const poolData = () => {
  const d = new Uint8Array(64);
  d.set(TRANSFER_HOOK_POOL_DISC);
  return d;
};

type World = ReturnType<typeof world>;
function world() {
  const mint = k(),
    hook = k(),
    pool = k(),
    damm = k();
  const d = derive(mint, hook);
  const acc: Record<string, ChainAccount> = {
    [hook]: {
      owner: "BPFLoaderUpgradeab1e11111111111111111111111",
      executable: true,
      data: new Uint8Array(36),
    },
    [mint]: { owner: TOKEN_2022, executable: false, data: mintData(hook) },
    [d.extraMetas]: { owner: hook, executable: false, data: new Uint8Array(40) },
    [d.qliConfig]: { owner: hook, executable: false, data: cfgData(mint, false) },
    [pool]: { owner: DBC_PROGRAM, executable: false, data: poolData() },
    [damm]: { owner: DAMM_V2_PROGRAM, executable: false, data: new Uint8Array(8) },
  };
  return { mint, hook, pool, damm, acc, txs: {} as Record<string, ChainTx> };
}
const logs = (hook: string, fail = false) => [
  `Program ${TOKEN_2022} invoke [1]`,
  `Program ${hook} invoke [2]`,
  ...(fail
    ? [`Program ${hook} failed: custom program error: 0x5100`]
    : [`Program ${hook} success`]),
];
function rpc(w: World, genesis: string = PROOF_GENESIS.devnet): ProofRpc {
  return {
    derive,
    genesis: async () => genesis,
    accounts: async (a) => ({ slot: 500, values: a.map((x) => w.acc[x] ?? null) }),
    transaction: async (s) => w.txs[s] ?? null,
  };
}
const dec = (migrated = 1): ProofDecoder => ({
  poolState: (d) =>
    d[0] === TRANSFER_HOOK_POOL_DISC[0]
      ? { baseMint: CURRENT.mint, config: k(), isMigrated: migrated }
      : null,
  dbcIxName: (d) => (d[0] === 1 ? "swap2WithTransferHook" : d[0] === 2 ? MIGRATION_IX.name : null),
});
let CURRENT: World;

function transfer(w: World, slot: number, deny: boolean): ChainTx {
  return {
    slot,
    err: deny ? { InstructionError: [0, { Custom: 0x5100 }] } : null,
    confirmation: "finalized",
    accountKeys: [w.mint, TOKEN_2022, w.hook],
    logs: logs(w.hook, deny),
    instructions: [],
  };
}
function swap(w: World, slot: number): ChainTx {
  return {
    slot,
    err: null,
    confirmation: "finalized",
    accountKeys: [w.mint, w.pool],
    logs: logs(w.hook),
    instructions: [
      {
        programId: DBC_PROGRAM,
        accounts: [k(), k(), w.pool, k(), k(), k(), k(), w.mint],
        data: new Uint8Array([1]),
      },
    ],
  };
}
function migration(w: World, slot: number, dammOverride?: string): ChainTx {
  const accounts = Array.from({ length: 25 }, () => k());
  accounts[MIGRATION_IX.virtualPool] = w.pool;
  accounts[MIGRATION_IX.pool] = dammOverride ?? w.damm;
  accounts[MIGRATION_IX.baseMint] = w.mint;
  return {
    slot,
    err: null,
    confirmation: "finalized",
    accountKeys: [w.mint, w.pool, w.damm],
    logs: [],
    instructions: [{ programId: DBC_PROGRAM, accounts, data: new Uint8Array([2]) }],
  };
}
const S = { a: sig("2"), d: sig("3"), s: sig("4"), m: sig("6"), pa: sig("7"), pd: sig("8") };
function full(w: World) {
  w.txs[S.a] = transfer(w, 100, false);
  w.txs[S.d] = transfer(w, 101, true);
  w.txs[S.s] = swap(w, 102);
  w.txs[S.m] = migration(w, 200);
  w.txs[S.pa] = transfer(w, 300, false);
  w.txs[S.pd] = transfer(w, 301, true);
  return [
    { signature: S.a, claim: "transfer-allow" },
    { signature: S.d, claim: "transfer-deny" },
    { signature: S.s, claim: "dbc-swap" },
    { signature: S.m, claim: "migration" },
    { signature: S.pa, claim: "transfer-allow" },
    { signature: S.pd, claim: "transfer-deny" },
  ];
}
const input = (w: World, txs: unknown[] = []) => ({
  network: "devnet",
  mint: w.mint,
  hookProgram: w.hook,
  dbcPool: w.pool,
  dammPool: w.damm,
  txs,
});

describe("Hook Enforcement Proof v2", () => {
  it("reaches POST_GRAD_VERIFIED only with every piece of evidence", async () => {
    const w = (CURRENT = world());
    const r = await verifyHookProof(input(w, full(w)), rpc(w), dec());
    expect(r.tier).toBe("POST_GRAD_VERIFIED");
    expect(r.policy.layout).toBe("qli-research-v1");
    expect(r.receipt?.digest).toMatch(/^[0-9a-f]{64}$/);
    expect(r.txs.find((t) => t.signature === S.pa)?.phase).toBe("post-graduation");
  });
  it("without transactions stops at DEVNET_PROGRAM_DEPLOYED", async () => {
    const w = (CURRENT = world());
    expect((await verifyHookProof(input(w), rpc(w), dec())).tier).toBe("DEVNET_PROGRAM_DEPLOYED");
  });
  it("refuses wrong genesis, mainnet input and malformed input", async () => {
    const w = (CURRENT = world());
    expect(
      (await verifyHookProof(input(w), rpc(w, PROOF_GENESIS["mainnet-beta"]), dec())).code,
    ).toBe("wrong-network");
    expect(
      (await verifyHookProof({ ...input(w), network: "mainnet-beta" }, rpc(w), dec())).code,
    ).toBe("invalid-input");
    expect((await verifyHookProof({ ...input(w), mint: "x" }, rpc(w), dec())).code).toBe(
      "invalid-input",
    );
  });
  it("non-executable hook, unbound mint, classic SPL mint and wrong metas owner fail deployment", async () => {
    for (const mut of [
      (w: World) => (w.acc[w.hook] = { ...w.acc[w.hook]!, executable: false }),
      (w: World) => (w.acc[w.mint] = { ...w.acc[w.mint]!, data: mintData(k()) }),
      (w: World) =>
        (w.acc[w.mint] = {
          ...w.acc[w.mint]!,
          owner: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
        }),
      (w: World) =>
        (w.acc[derive(w.mint, w.hook).extraMetas] = {
          owner: k(),
          executable: false,
          data: new Uint8Array(4),
        }),
    ]) {
      const w = (CURRENT = world());
      mut(w);
      const r = await verifyHookProof(input(w, full(w)), rpc(w), dec());
      expect(["LOCAL_VALIDATOR_TESTED", "LOCAL_UNIT_TESTED", "NOT_CONFIGURED"]).toContain(r.tier);
    }
  });
  it("a failed transfer without hook-attributed logs is not a denial proof", async () => {
    const w = (CURRENT = world());
    const txs = full(w);
    w.txs[S.d] = {
      ...transfer(w, 101, true),
      logs: [
        `Program ${TOKEN_2022} invoke [1]`,
        `Program ${TOKEN_2022} failed: insufficient funds`,
      ],
    };
    const r = await verifyHookProof(input(w, txs), rpc(w), dec());
    expect(r.txs.find((t) => t.signature === S.d)?.status).toBe("unproven");
    expect(r.tier).toBe("DEVNET_PROGRAM_DEPLOYED");
  });
  it("unrelated transactions and fabricated signatures are rejected", async () => {
    const w = (CURRENT = world());
    const txs = full(w);
    w.txs[S.a] = { ...transfer(w, 100, false), accountKeys: [k()] };
    delete w.txs[S.s];
    const r = await verifyHookProof(input(w, txs), rpc(w), dec());
    expect(r.txs.find((t) => t.signature === S.a)?.status).toBe("rejected");
    expect(r.txs.find((t) => t.signature === S.s)?.status).toBe("unproven");
    expect(r.tier).toBe("DEVNET_PROGRAM_DEPLOYED");
  });
  it("migrated flag alone is not migration proof; mismatched DAMM pool is rejected", async () => {
    const w = (CURRENT = world());
    const txs = full(w);
    w.txs[S.m] = migration(w, 200, k());
    const r = await verifyHookProof(input(w, txs), rpc(w), dec(1));
    expect(r.tier).toBe("DBC_VERIFIED");
    const w2 = (CURRENT = world());
    const t2 = full(w2).filter((t) => t.claim !== "migration");
    expect((await verifyHookProof(input(w2, t2), rpc(w2), dec(1))).tier).toBe("DBC_VERIFIED");
  });
  it("a VirtualPool or non-DBC owner is not a TransferHookPool", async () => {
    const w = (CURRENT = world());
    w.acc[w.pool] = {
      owner: DBC_PROGRAM,
      executable: false,
      data: new Uint8Array([213, 224, 5, 209, 98, 69, 119, 92]),
    };
    const r = await verifyHookProof(input(w, full(w)), rpc(w), dec());
    expect(r.checks.find((c) => c.id === "dbc-pool")?.status).toBe("fail");
    expect(r.tier).toBe("DEVNET_PROGRAM_DEPLOYED");
  });
  it("RPC outage reports unavailable", async () => {
    const w = (CURRENT = world());
    const r = await verifyHookProof(
      input(w),
      {
        ...rpc(w),
        accounts: async () => {
          throw new Error("down");
        },
      },
      dec(),
    );
    expect(r.code).toBe("rpc-unavailable");
  });
  it("TLV helpers parse mint hook and QLi config", () => {
    const h = k();
    expect(mintHookProgram(mintData(h))).toBe(h);
    expect(mintHookProgram(new Uint8Array(10))).toBeNull();
    const m = k();
    expect(decodeQliConfig(cfgData(m, true))).toMatchObject({ paused: true, mint: m });
    expect(decodeQliConfig(new Uint8Array(333))).toBeNull();
    void SIGA;
  });
});

describe("TransferHookPool on legacy lifecycle pages", () => {
  it("is detected by discriminator, distinct from VirtualPool", () => {
    expect(dbcAccountKind(poolData())).toBe("transferHookPool");
    expect(dbcAccountKind(new Uint8Array([213, 224, 5, 209, 98, 69, 119, 92]))).toBe("virtualPool");
    expect(dbcAccountKind(new Uint8Array(8))).toBeNull();
  });
  it("discriminators match the pinned SDK IDL", async () => {
    const sdk = await import("@meteora-ag/dynamic-bonding-curve-sdk");
    const idl = sdk.DynamicBondingCurveIdl as unknown as {
      accounts: { name: string; discriminator: number[] }[];
      instructions: { name: string; accounts: { name: string }[] }[];
    };
    expect(idl.accounts.find((a) => a.name === "TransferHookPool")?.discriminator).toEqual([
      ...TRANSFER_HOOK_POOL_DISC,
    ]);
    const mig = idl.instructions.find((i) => i.name === "migration_damm_v2")!;
    expect(mig.accounts[MIGRATION_IX.virtualPool]!.name).toBe("virtual_pool");
    expect(mig.accounts[MIGRATION_IX.pool]!.name).toBe("pool");
    expect(mig.accounts[MIGRATION_IX.baseMint]!.name).toBe("base_mint");
    const sw = idl.instructions.find((i) => i.name === "swap2_with_transfer_hook")!;
    expect(sw.accounts[SWAP_HOOK_ACCOUNTS.pool]!.name).toBe("pool");
    expect(sw.accounts[SWAP_HOOK_ACCOUNTS.baseMint]!.name).toBe("base_mint");
    const { decodeDbcIxName } = await import("@/lib/qli-core/lifecycle-sdk");
    const disc = (
      idl.instructions.find((i) => i.name === "migration_damm_v2") as unknown as {
        discriminator: number[];
      }
    ).discriminator;
    expect(decodeDbcIxName(new Uint8Array(disc))).toBe(MIGRATION_IX.name);
    const sd = (
      idl.instructions.find((i) => i.name === "swap2_with_transfer_hook") as unknown as {
        discriminator: number[];
      }
    ).discriminator;
    expect(
      decodeDbcIxName(new Uint8Array([...sd, ...new Uint8Array(64)]))?.startsWith(
        "swap2WithTransferHook",
      ),
    ).toBe(true);
    expect(sdk.DAMM_V2_PROGRAM_ID.toBase58()).toBe(DAMM_V2_PROGRAM);
  }, 30_000);
  it("lifecycle loader returns transfer-hook-pool instead of misreporting", async () => {
    const { loadSnapshot } = await import("@/lib/qli-core/lifecycle.server");
    const r = await loadSnapshot("devnet", k(), {
      provider: "t",
      genesis: async () => PROOF_GENESIS.devnet,
      accounts: async () => ({
        slot: 1,
        values: [{ owner: DBC_PROGRAM, lamports: 1, data: poolData() }],
      }),
      currentPoint: async () => "0",
      signatures: async () => [],
      transactions: async () => [],
    });
    expect(!r.ok && r.code).toBe("transfer-hook-pool");
  }, 30_000);
});

describe("Hook launch plan gating", () => {
  it("signing stays blocked and mainnet is refused", () => {
    expect(HOOK_DEVNET_DEPLOYMENT).toBeNull();
    expect(signingAllowed("devnet").allowed).toBe(false);
    expect(signingAllowed("mainnet-beta").reasons[0]).toMatch(/Mainnet/);
  });
  it("derives the interface-standard extra metas PDA", () => {
    const m = k(),
      h = k();
    expect(planAccounts(m, h)?.extraAccountMetaList).toBe(derive(m, h).extraMetas);
    expect(planAccounts("x", h)).toBeNull();
  });
});
