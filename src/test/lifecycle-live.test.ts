// @vitest-environment node
// Opt-in read-only check against real devnet RPC: QLI_LIVE_RPC=1 bunx vitest run src/test/lifecycle-live.test.ts
// The pool is a third-party devnet DBC pool; not a QLi launch. Observed chain, not a fixture.
import { describe, expect, it } from "vitest";
const LIVE = process.env["QLI_LIVE_RPC"] === "1";
const POOL = "GgCerxvd5myhq8ifQqFZqSacnHwemByjdkczUftDm5Qj";
describe.skipIf(!LIVE)("Lifecycle Intelligence against devnet RPC", () => {
  it("reads snapshot, SDK quote and bounded timeline including creation", async () => {
    const srv = await import("@/lib/qli-core/lifecycle.server");
    const s = await srv.intelligence("devnet", POOL);
    expect(s.ok).toBe(true);
    const q = await srv.quote({
      network: "devnet",
      pool: POOL,
      direction: "buy",
      amountIn: "10000000",
      slippageBps: 100,
    });
    expect("ok" in q).toBe(true);
    const t = await srv.timeline("devnet", POOL, 20);
    expect(t).not.toBeNull();
    expect(t!.creationSignature).toBe(
      "3yJULvid3uEFNgKeaCE1MxM1ZtRvdxdJ3mD3Ry5gVtkEJHqaUBoW2sNpyKQRGUQyKnBjDsKgffQhks9RuGDrC2NM",
    );
    const m = await srv.intelligence("mainnet-beta", POOL);
    expect(m.ok).toBe(false);
  }, 60_000);
});