// @vitest-environment node
import { describe, expect, it } from "vitest";
import BN from "bn.js";
import { Keypair, PublicKey } from "@solana/web3.js";
import {
  ExtensionType,
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  MINT_SIZE,
  MintLayout,
  getMintLen,
  getExtraAccountMetaAddress,
} from "@solana/spl-token";
import * as sdk from "@meteora-ag/dynamic-bonding-curve-sdk";
import {
  SDK_LIMITS,
  MIGRATION_FEE_OPTIONS,
  defaultPolicy,
  validatePolicy,
  scheduleParams,
  feeNumeratorAtPeriod,
  feeOnAmount,
  compareScenarios,
  buildManifest,
  importManifest,
  launchMappable,
  classifyParams,
  evaluateRules,
  parseAtomic,
  policySchema,
  type HookPolicy,
} from "@/lib/qli-core/hook-forge";
import {
  inspectMint,
  parseProgramDataAuthority,
  UPGRADEABLE_LOADER,
  type InspectRpc,
  type RawAccount,
} from "@/lib/qli-core/hook-forge.server";
import { PROOF_GENESIS } from "@/lib/qli-core/launch-proof";
import type { Snapshot } from "@/lib/qli-core/lifecycle";

const sched = (
  mode: "linear" | "exponential",
  s: number,
  e: number,
  n: number,
  d: number,
): HookPolicy => ({
  ...defaultPolicy(),
  baseFee: { mode, startingBps: s, endingBps: e, numberOfPeriod: n, totalDuration: d },
});

describe("Hook Forge SDK parity", () => {
  it("constants match the pinned SDK", () => {
    expect(Number(SDK_LIMITS.FEE_DENOMINATOR)).toBe(sdk.FEE_DENOMINATOR);
    expect(SDK_LIMITS.MIN_FEE_BPS).toBe(sdk.MIN_FEE_BPS);
    expect(SDK_LIMITS.MAX_FEE_BPS).toBe(sdk.MAX_FEE_BPS);
    expect(Number(SDK_LIMITS.MAX_BASIS_POINT)).toBe(sdk.MAX_BASIS_POINT);
    expect(Number(SDK_LIMITS.PROTOCOL_FEE_PERCENT)).toBe(sdk.PROTOCOL_FEE_PERCENT);
    for (const k of Object.keys(MIGRATION_FEE_OPTIONS))
      expect(k in sdk.MigrationFeeOption).toBe(true);
  });
  for (const [mode, s, e, n, d] of [
    ["linear", 5000, 100, 10, 600],
    ["exponential", 2500, 100, 20, 1200],
    ["exponential", 9900, 25, 100, 100],
  ] as const) {
    it(`schedule params and per-period numerators match SDK (${mode} ${s}->${e})`, () => {
      const ours = scheduleParams(sched(mode, s, e, n, d));
      const theirs = sdk.getFeeSchedulerParams(
        s,
        e,
        mode === "linear"
          ? sdk.BaseFeeMode.FeeSchedulerLinear
          : sdk.BaseFeeMode.FeeSchedulerExponential,
        n,
        d,
      );
      expect(ours.cliffFeeNumerator.toString()).toBe(theirs.cliffFeeNumerator.toString());
      expect(ours.periodFrequency.toString()).toBe(theirs.secondFactor.toString());
      expect(ours.reductionFactor.toString()).toBe(theirs.thirdFactor.toString());
      for (const period of [0, 1, Math.floor(n / 2), n, n + 5]) {
        const sdkN = sdk.getBaseFeeNumeratorByPeriod(
          theirs.cliffFeeNumerator,
          n,
          new BN(period),
          theirs.thirdFactor,
          theirs.baseFeeMode,
        );
        expect(feeNumeratorAtPeriod(ours, period).toString()).toBe(sdkN.toString());
      }
    });
  }
  it("fee on amount matches SDK rounding", () => {
    const num = 10_000_000n;
    for (const a of [0n, 1n, 999n, 123_456_789n, 2n ** 64n - 1n]) {
      const r = feeOnAmount(num, a);
      const s = sdk.getFeeOnAmount(
        new BN(num.toString()),
        new BN(a.toString()),
        {} as never,
        false,
      );
      expect(r.protocolFee.toString()).toBe(s.protocolFee.toString());
      expect(r.tradingFee.toString()).toBe(s.tradingFee.toString());
      expect(r.amountAfterFee.toString()).toBe(s.amount.toString());
    }
  });
});

