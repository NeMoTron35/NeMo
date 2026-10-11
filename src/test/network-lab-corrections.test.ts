// @vitest-environment node
import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { Keypair, SystemProgram, Transaction, PublicKey } from "@solana/web3.js";
import {
  verifyLaunch,
  DBC_PROGRAM,
  PROOF_GENESIS,
  type ProofRpc,
  type ProofDecoder,
} from "@/lib/qli-core/launch-proof";
import {
  dbcProofFromResult,
  laneState,
  readiness,
  verifyHookDeployment,
  type Facts,
  acceptCompletion,
  evidenceKey,
} from "@/lib/qli-core/network-test";
import { BPF_UPGRADEABLE_LOADER } from "@/lib/qli-core/hook-devnet";
import { KNOWN_HOOK_BUILDS } from "@/lib/qli-core/hook-devnet-core";

const ready = (o: Partial<Facts> = {}): Facts => ({
  rpc: { ok: true, genesis: PROOF_GENESIS.devnet, slot: 1 },
  wallet: { connected: true, supportsChain: true, canSignTransaction: true, address: "a" },
  balance: 2e9,
  minLamports: 1e8,
  programsOk: true,
  sessionMatches: true,
  ...o,
});
const st = (f: Facts, id: string, n: "devnet" | "mainnet-beta" = "devnet") =>
  readiness(n, f).find((i) => i.id === id)!.status;

describe("launch proof is DBC-specific", () => {
  it("a finalized SystemProgram.transfer never counts as a DBC launch", async () => {
    const a = Keypair.generate().publicKey,
      b = Keypair.generate().publicKey;
    const ix = SystemProgram.transfer({ fromPubkey: a, toPubkey: b, lamports: 1 });
    const keys = [a, b, SystemProgram.programId].map((k, i) => ({
      pubkey: k.toBase58(),
      signer: i === 0,
      writable: i < 2,
    }));
    void Transaction;
    void PublicKey;
    void ix;
    const rpc: ProofRpc = {
      genesis: async () => PROOF_GENESIS.devnet,
      status: async () => ({ confirmationStatus: "finalized", err: null, slot: 10 }),
      transaction: async () => ({
        slot: 10,
        blockTime: 1,
        err: null,
        accountKeys: keys,
        preBalances: [5, 0, 1],
        postBalances: [4, 1, 1],
        logs: ["Program 11111111111111111111111111111111 success"],
        instructions: [{ programIndex: 2, accounts: [0, 1] }],
      }),
      accounts: async (k) => ({
        slot: 10,
        values: k.map(() => ({
          owner: "11111111111111111111111111111111",
          lamports: 1,
          data: new Uint8Array(),
        })),
      }),
    };
    const dec: ProofDecoder = { pool: () => null, config: () => null, derivePool: () => "x" };
    const res = await verifyLaunch({ network: "devnet", signature: "2".repeat(88) }, rpc, dec);
    expect(res.ok).toBe(false);
    expect(dbcProofFromResult(res, "devnet", "W")).toBe(null);
    expect(st(ready(), "standard-launch")).toBe("requires-owner-signature");
    expect(laneState(ready())).toBe("ready-to-build");
  });
  it("rejects receipts for the other network", () => {
    const res = {
      ok: true,
      observed: {},
      receipt: {
        network: "mainnet-beta",
        genesis: PROOF_GENESIS["mainnet-beta"],
        status: "verified",
        signature: "s",
        slot: "5",
        facts: {
          poolOwner: DBC_PROGRAM,
          poolCreatedInTx: true,
          pool: "p",
          baseMint: "m",
          creator: "m",
          creatorSigned: true,
        },
      },
    } as never;
    expect(dbcProofFromResult(res, "devnet", "W")).toBe(null);
    expect(dbcProofFromResult(res, "mainnet-beta", "m")).toMatchObject({ pool: "p", slot: 5 });
  });
});

describe("session / evidence binding", () => {
  it("never reaches owner-signature when System network differs from the lane", () => {
    expect(st(ready({ sessionMatches: false }), "standard-launch")).toBe("blocked");
    expect(st(ready({ sessionMatches: false }), "standard-launch", "mainnet-beta")).toBe("blocked");
    expect(laneState(ready({ sessionMatches: false }))).toBe("session-mismatch");
  });
});

