import { DOMAINS as FROZEN_DOMAINS, IDENTITY_MEMO_PREFIX } from "@/lib/qli-core/compatibility";
// @vitest-environment node
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { PublicKey } from "@solana/web3.js";
import { createRouter } from "@tanstack/react-router";
import { QueryClient } from "@tanstack/react-query";
import { routeTree } from "@/routeTree.gen";
import { RWA_PRESETS, searchRwa, isValidMint } from "@/lib/qli-core/rwa";
import { DOMAINS, verifyWotsProof, PQ_PARAMETERS, proofBytes } from "@/lib/qli-core/pq";
import {
  createLeafLedger,
  publicDemoKeys,
  signLeaf,
  qtkAddress,
  isQtkAddress,
  buildTree,
  anchorMemo,
} from "@/lib/qli-core/identity";
import {
  QLI_QUANTUM_WALLET_PROGRAM_ID,
  canExecuteLive,
  createQuantumWalletAdapter,
  vaultChain,
  ProtocolNotDeployedError,
} from "@/lib/qli-core/quantum-wallet";
import { DEFAULT_MIGRATION, sdkMethodPlan, tokenBadgeState } from "@/lib/qli-core/dbc";
import { MigrationOption } from "@meteora-ag/dynamic-bonding-curve-sdk";
import { launchSchema } from "@/lib/qli-core/validation";
import { productNavigation, consoleNavigation, GITHUB_URL } from "@/lib/qli-core/data";
import { initialLaunch } from "@/lib/qli-core/launch-draft";

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : [p];
  });
}
const valid = { ...initialLaunch, name: "Arc", symbol: "ARC" };

describe("Quantum QLi v0.2", () => {
  it("uses only Quantum QLi domains and no third-party product strings", () => {
    expect(DOMAINS).toEqual(FROZEN_DOMAINS);
    const banned = [/pqc\.market/i, /\bpq1/, /pump\.fun/i, /pump[- ]sdk/i];
    for (const f of files("src").filter(
      (f) => /\.(tsx?|css)$/.test(f) && !f.includes("/test/") && !f.endsWith("routeTree.gen.ts"),
    )) {
      const s = readFileSync(f, "utf8");
      for (const b of banned) expect(b.test(s), `${f} ${b}`).toBe(false);
    }
  });
  it("ships 61 valid unique tokenized-market presets", () => {
    expect(RWA_PRESETS.length).toBe(61);
    expect(new Set(RWA_PRESETS.map((a) => a.mint)).size).toBe(61);
    for (const a of RWA_PRESETS) {
      expect(new PublicKey(a.mint).toBase58()).toBe(a.mint);
      expect(isValidMint(a.mint)).toBe(true);
    }
    expect(searchRwa("nvda")[0]?.symbol).toBe("NVDAx");
  });
  it("validates tokenized quote selection", () => {
    expect(
      launchSchema.safeParse({ ...valid, quoteKind: "tokenized", tokenizedMint: "" }).success,
    ).toBe(false);
    expect(
      launchSchema.safeParse({ ...valid, quoteKind: "tokenized", tokenizedMint: "not-a-mint" })
        .success,
    ).toBe(false);
    expect(
      launchSchema.safeParse({
        ...valid,
        quoteKind: "tokenized",
        tokenizedMint: RWA_PRESETS[0]!.mint,
      }).success,
    ).toBe(true);
    expect(tokenBadgeState(RWA_PRESETS[0]!.mint)).toBe("may-be-required");
    expect(tokenBadgeState("So11111111111111111111111111111111111111112")).toBe("not-required");
  });
  it("distinguishes standard and Quantum launch plans and defaults to DAMM v2", () => {
    expect(DEFAULT_MIGRATION).toBe(MigrationOption.MET_DAMM_V2);
    const base = {
      symbol: "ARC",
      quoteMint: "x",
      quoteDecimals: null,
      quoteVerified: false,
      firstBuy: "none" as const,
      firstBuyAmount: 0,
      badge: "not-required" as const,
    };
    const s = sdkMethodPlan({ ...base, mode: "standard" });
    const q = sdkMethodPlan({ ...base, mode: "quantum", firstBuy: "creator" });
    expect(s.methods.some((m) => m.includes(DOMAINS.launch))).toBe(false);
    expect(q.methods.some((m) => m.includes(DOMAINS.launch))).toBe(true);
    expect(q.methods.some((m) => m.includes("createPoolWithFirstBuy"))).toBe(true);
    expect(s.migration).toBe("MET_DAMM_V2");
    expect(s.liveBlocked.length).toBeGreaterThan(0);
    expect(launchSchema.safeParse({ ...valid, decimals: 5 }).success).toBe(false);
  });
  it("refuses live Quantum Wallet execution while the program is not deployed", async () => {
    expect(QLI_QUANTUM_WALLET_PROGRAM_ID).toBeNull();
    expect(canExecuteLive()).toBe(false);
    const a = createQuantumWalletAdapter();
    const v = vaultChain("root", 3)[0]!;
    await expect(a.buildDeposit({ vault: v, mint: "m", amount: 1 })).rejects.toBeInstanceOf(
      ProtocolNotDeployedError,
    );
    await expect(
      a.buildWithdraw({ recipient: "r", mint: "m", amount: 1, vaultIndex: 0 }),
    ).rejects.toThrow(/not deployed/);
  });
  it("never reuses a leaf in the local ledger and persists only indexes", () => {
    const store = new Map<string, string>();
    const st = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => {
        store.set(k, v);
      },
    };
    const l = createLeafLedger("abc", st);
    l.reserve(0, "genesis");
    expect(() => l.reserve(0, "again")).toThrow(/never be reused/);
    expect(l.next()).toBe(1);
    const reopened = createLeafLedger("abc", st);
    expect(() => reopened.reserve(0, "x")).toThrow();
    expect([...store.values()].join()).not.toMatch(/sk|seed/i);
  });
  it("produces 2,404-byte qtk1 WOTS proofs that verify and reject tampering", async () => {
    const tree = await buildTree(await publicDemoKeys());
    const p = await signLeaf(tree, 3, DOMAINS.proof, "hello", "public-demo");
    expect(proofBytes(p)).toBe(PQ_PARAMETERS.signatureBytes);
    expect(PQ_PARAMETERS.signatureBytes).toBe(2404);
    expect(verifyWotsProof(p).valid).toBe(true);
    expect(verifyWotsProof({ ...p, message: "hellp" }).valid).toBe(false);
    expect(() => verifyWotsProof({ ...p, domain: "other" as never })).toThrow();
    const addr = qtkAddress(tree.root, tree.keys.publicSeed);
    expect(isQtkAddress(addr)).toBe(true);
    expect(anchorMemo({ address: addr, root: "r" })).toBe(`${IDENTITY_MEMO_PREFIX}${addr}:r`);
  }, 60000);
  it("routes every top-nav and console path", () => {
    const router = createRouter({ routeTree, context: { queryClient: new QueryClient() } });
    expect(productNavigation.map((n) => n[0])).toEqual([
      "Launch Forge",
      "DBC Lifecycle Intelligence",
      "Quantum Identity",
      "Quantum Authorization",
      "Quantum Vault",
      "Identity 2.0 / Experimental",
      "Quantum Wallets",
      "Proof Inspector",
      "Docs",
    ]);
    expect(new URL(GITHUB_URL).hostname).toBe("github.com");
    for (const [, u] of [...productNavigation, ...consoleNavigation])
      expect(router.matchRoutes(u).at(-1)?.routeId).toBe(u);
  });
});