describe("Hook Forge validation edges", () => {
  it("default policy is valid and launch-mappable", () => {
    expect(validatePolicy(defaultPolicy()).filter((f) => f.severity === "error")).toEqual([]);
    expect(launchMappable(defaultPolicy())).toBe(true);
  });
  it("rejects zero, inverted and over-limit fees", () => {
    const errs = (p: HookPolicy) => validatePolicy(p).filter((f) => f.severity === "error").length;
    expect(
      errs({
        ...defaultPolicy(),
        baseFee: {
          mode: "flat",
          startingBps: 0,
          endingBps: 0,
          numberOfPeriod: 0,
          totalDuration: 0,
        },
      }),
    ).toBeGreaterThan(0);
    expect(errs(sched("linear", 100, 500, 10, 100))).toBeGreaterThan(0);
    expect(errs(sched("linear", 9950, 100, 10, 100))).toBeGreaterThan(0);
    expect(errs(sched("linear", 500, 100, 0, 0))).toBeGreaterThan(0);
    expect(errs(sched("linear", 500, 100, 7, 100))).toBeGreaterThan(0);
    expect(errs(sched("linear", 500, 100, 70_000, 70_000))).toBeGreaterThan(0);
  });
  it("schema rejects negative, non-integer and non-finite input", () => {
    expect(
      policySchema.safeParse({ ...defaultPolicy(), creatorTradingFeePercent: -1 }).success,
    ).toBe(false);
    expect(
      policySchema.safeParse({ ...defaultPolicy(), creatorTradingFeePercent: 1.5 }).success,
    ).toBe(false);
    expect(policySchema.safeParse({ ...defaultPolicy(), initialMarketCap: Infinity }).success).toBe(
      false,
    );
  });
  it("amount parsing blocks negatives and u64 overflow", () => {
    expect(parseAtomic("-1")).toBeNull();
    expect(parseAtomic("18446744073709551616")).toBeNull();
    expect(parseAtomic("18446744073709551615")).toBe(2n ** 64n - 1n);
    expect(() => feeOnAmount(1n, 2n ** 64n)).toThrow();
  });
  it("schedules, Token-2022 and custom hooks are export-only or blocked", () => {
    expect(launchMappable(sched("linear", 5000, 100, 10, 600))).toBe(false);
    const t22 = { ...defaultPolicy(), tokenType: "token2022" as const };
    expect(launchMappable(t22)).toBe(false);
    const custom = {
      ...defaultPolicy(),
      advisory: { transferConstraint: false, customTransferHook: true },
    };
    expect(
      validatePolicy(custom).some((f) => f.severity === "error" && f.field === "advisory"),
    ).toBe(true);
    expect(
      classifyParams(custom).find((c) => c.field === "Custom transfer hook")?.launchForge,
    ).toBe("unsupported");
  });
  it("scenario comparison splits creator and partner exactly", () => {
    const rows = compareScenarios([defaultPolicy()], 1_000_000_000n, [0]);
    const r = rows[0]!;
    expect(r.totalFee).toBe("10000000");
    expect(BigInt(r.creatorShare) + BigInt(r.partnerShare)).toBe(BigInt(r.tradingFee));
  });
});

describe("Hook Forge manifest", () => {
  it("round-trips and detects tampering", async () => {
    const m = await buildManifest([defaultPolicy()], "2026-10-11T00:00:00.000Z");
    expect(m.digest).toMatch(/^[0-9a-f]{64}$/);
    expect((await importManifest(JSON.stringify(m))).ok).toBe(true);
    const t = structuredClone(m);
    t.policies[0]!.creatorTradingFeePercent = 99;
    expect(await importManifest(JSON.stringify(t))).toMatchObject({
      ok: false,
      error: expect.stringMatching(/Digest mismatch/),
    });
    expect((await importManifest(JSON.stringify({ ...m, version: "v0" }))).ok).toBe(false);
    expect((await importManifest(JSON.stringify({ ...m, note: "private_key: x" }))).ok).toBe(false);
    expect((await importManifest("{")).ok).toBe(false);
  });
});

