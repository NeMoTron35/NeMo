// Read-only CLI used by .github/workflows/qli-pq-mainnet-audit-candidate.yml before building.
//   bun scripts/mainnet-audit-candidate-check.ts
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { checkAuditCandidateIds } from "./mainnet-audit-candidate-core";

const R = resolve(import.meta.dirname, "..");
try {
  const r = checkAuditCandidateIds(
    readFileSync(`${R}/programs/quantum_pq_first_buy_vault/src/lib.rs`, "utf8"),
    readFileSync(`${R}/programs/Anchor.toml`, "utf8"),
    readFileSync(`${R}/docs/release/mainnet-release-status.json`, "utf8"),
  );
  console.log(`IDs OK: mainnet-beta=${r.mainnet} devnet=${r.devnet}`);
} catch (e) {
  console.error(`REFUSED: ${e instanceof Error ? e.message : "unexpected error"}`);
  process.exit(1);
}