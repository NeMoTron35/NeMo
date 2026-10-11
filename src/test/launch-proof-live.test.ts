// @vitest-environment node
// Opt-in read-only check against real devnet RPC: QLI_LIVE_RPC=1 bunx vitest run src/test/launch-proof-live.test.ts
// The signature is a third-party devnet DBC pool creation observed on 2026-10-11; not a QLi launch.
import { describe, expect, it } from "vitest";
const LIVE = process.env["QLI_LIVE_RPC"] === "1";
const SIG =
  "3yJULvid3uEFNgKeaCE1MxM1ZtRvdxdJ3mD3Ry5gVtkEJHqaUBoW2sNpyKQRGUQyKnBjDsKgffQhks9RuGDrC2NM";
describe.skipIf(!LIVE)("Launch Proof Engine against devnet RPC", () => {
  it("verifies a real DBC pool creation and rejects it on the wrong network", async () => {
    const { lookupLaunchProof } = await import("@/lib/qli-core/launch-proof.server");
    const r = await lookupLaunchProof("devnet", SIG);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.receipt.facts.pool).toBe("GgCerxvd5myhq8ifQqFZqSacnHwemByjdkczUftDm5Qj");
    const m = await lookupLaunchProof("mainnet-beta", SIG);
    expect(m.ok).toBe(false);
  }, 60_000);
});