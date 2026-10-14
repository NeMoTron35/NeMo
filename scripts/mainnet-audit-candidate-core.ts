// Pure, read-only pre-build gate for the Mainnet audit-candidate CI build. Fails closed unless the
// Mainnet-tagged declare_id!, Anchor.toml [programs.mainnet] and the release status manifest all
// carry the expected PUBLIC id, and the Devnet id is still its own, distinct value.
import {
  readProgramIds,
  validateOwnerProgramId,
  DEVNET_PLACEHOLDER_ID,
} from "./program-id-sync-core";

export const EXPECTED_MAINNET_PROGRAM_ID = "6P39VXXxxRHoCX7eJCKC5Tkaf4SUxdJDAeJvzykA8q7Z";
export const EXPECTED_DEVNET_PROGRAM_ID = DEVNET_PLACEHOLDER_ID;

export class CandidateError extends Error {}

export function checkAuditCandidateIds(
  libRs: string,
  toml: string,
  statusJson: string,
  expected: string = EXPECTED_MAINNET_PROGRAM_ID,
) {
  const fail = (m: string): never => {
    throw new CandidateError(m);
  };
  validateOwnerProgramId(expected);
  const ids = readProgramIds(libRs, toml); // throws on missing/duplicate/disagreeing entries
  if (ids["mainnet-beta"] !== expected) fail("Mainnet declare_id!/Anchor.toml != expected id.");
  if (ids.devnet !== EXPECTED_DEVNET_PROGRAM_ID) fail("Devnet id was changed or overwritten.");
  if (ids.devnet === ids["mainnet-beta"]) fail("Devnet and Mainnet ids must differ.");
  let s: { builds?: { "mainnet-beta"?: { programId?: string } }; deployment?: string };
  try {
    s = JSON.parse(statusJson);
  } catch {
    return fail("Release status manifest is not valid JSON.");
  }
  if (s.builds?.["mainnet-beta"]?.programId !== expected)
    fail("Release status manifest Mainnet program id != expected id.");
  if (s.deployment !== "prepared-not-deployed") fail("Release status must stay not deployed.");
  return { mainnet: expected, devnet: ids.devnet };
}