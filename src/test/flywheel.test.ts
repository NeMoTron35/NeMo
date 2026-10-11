import { describe, expect, it } from "vitest";
import {
  PRESETS,
  allocationError,
  proposalDocument,
  proposalError,
  simulateScenario,
  sumAlloc,
} from "@/lib/qli-core/flywheel";

const base = { launches: 2, volumePerCoinSol: 100, feeRatePct: 1, tokenPriceSol: 0.5 };
describe("flywheel scenario", () => {
  it("presets total 100", () => PRESETS.forEach((p) => expect(sumAlloc(p.alloc)).toBe(100)));
  it("rejects shares not totalling 100 and zeroes flows", () => {
    const alloc = { creator: 50, buyback: 10, burn: 0, other: 0 };
    expect(allocationError(alloc)).toMatch(/total 60/);
    expect(simulateScenario({ ...base, alloc }).flows.creator).toBe(0);
  });
  it("computes flows and is always hypothetical", () => {
    const r = simulateScenario({ ...base, alloc: PRESETS[1]!.alloc });
    expect(r.tier).toBe("hypothetical");
    expect(r.daily).toBe(2);
    expect(r.flows.creator).toBeCloseTo(1.2);
    expect(r.tokensBoughtDaily).toBeCloseTo(1.2);
  });
  it("handles NaN and negative inputs safely", () => {
    const r = simulateScenario({
      launches: NaN,
      volumePerCoinSol: -5,
      feeRatePct: 1,
      tokenPriceSol: 0,
      alloc: PRESETS[0]!.alloc,
    });
    expect(r.daily).toBe(0);
    expect(r.tokensBoughtDaily).toBe(0);
  });
});
describe("flywheel proposals", () => {
  const ok = {
    kind: "burn" as const,
    targetMint: "2LmeQRz6m4dDigmysPQLAstnNBvVoQ9i7m3n5bQLi",
    amountSol: 1,
    cadence: "once" as const,
    rationale: "Reduce supply after launch",
  };
  it("validates and produces a stable digest with no execution", () => {
    expect(proposalError(ok)).toBeNull();
    expect(proposalError({ ...ok, targetMint: "bad" })).toBeTruthy();
    const a = proposalDocument(ok);
    expect(a.digest).toBe(proposalDocument(ok).digest);
    expect(a.body.tier).toBe("hypothetical");
    expect(a.body.execution).toMatch(/^none/);
  });
});