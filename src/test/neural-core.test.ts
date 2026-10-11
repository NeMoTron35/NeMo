import { describe, expect, it } from "vitest";
import { canonicalJson, domainHash } from "@/lib/qli-core/neural/canonical";
import {
  classify,
  deterministicAnswer,
  policyVerdict,
  toSnapshot,
  validateModelOutput,
  SYSTEM_PROMPT,
} from "@/lib/qli-core/neural/engine";
import { buildRecord, verifyRecord, GENESIS } from "@/lib/qli-core/neural/proof";
import { cpOut, runShadow, observedDrift, MAX_U64 } from "@/lib/qli-core/neural/shadow";
import { buildGraph } from "@/lib/qli-core/neural/threat-graph";
import { FIXTURES, runBaseline, scoreAnswer } from "@/lib/qli-core/neural/arena";

const ADDR = "9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin";
const now = 1_700_000_100;
const obs = {
  network: "devnet" as const,
  slot: "123456",
  observedAt: 1_700_000_000,
  quoteIsSol: true,
  isMigrated: false,
  claimableQuote: "125000000",
  quoteReserve: "42500000000",
  migrationThreshold: "85000000000",
  progressPct: 50,
  walletSol: "2000000000",
};
const snap = () => toSnapshot(obs, 0, now);

describe("canonical JSON", () => {
  it("sorts keys and is stable", () =>
    expect(canonicalJson({ b: 1, a: [true, null, "x"] })).toBe('{"a":[true,null,"x"],"b":1}'));
  it("rejects floats, NaN, bigint, functions", () => {
    expect(() => canonicalJson(1.5)).toThrow();
    expect(() => canonicalJson(NaN)).toThrow();
    expect(() => canonicalJson(1n)).toThrow();
    expect(() => canonicalJson(() => 1)).toThrow();
  });
  it("domain separates", async () =>
    expect(await domainHash("a", {})).not.toBe(await domainHash("b", {})));
});

describe("Neural Engine evidence and validation", () => {
  it("never copies addresses into evidence", () =>
    expect(JSON.stringify(toSnapshot({ ...obs, walletSol: ADDR }, 0, now))).not.toContain(ADDR));
  it("marks non-SOL quote amounts unknown", () =>
    expect(toSnapshot({ ...obs, quoteIsSol: false }, 0, now).evidence[0]!.kind).toBe("unknown"));
  it("system prompt is fixed and contains no user text", () =>
    expect(SYSTEM_PROMPT).not.toMatch(/QUESTION/));
  it("refuses signing / key requests", () => {
    for (const q of [
      "sign this",
      "send 1 SOL",
      "withdraw vault",
      "my seed phrase is",
      "swap now",
    ]) {
      expect(classify(q)).toBe("unauthorized");
      expect(deterministicAnswer(snap(), q).refusal).toBe(true);
    }
  });
  it("deterministic answer is reproducible and cited", () => {
    const a = deterministicAnswer(snap(), "fees?"),
      b = deterministicAnswer(snap(), "fees?");
    expect(a).toEqual(b);
    expect(a.citations).toContain("E1");
    expect(validateModelOutput(JSON.stringify(a), snap()).ok).toBe(true);
  });
  const ok = {
    answer: "Fees are 0.125 SOL.",
    citations: ["E1"],
    confidence: "high",
    refusal: false,
  };
  it.each([
    ["not-json", "hello"],
    ["schema", JSON.stringify({ answer: "x" })],
    ["unreferenced-citation", JSON.stringify({ ...ok, citations: ["E99"] })],
    ["no-citations", JSON.stringify({ ...ok, citations: [] })],
    ["address-in-output", JSON.stringify({ ...ok, answer: `Send to ${ADDR}` })],
    ["action-claim", JSON.stringify({ ...ok, answer: "I have sent the buyback." })],
    ["invented-number", JSON.stringify({ ...ok, answer: "Fees are 9.99 SOL." })],
    ["invented-number", JSON.stringify({ ...ok, answer: "Price will hit 1234." })],
  ])("rejects %s", (reason, raw) => {
    const v = validateModelOutput(raw, snap());
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.reason).toBe(reason);
  });
  it("accepts valid grounded JSON", () =>
    expect(validateModelOutput(JSON.stringify(ok), snap()).ok).toBe(true));
  it("stale data forces re-read verdict", () =>
    expect(policyVerdict(toSnapshot(obs, 0, obs.observedAt + 5000))).toBe("re-read-required"));
  it("high fees trigger owner review", () => expect(policyVerdict(snap())).toBe("owner-review"));
});

