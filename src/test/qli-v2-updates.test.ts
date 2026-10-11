// @vitest-environment node
import { describe, it, expect, vi } from "vitest";
import { Keypair, PublicKey, type Connection } from "@solana/web3.js";
import { sha256 } from "@noble/hashes/sha256";
import {
  DEVNET_GENESIS,
  UPGRADEABLE_LOADER,
  ACCOUNT_VERSION,
  QUANTUM_VAULT_DEPLOYMENT,
  chainWritesEnabled,
  type VaultAccount,
} from "@/lib/qli-core/quantum-vault";
import { verifyDeployedProgram } from "@/lib/qli-core/vault-verifier";
import {
  analyze,
  dedup,
  formatUnits,
  proposeFromAlerts,
  sentinelStatus,
  SENTINEL_WORKER_COVERAGE,
  type VaultSnapshot,
} from "@/lib/qli-core/vault-sentinel";
import {
  bindingMessage,
  chunkProof,
  feasibility,
  finalize,
  openSession,
  uploadChunk,
} from "@/lib/qli-core/identity-v2";
import { makeDemoProof, verifyWotsProof, DOMAINS, type WotsProof } from "@/lib/qli-core/pq";

const hex = (b: Uint8Array) => Buffer.from(b).toString("hex");
const pid = Keypair.generate().publicKey;
const authority = Keypair.generate().publicKey;
const artifact = Buffer.from("genuine artifact bytes for test");
const art = { sha256: hex(sha256(artifact)), length: artifact.length };

function chain(
  o: {
    genesis?: string;
    padding?: number;
    tamper?: boolean;
    auth?: PublicKey | null;
    exec?: boolean;
    owner?: PublicKey;
    pdPtr?: PublicKey;
  } = {},
) {
  const pdAddr = PublicKey.findProgramAddressSync([pid.toBuffer()], UPGRADEABLE_LOADER)[0];
  const prog = Buffer.alloc(36);
  prog.writeUInt32LE(2);
  (o.pdPtr ?? pdAddr).toBuffer().copy(prog, 4);
  const payload = Buffer.concat([artifact, Buffer.alloc(o.padding ?? 64)]);
  if (o.tamper) payload[0] = (payload[0] ?? 0) ^ 1;
  const pd = Buffer.alloc(45 + payload.length);
  pd.writeUInt32LE(3);
  const a = o.auth === undefined ? authority : o.auth;
  if (a) {
    pd[12] = 1;
    a.toBuffer().copy(pd, 13);
  }
  payload.copy(pd, 45);
  return {
    getGenesisHash: vi.fn(async () => o.genesis ?? DEVNET_GENESIS),
    getSlot: vi.fn(async () => 100),
    getAccountInfo: vi.fn(async (k: PublicKey) =>
      k.equals(pid)
        ? { executable: o.exec ?? true, owner: o.owner ?? UPGRADEABLE_LOADER, data: prog }
        : k.equals(pdAddr)
          ? { executable: false, owner: UPGRADEABLE_LOADER, data: pd }
          : null,
    ),
  } as unknown as Connection;
}
const idl = (address: string) =>
  Buffer.from(JSON.stringify({ address, metadata: { name: "quantum_vault", version: "0.1.0" } }));
const status = (r: Awaited<ReturnType<typeof verifyDeployedProgram>>, id: string) =>
  r.checks.find((c) => c.id === id)?.status;