describe("Hook Forge monitor rules", () => {
  it("reports no-evidence without a verified snapshot", () => {
    expect(
      evaluateRules([{ id: "a", kind: "curve-progress", threshold: "50" }], null)[0]!.status,
    ).toBe("no-evidence");
  });
  it("evaluates against snapshot facts with source", () => {
    const snap = {
      network: "devnet",
      observedSlot: 42,
      facts: { migrationProgress: 60, isMigrated: 0, totalTradingQuoteFee: "500" },
    } as unknown as Snapshot;
    const r = evaluateRules(
      [
        { id: "a", kind: "curve-progress", threshold: "50" },
        { id: "b", kind: "migration-flag", threshold: "1" },
        { id: "c", kind: "quote-fee-threshold", threshold: "501" },
      ],
      snap,
    );
    expect(r.map((x) => x.status)).toEqual(["triggered", "not-triggered", "not-triggered"]);
    expect(r[0]!.source).toMatch(/slot 42/);
  });
});

// ---------- Inspector with a fake RPC ----------
const mintAddr = Keypair.generate().publicKey;
const hookProgram = Keypair.generate().publicKey;
const programData = Keypair.generate().publicKey;

function baseMint(len: number, auth: PublicKey | null) {
  const d = Buffer.alloc(len);
  MintLayout.encode(
    {
      mintAuthorityOption: auth ? 1 : 0,
      mintAuthority: auth ?? PublicKey.default,
      supply: 1000n,
      decimals: 6,
      isInitialized: true,
      freezeAuthorityOption: 0,
      freezeAuthority: PublicKey.default,
    },
    d,
  );
  return d;
}
function t22WithHook(program: PublicKey) {
  const len = getMintLen([ExtensionType.TransferHook]);
  const d = baseMint(len, null);
  d[165] = 1; // AccountType::Mint
  let o = 166;
  d.writeUInt16LE(ExtensionType.TransferHook, o);
  d.writeUInt16LE(64, o + 2);
  o += 4;
  Keypair.generate().publicKey.toBuffer().copy(d, o);
  program.toBuffer().copy(d, o + 32);
  return d;
}
function fakeRpc(
  map: Record<string, RawAccount>,
  genesis: string = PROOF_GENESIS.devnet,
  failAccounts = false,
): InspectRpc {
  return {
    genesis: async () => genesis,
    accounts: async (a) => {
      if (failAccounts) throw new Error("down");
      return { slot: 77, values: a.map((x) => map[x] ?? null) };
    },
  };
}
const acc = (
  owner: PublicKey | string,
  data: Buffer | Uint8Array,
  executable = false,
): RawAccount => ({
  owner: typeof owner === "string" ? owner : owner.toBase58(),
  data: new Uint8Array(data),
  executable,
  lamports: 1,
});