describe("hook deployment needs live verification", () => {
  const dep = {
    programId: "P",
    verifiedSlot: 1,
    codeFingerprint: KNOWN_HOOK_BUILDS[0]!.fingerprint,
    upgradeAuthority: "A",
  };
  const live = {
    executable: true,
    loader: BPF_UPGRADEABLE_LOADER,
    upgradeAuthority: "A",
    codeFingerprint: dep.codeFingerprint,
    slot: 9,
  };
  it("constant alone is not confirmation", () => {
    expect(verifyHookDeployment(dep, null).status).toBe("unverified");
    expect(st(ready({ hook: verifyHookDeployment(dep, null) }), "hook-deploy")).toBe("blocked");
    expect(st(ready(), "hook-deploy")).toBe("requires-owner-signature");
  });
  it("fake metadata fails: wrong fingerprint, authority, loader, non-executable, unknown build", () => {
    for (const bad of [
      { ...live, codeFingerprint: "f".repeat(64) },
      { ...live, upgradeAuthority: "B" },
      { ...live, loader: "Other" },
      { ...live, executable: false },
    ])
      expect(verifyHookDeployment(dep, bad).status).toBe("unverified");
    const unknown = { ...dep, codeFingerprint: "e".repeat(64) };
    expect(
      verifyHookDeployment(unknown, { ...live, codeFingerprint: unknown.codeFingerprint }).status,
    ).toBe("unverified");
  });
  it("only full live match confirms", () => {
    const v = verifyHookDeployment(dep, live);
    expect(v.status).toBe("verified");
    expect(st(ready({ hook: v }), "hook-deploy")).toBe("confirmed-by-chain");
  });
});

describe("deploy script checksum resolution", () => {
  const run = (dir: string, env: Record<string, string> = {}) =>
    spawnSync("bash", ["scripts/deploy-transfer-hook-devnet.sh"], {
      encoding: "utf8",
      env: {
        ...process.env,
        QLI_HOOK_SHA256: "",
        EXPECTED_FP: "",
        HOME: dir,
        QLI_HOOK_SO: join(dir, "quantum_transfer_hook.so"),
        ...env,
      },
    });
  it("accepts PR #16 layout (<name>.sha256), refuses missing or ambiguous checksum", () => {
    const dir = mkdtempSync(join(tmpdir(), "qli-pr16-"));
    try {
      const so = Buffer.concat([
        Buffer.from([0x7f, 0x45, 0x4c, 0x46]),
        Buffer.from("CODE"),
        Buffer.alloc(8),
      ]);
      writeFileSync(join(dir, "quantum_transfer_hook.so"), so);
      const sha = createHash("sha256").update(so).digest("hex");
      let r = run(dir);
      expect(r.stdout + r.stderr).toMatch(/no checksum file found/);
      writeFileSync(
        join(dir, "quantum_transfer_hook.sha256"),
        `${sha}  quantum_transfer_hook.so\n`,
      );
      r = run(dir);
      expect(r.stdout + r.stderr).toContain(
        createHash("sha256").update(so.subarray(0, 8)).digest("hex"),
      );
      writeFileSync(join(dir, "quantum_transfer_hook.so.sha256"), `${sha}\n`);
      expect(run(dir).stdout).toMatch(/both .* exist/);
      writeFileSync(join(dir, "quantum_transfer_hook.so.sha256"), `${"0".repeat(64)}\n`);
      const bad = run(dir, { QLI_HOOK_SHA256: join(dir, "quantum_transfer_hook.so.sha256") });
      expect(bad.status).not.toBe(0);
      expect(bad.stdout).not.toContain("Deploying");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("owner proof and stale completions", () => {
  const receipt = (creator: string, creatorSigned = true) =>
    ({
      ok: true,
      observed: {},
      receipt: {
        network: "devnet",
        genesis: PROOF_GENESIS.devnet,
        status: "verified",
        signature: "s",
        slot: "5",
        facts: {
          poolOwner: DBC_PROGRAM,
          poolCreatedInTx: true,
          pool: "p",
          baseMint: "m",
          creator,
          creatorSigned,
        },
      },
    }) as never;
  it("requires the connected wallet to be the signing creator", () => {
    expect(dbcProofFromResult(receipt("W"), "devnet", "W")).toMatchObject({ creator: "W" });
    expect(dbcProofFromResult(receipt("OTHER"), "devnet", "W")).toBe(null);
    expect(dbcProofFromResult(receipt("W"), "devnet", null)).toBe(null);
  });
  it("binds evidence to wallet, account, System network, lane and RPC; stale completions dropped", () => {
    const base = {
      walletName: "Phantom",
      address: "A",
      sessionNetwork: "devnet",
      lane: "devnet" as const,
      rpc: "public",
    };
    const k = evidenceKey(base);
    const out = { key: k, balance: 5 };
    expect(acceptCompletion(out, k)).toBe(out);
    for (const change of [
      { address: "B" },
      { address: null },
      { walletName: "Other" },
      { sessionNetwork: "mainnet-beta" },
      { rpc: "custom" },
      { lane: "mainnet-beta" as const },
    ])
      expect(acceptCompletion(out, evidenceKey({ ...base, ...change }))).toBe(null);
  });
});