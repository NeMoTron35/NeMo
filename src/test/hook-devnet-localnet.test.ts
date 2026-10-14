// Opt-in: compiled SBF hook on a local solana-test-validator (see scripts/e2e-transfer-hook-localnet.ts).
import { describe, expect, it } from "vitest";
const on = !!process.env["QLI_HOOK_LOCAL_PID"];
describe.skipIf(!on)("research hook on local validator (SBF)", () => {
  it("create mint → allow → pause deny → allowlist deny → unpause allow", async () => {
    const m = await import("../../scripts/e2e-transfer-hook-localnet");
    expect(m.LOCAL_RESULTS.every((r) => r[1])).toBe(true);
  }, 180_000);
});