describe("Program Verifier (read-only)", () => {
  it("passes a genuine payload with zero padding but never enables writes", async () => {
    const r = await verifyDeployedProgram(chain(), {
      programId: pid.toBase58(),
      expectedUpgradeAuthority: authority.toBase58(),
      artifact: art,
      idlBytes: idl(pid.toBase58()),
    });
    expect(r.ok).toBe(true);
    expect(r.writesEnabled).toBe(false);
    expect(QUANTUM_VAULT_DEPLOYMENT).toBeNull();
    expect(chainWritesEnabled()).toBe(false);
  });
  it("rejects mainnet/other genesis", async () => {
    const r = await verifyDeployedProgram(
      chain({ genesis: "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d" }),
      { programId: pid.toBase58(), artifact: art },
    );
    expect(r.ok).toBe(false);
    expect(status(r, "genesis")).toBe("fail");
  });
  it("rejects fake (non-loader / non-executable) programs and non-canonical ProgramData", async () => {
    for (const c of [
      chain({ exec: false }),
      chain({ owner: Keypair.generate().publicKey }),
      chain({ pdPtr: Keypair.generate().publicKey }),
    ]) {
      expect(
        (await verifyDeployedProgram(c, { programId: pid.toBase58(), artifact: art })).ok,
      ).toBe(false);
    }
  });
  it("rejects altered bytecode, non-zero padding, altered authority, immutable and wrong IDL", async () => {
    const base = {
      programId: pid.toBase58(),
      expectedUpgradeAuthority: authority.toBase58(),
      artifact: art,
      idlBytes: idl(pid.toBase58()),
    };
    expect(status(await verifyDeployedProgram(chain({ tamper: true }), base), "bytecode")).toBe(
      "fail",
    );
    const nz = chain({ padding: 4 });
    expect((await verifyDeployedProgram(nz, base)).ok).toBe(true);
    expect(
      status(
        await verifyDeployedProgram(chain({ auth: Keypair.generate().publicKey }), base),
        "authority",
      ),
    ).toBe("fail");
    expect(status(await verifyDeployedProgram(chain({ auth: null }), base), "authority")).toBe(
      "fail",
    );
    expect(
      status(
        await verifyDeployedProgram(chain(), {
          ...base,
          idlBytes: idl(Keypair.generate().publicKey.toBase58()),
        }),
        "idl",
      ),
    ).toBe("fail");
  });
  it("does not report ok when authority or IDL were not checked", async () => {
    const r = await verifyDeployedProgram(chain(), { programId: pid.toBase58(), artifact: art });
    expect(r.ok).toBe(false);
    expect(status(r, "authority")).toBe("not-checked");
  });
  it("rejects invalid address input", async () => {
    expect((await verifyDeployedProgram(chain(), { programId: "not-a-key" })).ok).toBe(false);
  });
});

const k = () => Keypair.generate().publicKey;
const owner = k(),
  mint = k(),
  dest = k();
const st = (o: Partial<VaultAccount> = {}): VaultAccount => ({
  version: ACCOUNT_VERSION,
  bump: 254,
  owner,
  mint,
  vaultId: 1n,
  decimals: 6,
  destination: dest,
  destinationOwner: owner,
  maxPerWithdraw: 100n,
  dailyLimit: 1_000_000n,
  unlockTs: 0n,
  windowStart: 1000n,
  windowSpent: 0n,
  nonce: 3n,
  epoch: 0,
  paused: false,
  unpauseAt: 0n,
  ...o,
});
const snap = (o: Partial<VaultSnapshot> = {}, s: Partial<VaultAccount> = {}): VaultSnapshot => ({
  cluster: "devnet",
  vault: "V",
  programId: "P",
  programSha256: "a",
  upgradeAuthority: "A",
  state: st(s),
  escrowBalance: 5n,
  slot: 10,
  observedAt: 2000,
  ...o,
});

describe("Vault Sentinel", () => {
  it("is honest when no deployment exists and the worker does not cover vaults", () => {
    expect(sentinelStatus(null).kind).toBe("ready-for-first-vault");
    expect(SENTINEL_WORKER_COVERAGE).toBe(false);
  });
  it("formats BigInt amounts exactly", () => {
    expect(formatUnits(18_446_744_073_709_551_615n, 9)).toBe("18446744073.709551615");
    expect(formatUnits(1_500_000n, 6)).toBe("1.5");
  });
  it("detects paused, near limit, nonce jump, authority/program/identity change, stale and slot regression", () => {
    const prev = snap();
    const cur = snap(
      { slot: 9, upgradeAuthority: "B", programSha256: "b" },
      { paused: true, nonce: 9n, windowSpent: 900_000n, mint: k() },
    );
    const codes = analyze(prev, cur, 2000 + 2000).map((a) => a.code);
    for (const c of [
      "paused",
      "near-limit",
      "nonce-jump",
      "authority-changed",
      "program-changed",
      "identity-changed",
      "stale-read",
      "slot-regressed",
    ])
      expect(codes).toContain(c);
  });
  it("resets usage after the fixed 24h window", () => {
    const codes = analyze(null, snap({}, { windowSpent: 900_000n }), 1000 + 86_400).map(
      (a) => a.code,
    );
    expect(codes).not.toContain("near-limit");
  });
  it("dedups alerts and refuses cross-vault comparison", () => {
    const a = analyze(null, snap({}, { paused: true }), 2000);
    expect(dedup([a[0]!.dedupKey], a)).toHaveLength(0);
    expect(() => analyze(snap(), snap({ vault: "W" }), 2000)).toThrow();
  });
  it("proposals are typed, non-executable and carry no transaction bytes", () => {
    const cur = snap({ upgradeAuthority: "B" });
    const p = proposeFromAlerts(cur, analyze(snap(), cur, 2000), 2000)!;
    expect(p.operation).toBe("pause");
    expect(p.executable).toBe(false);
    expect(Object.keys(p)).not.toContain("transaction");
  });
});