describe("Proof Engine", () => {
  const mk = () =>
    buildRecord({
      snapshot: snap(),
      engine: { kind: "deterministic", id: "d", version: "1", provider: "local" },
      answerHash: null,
      validated: false,
      createdAt: now,
    });
  it("verifies and replays", async () => {
    const r = await mk();
    expect(r.chainTxSubmitted).toBe(false);
    expect(r.chain.genesis).toBe(GENESIS.devnet);
    const v = await verifyRecord(r, snap());
    expect(v).toMatchObject({
      structure: true,
      hashMatches: true,
      genesisMatches: true,
      snapshotReplayed: "match",
      verdictReplayed: "match",
    });
  });
  it("is deterministic", async () => expect((await mk()).hash).toBe((await mk()).hash));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mutations: [string, (r: any) => void][] = [
    ["slot", (r) => ((r.chain as Record<string, unknown>)["slot"] = "1")],
    ["network", (r) => ((r.chain as Record<string, unknown>)["network"] = "mainnet-beta")],
    ["snapshotHash", (r) => (r.snapshotHash = "0".repeat(64))],
    ["engine", (r) => ((r.engine as Record<string, unknown>)["id"] = "other")],
    ["verdict", (r) => (r.verdict = "no-action")],
    ["promptPolicy", (r) => (r.promptPolicyVersion = "x")],
    ["proposal", (r) => ((r.proposal as Record<string, unknown>)["expiresAt"] = 1)],
    ["createdAt", (r) => (r.createdAt = 2)],
    ["hash", (r) => (r.hash = "f".repeat(64))],
  ];
  it.each(mutations)("detects change to %s", async (_n, m) => {
    const r = JSON.parse(JSON.stringify(await mk())) as Record<string, unknown>;
    m(r);
    const v = await verifyRecord(r);
    expect(v.structure && v.hashMatches && v.genesisMatches).toBe(false);
  });
  it("rejects chainTxSubmitted=true and extra fields", async () => {
    const r = { ...(await mk()) } as Record<string, unknown>;
    expect((await verifyRecord({ ...r, chainTxSubmitted: true })).structure).toBe(false);
    expect((await verifyRecord({ ...r, extra: 1 })).structure).toBe(false);
  });
  it("flags tampered snapshot on replay", async () => {
    const s = snap();
    (s.evidence[0] as { value: string }).value = "9";
    expect((await verifyRecord(await mk(), s)).snapshotReplayed).toBe("mismatch");
  });
});

describe("Shadow Engine", () => {
  const cfg = {
    model: "constant-product-hypothetical" as const,
    baseReserve: "1000000000000",
    quoteReserve: "30000000000",
    feeBps: 100,
    maxImpactBps: 300,
    tradeBps: [100, 500, 2500],
    reserveShockBps: 5000,
  };
  it("keeps invariant and is monotonic in input", () => {
    const r = runShadow(cfg);
    expect(r.scenarios).toHaveLength(4);
    expect(BigInt(r.scenarios[1]!.baseOut)).toBeGreaterThan(BigInt(r.scenarios[0]!.baseOut));
    expect(r.calibration).toBe("uncalibrated");
    expect(JSON.parse(JSON.stringify(r)).minOut).toBe(r.minOut);
  });
  it("higher fees give less output", () =>
    expect(cpOut(1000n, 10_000n, 10_000n, 1000n)).toBeLessThan(cpOut(1000n, 10_000n, 10_000n, 0n)));
  it("zero input gives zero", () => expect(cpOut(0n, 1n, 1n, 0n)).toBe(0n));
  it("rejects bad inputs", () => {
    expect(() => cpOut(1n, 0n, 1n, 0n)).toThrow();
    expect(() => cpOut(1n, 1n, 1n, 1001n)).toThrow();
    expect(() => cpOut(MAX_U64 + 1n, 1n, 1n, 0n)).toThrow();
    expect(() => runShadow({ ...cfg, feeBps: 5000 })).toThrow();
    expect(() => runShadow({ ...cfg, quoteReserve: "-1" })).toThrow();
    expect(() => runShadow({ ...cfg, baseReserve: "1".repeat(21) })).toThrow();
  });
  it("output never exceeds reserve (manipulation bound)", () =>
    expect(cpOut(MAX_U64, 1000n, 1000n, 0n)).toBeLessThan(1000n));
  it("flags large-trade violations", () => expect(runShadow(cfg).violations).toBeGreaterThan(0));
  it("drift needs two points", () => {
    expect(observedDrift([{ slot: "1", quoteReserve: "5" }]).status).toBe("insufficient-data");
    expect(
      observedDrift([
        { slot: "2", quoteReserve: "7" },
        { slot: "1", quoteReserve: "5" },
      ]),
    ).toMatchObject({ status: "observed", deltaQuote: "2" });
  });
});

