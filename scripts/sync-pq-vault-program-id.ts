// Owner program-id sync (PUBLIC KEY ONLY). Updates exactly one network's tagged declare_id! and the
// matching Anchor.toml [programs.<net>] entry. Reads no keypair, writes no secret, never builds,
// signs or deploys. Rebuild afterwards: scripts/build-pq-vault-sbf.sh <devnet|mainnet-beta>.
//
//   bun scripts/sync-pq-vault-program-id.ts --network mainnet-beta --program-id <OWNER_PUBKEY> [--check]
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { SyncError, syncProgramId, type SyncNetwork } from "./program-id-sync-core";

const REPO = resolve(import.meta.dirname, "..");
const LIB = `${REPO}/programs/quantum_pq_first_buy_vault/src/lib.rs`;
const TOML = `${REPO}/programs/Anchor.toml`;

function arg(name: string) {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
}
try {
  const network = arg("network");
  if (network !== "devnet" && network !== "mainnet-beta")
    throw new SyncError("--network must be devnet or mainnet-beta.");
  const r = syncProgramId(
    readFileSync(LIB, "utf8"),
    readFileSync(TOML, "utf8"),
    network as SyncNetwork,
    arg("program-id") ?? "",
  );
  if (process.argv.includes("--check")) {
    console.log(
      r.changed ? "Would update lib.rs and Anchor.toml (check only)." : "Already in sync.",
    );
  } else if (r.changed) {
    writeFileSync(LIB, r.libRs);
    writeFileSync(TOML, r.toml);
    console.log(
      `Updated ${network} program id. Rebuild that network's SBF artifact before any deploy.`,
    );
  } else console.log("Already in sync; nothing written.");
} catch (e) {
  console.error(`REFUSED: ${e instanceof SyncError ? e.message : "unexpected error"}`);
  process.exit(1);
}