// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { ed25519 } from "@noble/curves/ed25519";
import { PublicKey } from "@solana/web3.js";
import {
  V2_LEGEND,
  backoffSeconds,
  buildChallengeMessage,
  dedupKey,
  resolveServerRpc,
  verifyWalletSignature,
  workerHealth,
} from "@/lib/qli-core/agent-v2-core";
import { lamportsOf } from "@/lib/qli-core/qli-agent";

vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: {} }));

const sk = ed25519.utils.randomPrivateKey();
const wallet = new PublicKey(ed25519.getPublicKey(sk)).toBase58();
const b64 = (u: Uint8Array) => btoa(String.fromCharCode(...u));
const msg = buildChallengeMessage({
  domain: "quantumqli.app",
  wallet,
  network: "devnet",
  nonce: "a".repeat(32),
  issuedAt: "2026-10-11T00:00:00Z",
  expiresAt: "2026-10-11T00:05:00Z",
});
const sig = ed25519.sign(new TextEncoder().encode(msg), sk);

describe("wallet sign-in", () => {
  it("binds domain, wallet, network, genesis, nonce and expiry", () => {
    expect(msg).toMatch(/^quantumqli\.app wants you/);
    expect(msg).toContain(wallet);
    expect(msg).toContain("Chain ID: solana:devnet");
    expect(msg).toContain("Genesis: EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG");
    expect(msg).toContain("authorizes no transaction");
  });
  it("verifies genuine signatures and rejects forgeries", () => {
    expect(verifyWalletSignature(msg, b64(sig), wallet)).toBe(true);
    expect(verifyWalletSignature(msg + "x", b64(sig), wallet)).toBe(false);
    const other = new PublicKey(ed25519.getPublicKey(ed25519.utils.randomPrivateKey())).toBase58();
    expect(verifyWalletSignature(msg, b64(sig), other)).toBe(false);
    expect(verifyWalletSignature(msg, "AAAA", wallet)).toBe(false);
    expect(verifyWalletSignature(msg.replace("devnet", "mainnet-beta"), b64(sig), wallet)).toBe(
      false,
    );
  });
  it("server consumes nonces atomically (used_at IS NULL) so replays fail", () => {
    const src = readFileSync("src/lib/qli-core/agent-v2.server.ts", "utf8");
    expect(src).toMatch(/\.is\("used_at", null\)/);
    expect(src).toMatch(/\.gt\("expires_at"/);
    expect(src).toMatch(/MAX_CHALLENGES_PER_10M/);
  });
});

describe("owner isolation", () => {
  it("every owner query is scoped by the verified session wallet", () => {
    const src = readFileSync("src/lib/qli-core/agent-v2.server.ts", "utf8");
    for (const fn of [
      "getState",
      "saveProfile",
      "deleteProfile",
      "registerPool",
      "removePool",
      "setProposalStatus",
    ]) {
      const body = src.slice(src.indexOf(`export async function ${fn}`)).split("\nexport ")[0]!;
      expect(body).toMatch(/requireSession\(token\)/);
    }
    expect(src).toMatch(/loadFlywheelPool\(rpc\.url, pool, s\.wallet\)/);
  });
  it("migration denies anon/authenticated and enables RLS on all tables", () => {
    const sql = readFileSync("drizzle/migrations/0000_qli_agent_v2.sql", "utf8");
    expect(sql).toMatch(/REVOKE ALL ON public\.%I FROM anon, authenticated/);
    expect(sql).toMatch(/ENABLE ROW LEVEL SECURITY/);
    expect(sql).not.toMatch(/CREATE POLICY/);
  });
});

describe("worker", () => {
  it("dedups alerts per cooldown window", () => {
    expect(dedupKey("r", 1000, 3600)).toBe(dedupKey("r", 3500, 3600));
    expect(dedupKey("r", 1000, 3600)).not.toBe(dedupKey("r", 4000, 3600));
  });
  it("backs off with bounded jitter", () => {
    expect(backoffSeconds(0, 0)).toBe(300);
    expect(backoffSeconds(10, 1)).toBeLessThanOrEqual(3600 * 1.2);
    expect(backoffSeconds(2, 0)).toBeGreaterThan(backoffSeconds(1, 0));
  });
  it("retries transient errors, never creator mismatch", async () => {
    const { withRetry, errorCategory } = await import("@/lib/qli-core/agent-worker.server");
    let n = 0;
    const r = await withRetry(
      async () => {
        if (++n < 3) throw new Error("fetch failed");
        return "ok";
      },
      3,
      async () => {},
    );
    expect(r).toBe("ok");
    let m = 0;
    await expect(
      withRetry(
        async () => {
          m++;
          throw new Error("not this pool's creator");
        },
        3,
        async () => {},
      ),
    ).rejects.toThrow();
    expect(m).toBe(1);
    expect(errorCategory(new Error("https://secret.rpc/key 429"))).toBe("rpc-rate-limited");
  });
  it("uses a lease lock and never signs or sends", () => {
    const src = readFileSync("src/lib/qli-core/agent-worker.server.ts", "utf8");
    expect(src).toMatch(/qli_try_lease/);
    expect(src).not.toMatch(
      /sendRawTransaction|sendReviewedOnce|signTransaction|buildFlywheelStep|Keypair/,
    );
  });
  it("server RPC ignores non-allowlisted hosts (no SSRF)", () => {
    expect(resolveServerRpc("devnet", "http://169.254.169.254/").url).toBe(
      "https://api.devnet.solana.com",
    );
    expect(resolveServerRpc("devnet", "https://evil.example.com").url).toBe(
      "https://api.devnet.solana.com",
    );
    expect(
      resolveServerRpc("mainnet-beta", "https://x.helius-rpc.com/?k=1").provider,
    ).not.toContain("k=1");
  });
});

describe("health truthfulness", () => {
  it("never claims always-on without scheduler and a recent success", () => {
    expect(workerHealth({ schedulerActive: false, lastOkAt: 100, now: 100 }).state).toBe(
      "inactive",
    );
    expect(workerHealth({ schedulerActive: true, lastOkAt: null, now: 100 }).state).toBe("stale");
    expect(workerHealth({ schedulerActive: true, lastOkAt: 0, now: 5000 }).state).toBe("stale");
    expect(workerHealth({ schedulerActive: true, lastOkAt: 4900, now: 5000 }).state).toBe(
      "verified",
    );
    expect(V2_LEGEND).toMatch(/never moves funds/);
  });
  it("lamports conversion is integer-safe", () => {
    expect(lamportsOf(0.1)).toBe(100_000_000n);
    expect(lamportsOf(0.3)).toBe(300_000_000n);
    expect(lamportsOf(1e-9)).toBe(1n);
    expect(lamportsOf(-1)).toBe(0n);
  });
});