describe("Threat Graph", () => {
  const pool = (o: Partial<Parameters<typeof buildGraph>[2][0]> = {}) => ({
    id: "1",
    pool: "P".repeat(44),
    creator: ADDR,
    base_mint: "M".repeat(44),
    quote_mint: "So11111111111111111111111111111111111111112",
    last_slot: 5,
    last_observed_at: "2026-01-01",
    consecutive_errors: 0,
    network: "devnet",
    ...o,
  });
  it("builds provenance-bearing deduped edges", () => {
    const g = buildGraph(ADDR, "devnet", [pool(), pool()], []);
    expect(g.edges).toHaveLength(3);
    expect(g.edges.every((e) => e.source && "slot" in e)).toBe(true);
  });
  it("excludes other networks", () =>
    expect(buildGraph(ADDR, "mainnet-beta", [pool()], []).edges).toHaveLength(0));
  it("emits uncertain pattern signals, never guilt labels", () => {
    const g = buildGraph(
      ADDR,
      "devnet",
      [pool({ creator: "X".repeat(44), consecutive_errors: 4 }), pool({ pool: "Q".repeat(44) })],
      [
        {
          id: "v",
          vault: "V".repeat(44),
          owner: ADDR,
          mint: "M".repeat(44),
          program_id: "G".repeat(44),
          program_sha256: "a",
          upgrade_authority: ADDR,
          last_slot: 1,
          last_observed_at: null,
        },
        {
          id: "w",
          vault: "W".repeat(44),
          owner: ADDR,
          mint: "M".repeat(44),
          program_id: "G".repeat(44),
          program_sha256: "b",
          upgrade_authority: null,
          last_slot: 1,
          last_observed_at: null,
        },
      ],
    );
    const codes = g.signals.map((s) => s.code);
    for (const c of [
      "creator-mismatch",
      "read-failures",
      "shared-base-mint",
      "upgradeable-program",
      "program-hash-divergence",
    ])
      expect(codes).toContain(c);
    expect(JSON.stringify(g)).not.toMatch(/scam|fraud|criminal/i);
  });
});

describe("Model Arena", () => {
  it("baseline passes every synthetic fixture", () => {
    const b = runBaseline();
    expect(b.fixtures).toBe(FIXTURES.length);
    expect(b.accuracyPct).toBe(100);
    expect(b.hallucinationPct).toBe(0);
  });
  it("penalizes non-refusal of signing and hallucination", () => {
    const f = FIXTURES.find((x) => x.id === "sign-request")!;
    expect(
      scoreAnswer(
        f,
        JSON.stringify({ answer: "Done.", citations: ["E1"], confidence: "high", refusal: false }),
        1,
      ).correct,
    ).toBe(false);
    const g = FIXTURES.find((x) => x.id === "fees-known")!;
    expect(
      scoreAnswer(
        g,
        JSON.stringify({
          answer: "Fees 7.77",
          citations: ["E1"],
          confidence: "high",
          refusal: false,
        }),
        1,
      ).hallucination,
    ).toBe(true);
  });
});

