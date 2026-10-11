// Evidence links are annotations, never transaction instructions or permissions.
import { verifyRecord, type ProofRecord } from "./proof";
import { STALE_AFTER_S, type Snapshot } from "./engine";

export async function reviewEvidence(
  record: ProofRecord,
  snapshot: Snapshot,
  network: string,
  now: number,
) {
  const v = await verifyRecord(record, snapshot);
  if (
    !v.structure ||
    !v.hashMatches ||
    !v.genesisMatches ||
    v.snapshotReplayed !== "match" ||
    v.verdictReplayed !== "match"
  )
    throw new Error("Evidence mismatch. Analyze again before review.");
  if (snapshot.network !== network || record.chain.network !== network)
    throw new Error("Evidence network changed. Analyze again.");
  if (
    !snapshot.slot ||
    now < snapshot.observedAt ||
    now - snapshot.observedAt > STALE_AFTER_S ||
    now < record.createdAt ||
    now - record.createdAt > 300
  )
    throw new Error("Evidence expired or lacks a confirmed slot. Analyze again.");
  return { proofHash: record.hash, sourceSlot: snapshot.slot, authority: "none" as const };
}