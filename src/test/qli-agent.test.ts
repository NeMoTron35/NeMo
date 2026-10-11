// @vitest-environment node
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { Keypair } from "@solana/web3.js";
import { GENESIS, WSOL_MINT } from "@/lib/qli-core/dbc-launch";
import {
  AGENT_RUNTIME_LABEL,
  agentProfileSchema,
  defaultProfile,
  evaluateRules,
  parseAiSummary,
  profileContextIssue,
  runtimeStatus,
  shouldPoll,
  toObservation,
  validateHandoff,
  type Observation,
} from "@/lib/qli-core/qli-agent";
import type { FlywheelPool } from "@/lib/qli-core/flywheel-live";

const wallet = Keypair.generate().publicKey.toBase58();
const other = Keypair.generate().publicKey.toBase58();
const poolAddr = Keypair.generate().publicKey.toBase58();
const mint = Keypair.generate().publicKey.toBase58();
const NOW = 1_800_000_000;

function obs(over: Partial<Observation> = {}): Observation {
  return {
    pool: poolAddr,
    network: "devnet",
    wallet,
    creator: wallet,
    mint,
    quoteMint: WSOL_MINT,
    quoteIsSol: true,
    baseDecimals: 6,
    isMigrated: false,
    claimableQuote: "200000000",
    claimableBase: "0",
    quoteReserve: "90",
    migrationThreshold: "100",
    progressPct: 90,
    walletSol: "5000000000",
    walletToken: "0",
    supply: "1000",
    observedAt: NOW,
    source: "test",
    ...over,
  };
}
const profile = { ...defaultProfile(wallet, "devnet"), pools: [poolAddr] };

describe("QLi Agent rules", () => {
  it("fires deterministic claim/buyback proposals and migration alert", () => {
    const r = evaluateRules(obs(), profile, NOW);
    expect(r.proposals.map((p) => p.step)).toEqual(["claim", "buyback"]);
    expect(r.proposals[1]!.amount).toBe("0.1"); // 50% of 0.2 SOL
    expect(r.alerts.some((a) => a.title.includes("migration"))).toBe(true);
    expect(evaluateRules(obs(), profile, NOW)).toEqual(r);
  });
  it("respects thresholds and caps", () => {
    expect(
      evaluateRules(obs({ claimableQuote: "1000" }), profile, NOW).proposals.find(
        (p) => p.step === "claim",
      ),
    ).toBeUndefined();
    const big = evaluateRules(obs({ claimableQuote: "100000000000" }), profile, NOW);
    expect(big.proposals.find((p) => p.step === "buyback")!.amount).toBe("0.5");
    const poor = evaluateRules(obs({ walletSol: "10000000" }), profile, NOW);
    expect(poor.proposals.find((p) => p.step === "buyback")).toBeUndefined();
  });
  it("produces no proposals on stale reads or mismatched wallet/network/creator", () => {
    expect(evaluateRules(obs({ observedAt: NOW - 999 }), profile, NOW).proposals).toEqual([]);
    expect(evaluateRules(obs({ creator: other }), profile, NOW).proposals).toEqual([]);
    expect(evaluateRules(obs({ network: "mainnet-beta" }), profile, NOW).proposals).toEqual([]);
  });
  it("marks unknown progress and blocks buyback on migrated/non-SOL pools", () => {
    const u = evaluateRules(obs({ progressPct: null }), profile, NOW);
    expect(u.alerts.some((a) => a.title.includes("unknown"))).toBe(true);
    expect(
      evaluateRules(obs({ isMigrated: true }), profile, NOW).proposals.some(
        (p) => p.step === "buyback",
      ),
    ).toBe(false);
    expect(
      evaluateRules(obs({ quoteIsSol: false }), profile, NOW).proposals.some(
        (p) => p.step === "buyback",
      ),
    ).toBe(false);
  });
  it("refuses non-creator pools when mapping reads", () => {
    const fp = { pool: poolAddr, creator: other } as unknown as FlywheelPool;
    expect(() =>
      toObservation(fp, { solLamports: 0n, tokenBalance: 0n, supply: 0n }, "devnet", wallet, NOW),
    ).toThrow(/creator/);
  });
});