describe("Hook Inspector (server, fake RPC)", () => {
  it("refuses wrong genesis", async () => {
    const r = await inspectMint(
      "devnet",
      mintAddr.toBase58(),
      fakeRpc({}, PROOF_GENESIS["mainnet-beta"]),
    );
    expect(r.code).toBe("wrong-network");
    expect(r.ok).toBe(false);
  });
  it("reports RPC outage and missing account", async () => {
    expect(
      (await inspectMint("devnet", mintAddr.toBase58(), fakeRpc({}, PROOF_GENESIS.devnet, true)))
        .code,
    ).toBe("rpc-unavailable");
    expect((await inspectMint("devnet", mintAddr.toBase58(), fakeRpc({}))).code).toBe("not-found");
  });
  it("rejects non-token owners (spoofed program)", async () => {
    const r = await inspectMint(
      "devnet",
      mintAddr.toBase58(),
      fakeRpc({
        [mintAddr.toBase58()]: acc(Keypair.generate().publicKey, baseMint(MINT_SIZE, null)),
      }),
    );
    expect(r.code).toBe("not-a-mint");
  });
  it("classifies an ordinary SPL mint as no hook", async () => {
    const r = await inspectMint(
      "devnet",
      mintAddr.toBase58(),
      fakeRpc({
        [mintAddr.toBase58()]: acc(
          TOKEN_PROGRAM_ID,
          baseMint(MINT_SIZE, Keypair.generate().publicKey),
        ),
      }),
    );
    expect(r.code).toBe("spl-token-mint");
    expect(r.transferHook).toBeNull();
    expect(r.permissions[0]!.status).toBe("observed");
  });
  it("decodes a TransferHook, non-executable program, missing metas -> blocked", async () => {
    const r = await inspectMint(
      "devnet",
      mintAddr.toBase58(),
      fakeRpc({
        [mintAddr.toBase58()]: acc(TOKEN_2022_PROGRAM_ID, t22WithHook(hookProgram)),
        [hookProgram.toBase58()]: acc(Keypair.generate().publicKey, Buffer.alloc(8), false),
      }),
    );
    expect(r.code).toBe("ok");
    expect(r.extensions).toContain("TransferHook");
    expect(r.transferHook?.programId).toBe(hookProgram.toBase58());
    expect(r.transferHook?.programExecutable).toBe(false);
    expect(r.transferHook?.extraMetaPda).toBe(
      getExtraAccountMetaAddress(mintAddr, hookProgram).toBase58(),
    );
    expect(r.transferHook?.extraMetaExists).toBe(false);
    expect(r.permissions.find((p) => p.label === "Hook program upgrade authority")?.status).toBe(
      "unknown",
    );
    expect(r.compatibility.verdict).toBe("blocked");
    expect(r.risks.some((x) => /not executable/.test(x.text))).toBe(true);
  });
  it("reads upgradeable hook program authority", async () => {
    const prog = Buffer.alloc(36);
    prog.writeUInt32LE(2, 0);
    programData.toBuffer().copy(prog, 4);
    const auth = Keypair.generate().publicKey;
    const pd = Buffer.alloc(45);
    pd.writeUInt32LE(3, 0);
    pd[12] = 1;
    auth.toBuffer().copy(pd, 13);
    const meta = getExtraAccountMetaAddress(mintAddr, hookProgram).toBase58();
    const r = await inspectMint(
      "devnet",
      mintAddr.toBase58(),
      fakeRpc({
        [mintAddr.toBase58()]: acc(TOKEN_2022_PROGRAM_ID, t22WithHook(hookProgram)),
        [hookProgram.toBase58()]: acc(UPGRADEABLE_LOADER, prog, true),
        [programData.toBase58()]: acc(UPGRADEABLE_LOADER, pd),
        [meta]: acc(hookProgram, Buffer.alloc(16)),
      }),
    );
    expect(r.transferHook?.upgradeable).toBe(true);
    expect(r.transferHook?.upgradeAuthority).toBe(auth.toBase58());
    expect(r.transferHook?.extraMetaExists).toBe(true);
    expect(r.compatibility.verdict).not.toBe("compatible" as never);
  });
  it("programdata parser handles immutable and malformed", () => {
    const pd = Buffer.alloc(13);
    pd.writeUInt32LE(3, 0);
    expect(parseProgramDataAuthority(acc(UPGRADEABLE_LOADER, pd))).toEqual({
      upgradeable: false,
      authority: null,
    });
    expect(parseProgramDataAuthority(acc(Keypair.generate().publicKey, pd))).toBeNull();
  });
});