describe("Quantum Identity 2.0 feasibility", () => {
  it("reports real limits: proof does not fit one tx, needs chunking, Ed25519 is not PQ", () => {
    const f = feasibility();
    expect(f.proofBytes).toBe(2404);
    expect(f.fitsSingleTx).toBe(false);
    expect(f.chunks).toBeGreaterThanOrEqual(3);
    expect(f.fitsComputeBudget).toBe(true);
    expect(f.status).toMatch(/estimate/);
  });
  it(
    "verifies a bound public-demo proof through the staged state machine; rejects replay, tamper, expiry",
    { timeout: 30_000 },
    async () => {
      const msg = bindingMessage({
        wallet: owner.toBase58(),
        target: "vault:V",
        action: "withdraw",
        genesis: DEVNET_GENESIS,
        nonce: "1",
        expiresAt: 5000,
      });
      const proof: WotsProof = await makeDemoProof(DOMAINS.proof, msg);
      expect(verifyWotsProof(proof).valid).toBe(true);
      const consumed = new Set<string>();
      const verify = () => verifyWotsProof(proof).valid;
      const s = openSession(proof, 1000);
      chunkProof(proof).forEach((c, i) => uploadChunk(s, i, c, 1001));
      expect(() => uploadChunk(s, 0, new Uint8Array(1), 1001)).toThrow(/already/);
      expect(finalize(s, verify, consumed, 1002).authorizes).toBe(false);
      const again = openSession(proof, 1000);
      chunkProof(proof).forEach((c, i) => uploadChunk(again, i, c, 1001));
      expect(() => finalize(again, verify, consumed, 1002)).toThrow(/replay/);
      const t = openSession(proof, 1000);
      chunkProof(proof).forEach((c, i) =>
        uploadChunk(t, i, i === 0 ? Uint8Array.from(c, (b, j) => (j === 5 ? b ^ 1 : b)) : c, 1001),
      );
      expect(() => finalize(t, verify, new Set(), 1002)).toThrow(/commitment/);
      const e = openSession(proof, 1000, 10);
      expect(() => uploadChunk(e, 0, chunkProof(proof)[0]!, 2000)).toThrow(/expired/);
      expect(verifyWotsProof({ ...proof, message: msg.replace("nonce:1", "nonce:2") }).valid).toBe(
        false,
      );
    },
  );
});

describe("Owner devnet runbook consistency", () => {
  it("uses root-anchored paths, devnet only, and never defaults the bytecode hash", async () => {
    const { DEPLOY_RUNBOOK, OWNER_REVIEWED_ARTIFACT } =
      await import("@/lib/qli-core/vault-verifier");
    const all = DEPLOY_RUNBOOK.map((s) => s.cmd).join("\n");
    expect(all.indexOf("mkdir -p programs/target/deploy")).toBeLessThan(
      all.indexOf('solana-keygen new --outfile "$QLI_ROOT/programs'),
    );
    expect(all).not.toMatch(/^cd programs/m);
    expect(all).not.toMatch(/mainnet/i);
    for (const line of all
      .split("\n")
      .filter((l) => /\bdeploy\b|show|dump/.test(l) && /solana program/.test(l)))
      expect(all).toMatch(/--url devnet/);
    expect(all).toContain('BPF_OUT_DIR="$QLI_ROOT/programs/target/deploy"');
    expect(all).toContain('(cd "$QLI_ROOT" && QLI_VAULT_SBF=1');
    for (const v of ["v2.2.20", "v1.57", "0.31.1", "nightly-2025-11-01"]) expect(all).toContain(v);
    expect(all).toContain("LOCAL_BUILD_PROGRAM_ID");
    expect(all).not.toMatch(/cat .*keypair\.json|cat .*owner\.json/);
    expect(OWNER_REVIEWED_ARTIFACT).toBeNull();
    const r = await verifyDeployedProgram(chain(), {
      programId: pid.toBase58(),
      expectedUpgradeAuthority: authority.toBase58(),
      idlBytes: idl(pid.toBase58()),
    });
    expect(status(r, "bytecode")).toBe("not-checked");
    expect(r.ok).toBe(false);
  });
});