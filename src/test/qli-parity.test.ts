// @vitest-environment node
import { describe, it, expect } from "vitest";
import { webcrypto } from "node:crypto";
import { cryptoApi } from "@/lib/qli/api";
import {
  runLocal,
  ml_dsa65,
  ml_kem768,
  b64,
  fromB64,
  verifySignature,
  fingerprint,
} from "@/lib/qli/crypto";
import { filterMarkets, demoMarkets, validateOrder, getMarkets } from "@/lib/qli/market";
import { publicNavigation } from "@/lib/qli-core/data";
import { initialLaunch } from "@/lib/qli-core/launch-draft";
import { launchSchema } from "@/lib/qli-core/validation";
Object.defineProperty(globalThis, "crypto", { value: webcrypto, configurable: true });
const post = (body: unknown) =>
  new Request("https://example.test/api/public/v1/signatures/verify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
describe("Quantum QLi public parity", () => {
  it("records only observed health checks without claiming continuous uptime", async () => {
    const r = await cryptoApi(new Request("https://example.test"), "health");
    expect(r.status).toBe(200);
    const h = await cryptoApi(new Request("https://example.test"), "health/history");
    const data = await h.json();
    expect(data.checks.length).toBeGreaterThan(0);
    expect(data.checks.at(-1).ok).toBe(true);
    expect(data.status).toMatch(/volatile worker memory/);
    expect(data.uptime).toBeUndefined();
  });
  it("exposes all ten reference navigation surfaces", () =>
    expect(publicNavigation.map((n) => n[1])).toEqual([
      "/markets",
      "/",
      "/api-docs",
      "/launch",
      "/launches",
      "/vault",
      "/explore",
      "/terminal",
      "/trending",
      "/portfolio",
    ]));
  it("runs real signature roundtrips and rejects changed messages", async () => {
    for (const a of ["ML-DSA-65", "SLH-DSA-SHA2-128s"] as const) {
      expect((await runLocal(a, "qli")).valid).toBe(true);
      expect((await runLocal(a, "qli", true)).valid).toBe(false);
    }
  }, 60000);
  it("runs ML-KEM and detects tampered ciphertext", async () => {
    expect((await runLocal("ML-KEM-768", "")).valid).toBe(true);
    expect((await runLocal("ML-KEM-768", "", true)).valid).toBe(false);
  });
  it("verifies only public material with a request identifier", async () => {
    const keys = ml_dsa65.keygen();
    try {
      const m = new TextEncoder().encode("qli");
      const signature = ml_dsa65.sign(m, keys.secretKey);
      const res = await cryptoApi(
        post({
          algorithm: "ML-DSA-65",
          message: b64(m),
          signature: b64(signature),
          publicKey: b64(keys.publicKey),
        }),
        "signatures/verify",
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.valid).toBe(true);
      expect(body.requestId).toBe(res.headers.get("x-request-id"));
      expect(JSON.stringify(body)).not.toMatch(/secretKey|privateKey/);
      expect(
        verifySignature("ML-DSA-65", new TextEncoder().encode("wrong"), signature, keys.publicKey),
      ).toBe(false);
    } finally {
      keys.secretKey.fill(0);
    }
  });
  it("rejects unknown algorithms, malformed bodies, sizes and noncanonical base64", async () => {
    expect(
      (await cryptoApi(post({ algorithm: "unknown", publicKey: "aGVsbG8=" }), "kem/encapsulate"))
        .status,
    ).toBe(400);
    expect(
      (
        await cryptoApi(
          post({ algorithm: "ML-KEM-768", publicKey: b64(new Uint8Array(10)) }),
          "kem/encapsulate",
        )
      ).status,
    ).toBe(400);
    const big = new Request("https://example.test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "x".repeat(65537),
    });
    expect((await cryptoApi(big, "signatures/verify")).status).toBe(400);
    expect(() => fromB64("!!!!")).toThrow();
    expect(() => fromB64("aGVsbG8")).toThrow();
  });
  it("encapsulates without returning shared secrets or secret keys", async () => {
    const k = ml_kem768.keygen();
    try {
      const res = await cryptoApi(
        post({ algorithm: "ML-KEM-768", publicKey: b64(k.publicKey) }),
        "kem/encapsulate",
      );
      const body = await res.json();
      expect(res.status).toBe(200);
      expect(body.sharedSecret).toBeUndefined();
      const secret = ml_kem768.decapsulate(fromB64(body.cipherText), k.secretKey);
      expect(fingerprint(secret)).toBe(body.sharedSecretFingerprint);
      secret.fill(0);
    } finally {
      k.secretKey.fill(0);
    }
  });
  it("does not expose unavailable custodial operations", async () => {
    expect((await cryptoApi(post({}), "keys")).status).toBe(501);
    expect((await cryptoApi(new Request("https://example.test"), "usage")).status).toBe(501);
    expect((await cryptoApi(new Request("https://example.test"), "unknown")).status).toBe(404);
  });
  it("filters and sorts demo markets without pretending live service exists", async () => {
    expect(filterMarkets(demoMarkets, "nex", "volume")[0]?.symbol).toBe("NXS");
    expect(filterMarkets(demoMarkets, "", "gainers")[0]?.symbol).toBe("VEC");
    expect(filterMarkets(demoMarkets, "", "losers")[0]?.symbol).toBe("NXS");
    await expect(getMarkets("live")).rejects.toThrow(/not connected/);
    expect(() => validateOrder(-1, 1, 0)).toThrow();
    expect(() => validateOrder(1, 10, 0)).toThrow();
    expect(() => validateOrder(1, 1, 1)).toThrow();
  });
  it("validates reference launch settings", () => {
    const d = { ...initialLaunch, name: "Test", symbol: "QLI" };
    expect(launchSchema.safeParse(d).success).toBe(true);
    expect(launchSchema.safeParse({ ...d, telegram: "javascript:alert(1)" }).success).toBe(false);
    expect(launchSchema.safeParse({ ...d, vanitySuffix: "0OO" }).success).toBe(false);
    expect(launchSchema.safeParse({ ...d, prioritySol: 1 }).success).toBe(false);
  });
});