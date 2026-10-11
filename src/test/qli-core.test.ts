import { describe, it, expect } from "vitest";
import { webcrypto } from "node:crypto";
import { makeDemoProof, verifyDemoProof } from "@/lib/qli-core/pq";
import { strategySchema, rpcSchema } from "@/lib/qli-core/validation";
import { navigation } from "@/lib/qli-core/data";
import { createRouter } from "@tanstack/react-router";
import { QueryClient } from "@tanstack/react-query";
import { routeTree } from "@/routeTree.gen";
Object.defineProperty(globalThis, "crypto", { value: webcrypto, configurable: true });
describe("Quantum QLi security and navigation", () => {
  it("matches every console route", () => {
    const router = createRouter({ routeTree, context: { queryClient: new QueryClient() } });
    for (const [, url] of navigation) expect(router.matchRoutes(url).at(-1)?.routeId).toBe(url);
  });
  it("accepts a demo WOTS proof and rejects tampering", async () => {
    const proof = await makeDemoProof();
    expect((await verifyDemoProof(proof)).valid).toBe(true);
    expect((await verifyDemoProof({ ...proof, message: proof.message + "tampered" })).valid).toBe(
      false,
    );
  }, 30000);
  it("rejects unsafe RPC protocols", () => {
    expect(rpcSchema.safeParse("javascript:alert(1)").success).toBe(false);
    expect(rpcSchema.safeParse("https://api.devnet.solana.com").success).toBe(true);
  });
  it("rejects inverted inventory bands", () => {
    expect(
      strategySchema.safeParse({
        lower: 70,
        upper: 30,
        threshold: 5,
        slippage: 50,
        trade: 2,
        reserve: 0.1,
        cooldown: 120,
        actions: 12,
        harvest: 0.1,
      }).success,
    ).toBe(false);
  });
});