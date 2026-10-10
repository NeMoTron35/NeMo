import { describe, it, expect, vi, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { reportRuntimeError } from "@/lib/error-reporting";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";
import { createBrowserAuthClient } from "@/lib/auth/client";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});
describe("First-party repository runtime boundaries", () => {
  it("reports only allowlisted diagnostics, never thrown secret fields or URLs", () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    reportRuntimeError({ message: "private fixture", token: "sensitive fixture" });
    expect(log).toHaveBeenCalledWith("[Quantum QLi] Page rendering failed", { category: "render" });
    reportRuntimeError(new Response(null, { status: 503 }));
    expect(log).toHaveBeenLastCalledWith("[Quantum QLi] Page rendering failed", {
      category: "response",
      status: 503,
    });
  });
  it("fails closed when cron authorization is not configured", async () => {
    vi.stubEnv("QLI_CRON_SECRET", "");
    expect((await authenticateCronRequest(new Request("https://example.invalid")))?.status).toBe(
      500,
    );
  });
  it("accepts current and previous cron secrets while rejecting invalid tokens", async () => {
    vi.stubEnv("QLI_CRON_SECRET", "current-test-fixture");
    vi.stubEnv("QLI_CRON_SECRET_PREVIOUS", "previous-test-fixture");
    for (const token of ["current-test-fixture", "previous-test-fixture"])
      expect(
        await authenticateCronRequest(
          new Request("https://example.invalid", { headers: { authorization: `Bearer ${token}` } }),
        ),
      ).toBeNull();
    expect(
      (
        await authenticateCronRequest(
          new Request("https://example.invalid", { headers: { authorization: "Bearer wrong" } }),
        )
      )?.status,
    ).toBe(401);
  });
  it("rejects missing browser configuration and private browser keys", () => {
    vi.stubEnv("VITE_SUPABASE_URL", "");
    vi.stubEnv("VITE_SUPABASE_PUBLISHABLE_KEY", "");
    expect(() => createBrowserAuthClient()).toThrow(/Configure browser/);
    vi.stubEnv("VITE_SUPABASE_URL", "https://example.invalid");
    vi.stubEnv("VITE_SUPABASE_PUBLISHABLE_KEY", "sb_secret_test");
    expect(() => createBrowserAuthClient()).toThrow(/private key/);
  });
  it("keeps empty environment examples and direct first-party build plugins", () => {
    for (const line of readFileSync(".env.example", "utf8").trim().split("\n"))
      expect(line).toMatch(/^[A-Z][A-Z0-9_]*=$/);
    const config = readFileSync("vite.config.ts", "utf8");
    expect(config).toContain("@tanstack/react-start/plugin/vite");
    expect(config).toContain('entry: "server"');
    expect(config).toContain("cloudflare-module");
    expect(config).toContain("rpc-websockets");
    const middleware = readFileSync("src/start.ts", "utf8");
    expect(middleware).toContain("attachSessionAuth");
    expect(middleware).toContain("csrfMiddleware");
    expect(readFileSync("src/lib/auth/client.ts", "utf8")).not.toContain("postMessage");
  });
});