describe("Hook Forge launch mapping regressions", () => {
  const tc = {
    ...defaultPolicy(),
    advisory: { transferConstraint: true, customTransferHook: false },
  };
  it("advisory transfer constraint is warning-only yet never launch-mappable", () => {
    expect(validatePolicy(tc).some((f) => f.severity === "error")).toBe(false);
    expect(launchMappable(tc)).toBe(false);
    expect(classifyParams(tc).find((c) => c.field === "Transfer constraint")?.launchForge).toBe(
      "unsupported",
    );
  });
  it("custom hook is never launch-mappable", () => {
    expect(
      launchMappable({
        ...defaultPolicy(),
        advisory: { transferConstraint: false, customTransferHook: true },
      }),
    ).toBe(false);
  });
  it("each non-Launch-Forge value blocks mapping", () => {
    const d = defaultPolicy();
    for (const p of [
      { ...d, dynamicFee: false },
      { ...d, collectFeeMode: "output" as const },
      { ...d, migrationFeeOption: "FixedBps25" as const },
      { ...d, activationType: "slot" as const },
      { ...d, tokenType: "token2022" as const },
      {
        ...d,
        lockedVesting: {
          ...d.lockedVesting,
          totalLockedVestingAmount: 10,
          numberOfVestingPeriod: 1,
          totalVestingDuration: 10,
        },
      },
    ])
      expect(launchMappable(p)).toBe(false);
  });
  it("manifest classification follows launchMappable and forged classification is rejected", async () => {
    const m = await buildManifest([tc], "2026-10-11T00:00:00.000Z");
    expect(m.classification[0]!.deployableViaLaunchForge).toBe(false);
    const ok = await importManifest(JSON.stringify(m));
    expect(ok.ok && ok.manifest.classification[0]!.deployableViaLaunchForge).toBe(false);
    const { domainHash } = await import("@/lib/qli-core/neural/canonical");
    const { HOOK_FORGE_DOMAIN } = await import("@/lib/qli-core/hook-forge");
    const forged: Record<string, unknown> = {
      ...m,
      classification: [{ ...m.classification[0]!, deployableViaLaunchForge: true }],
    };
    delete forged["digest"];
    forged["digest"] = await domainHash(HOOK_FORGE_DOMAIN, forged);
    expect((await importManifest(JSON.stringify(forged))).ok).toBe(false);
  });
});

describe("Hook Inspector hardening", () => {
  const mk = () => Keypair.generate().publicKey;
  it("missing hook program is reported as missing and blocked", async () => {
    const m = mk(),
      hp = mk();
    const r = await inspectMint(
      "devnet",
      m.toBase58(),
      fakeRpc({ [m.toBase58()]: acc(TOKEN_2022_PROGRAM_ID, t22WithHook(hp)) }),
    );
    expect(r.transferHook?.programExists).toBe(false);
    expect(r.compatibility.verdict).toBe("blocked");
    expect(r.risks.some((x) => /does not exist/.test(x.text))).toBe(true);
  });
  it("RPC failure on hook read yields unknown, never compatible", async () => {
    const m = mk(),
      hp = mk();
    let n = 0;
    const rpc: InspectRpc = {
      genesis: async () => PROOF_GENESIS.devnet,
      accounts: async (a) => {
        if (n++ > 0) throw new Error("down");
        return { slot: 9, values: a.map(() => acc(TOKEN_2022_PROGRAM_ID, t22WithHook(hp))) };
      },
    };
    const r = await inspectMint("devnet", m.toBase58(), rpc);
    expect(r.permissions.find((p) => p.label === "Hook program upgrade authority")?.status).toBe(
      "unknown",
    );
    expect(r.transferHook?.programExecutable).toBeNull();
    expect(r.compatibility.verdict).toBe("blocked");
  });
  it("Token-2022 without extensions is not-verified, never compatible", async () => {
    const m = mk();
    const d = Buffer.alloc(166);
    d.set(t22WithHook(mk()).subarray(0, 82));
    d[165] = 1;
    const r = await inspectMint(
      "devnet",
      m.toBase58(),
      fakeRpc({ [m.toBase58()]: acc(TOKEN_2022_PROGRAM_ID, d) }),
    );
    expect(r.code).toBe("ok");
    expect(r.transferHook).toBeNull();
    expect(r.compatibility.verdict).toBe("not-verified");
  });
  it("token account (bad account) under Token-2022 is not-a-mint", async () => {
    const m = mk();
    const r = await inspectMint(
      "devnet",
      m.toBase58(),
      fakeRpc({ [m.toBase58()]: acc(TOKEN_2022_PROGRAM_ID, Buffer.alloc(10)) }),
    );
    expect(r.code).toBe("not-a-mint");
  });
  it("mainnet request against devnet RPC is refused", async () => {
    const r = await inspectMint("mainnet-beta", mk().toBase58(), fakeRpc({}));
    expect(r.code).toBe("wrong-network");
  });
  it("rate limiter trips after the per-minute budget", async () => {
    const { lifecycleRateLimited, LIFECYCLE_RATE } =
      await import("@/lib/qli-core/lifecycle.server");
    const key = `hook:test-${Math.random()}`;
    let tripped = false;
    for (let i = 0; i <= LIFECYCLE_RATE.perMinute; i++) tripped = lifecycleRateLimited(key, 1_000);
    expect(tripped).toBe(true);
  });
});