describe("QLi Agent profile and runtime", () => {
  it("validates bounds", () => {
    expect(agentProfileSchema.safeParse(profile).success).toBe(true);
    expect(agentProfileSchema.safeParse({ ...profile, cadenceSeconds: 1 }).success).toBe(false);
    expect(agentProfileSchema.safeParse({ ...profile, maxProposalSol: 50 }).success).toBe(false);
    expect(agentProfileSchema.safeParse({ ...profile, pools: ["nope"] }).success).toBe(false);
  });
  it("pauses on wallet change, disconnect and network change", () => {
    expect(profileContextIssue(profile, { wallet, network: "devnet" })).toBeNull();
    expect(profileContextIssue(profile, { wallet: null, network: "devnet" })).toMatch(
      /disconnected/,
    );
    expect(profileContextIssue(profile, { wallet: other, network: "devnet" })).toMatch(/differs/);
    expect(profileContextIssue(profile, { wallet, network: "mainnet-beta" })).toMatch(/Network/);
  });
  it("never claims background 24/7 operation", () => {
    expect(shouldPoll({ active: true, visible: false, contextIssue: null, lastError: null })).toBe(
      false,
    );
    expect(shouldPoll({ active: true, visible: true, contextIssue: null, lastError: "x" })).toBe(
      false,
    );
    expect(runtimeStatus({ active: true, visible: true, paused: null })).toMatch(/this tab only/);
    expect(AGENT_RUNTIME_LABEL).toMatch(/pauses when browser closes/);
    expect(runtimeStatus({ active: true, visible: true, paused: null })).not.toMatch(
      /24\/7|always/i,
    );
  });
});

describe("Flywheel handoff validation", () => {
  const p = {
    ...evaluateRules(obs(), profile, NOW).proposals[1]!,
    id: "x1",
    createdAt: NOW,
    status: "open" as const,
  };
  const ctx = { wallet, network: "devnet" as const, now: NOW + 10 };
  it("accepts a fresh matching proposal", () => {
    expect(validateHandoff(p, ctx).ok).toBe(true);
    expect(p.genesis).toBe(GENESIS.devnet);
  });
  it("rejects wrong wallet, network, stale, denied, malformed and injected bytes", () => {
    expect(validateHandoff(p, { ...ctx, wallet: other }).ok).toBe(false);
    expect(validateHandoff(p, { ...ctx, wallet: null }).ok).toBe(false);
    expect(validateHandoff(p, { ...ctx, network: "mainnet-beta" }).ok).toBe(false);
    expect(validateHandoff(p, { ...ctx, now: NOW + 9999 }).ok).toBe(false);
    expect(validateHandoff({ ...p, status: "denied" }, ctx).ok).toBe(false);
    expect(validateHandoff({ ...p, amount: "1e9" }, ctx).ok).toBe(false);
    expect(validateHandoff({ ...p, amount: "9" }, ctx).ok).toBe(false);
    expect(validateHandoff({ ...p, signedTransaction: "AAAA" }, ctx).ok).toBe(false);
    expect(validateHandoff("?pool=x", ctx).ok).toBe(false);
  });
});

describe("AI fallback and no-signing boundary", () => {
  it("rejects invalid AI output", () => {
    expect(parseAiSummary("not json")).toBeNull();
    expect(parseAiSummary({ summary: "ok", risks: [], sign: true })).toBeNull();
    expect(parseAiSummary({ summary: "ok", risks: ["r"] })).toEqual({
      summary: "ok",
      risks: ["r"],
    });
  });
  it("agent modules never sign or broadcast", () => {
    for (const f of ["src/lib/qli-core/qli-agent.ts", "src/components/qli-core/qli-agent.tsx"]) {
      const src = readFileSync(f, "utf8");
      expect(src).not.toMatch(
        /signReviewedTransaction|sendReviewedOnce|sendRawTransaction|signTransaction|buildFlywheelStep/,
      );
    }
  });
});