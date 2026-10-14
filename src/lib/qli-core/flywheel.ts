// Quantum Flywheel Engine: hypothetical scenario math and proposal drafts.
// Nothing here contacts the chain. Fee routing splits, buybacks and burns are
// NOT executed by any deployed program; every result carries tier "hypothetical".
import { sha256 } from "@noble/hashes/sha256";
import { bytesToHex } from "@noble/hashes/utils";

export type EvidenceTier = "hypothetical" | "simulated" | "verified";
export const TIER_LABEL: Record<EvidenceTier, string> = {
  hypothetical: "Hypothetical — not on-chain",
  simulated: "Simulated — nothing sent",
  verified: "Verified on-chain",
};

export const SLICE_KEYS = ["creator", "buyback", "burn", "other"] as const;
export type SliceKey = (typeof SLICE_KEYS)[number];
export type Allocation = Record<SliceKey, number>;
export const SLICE_META: Record<SliceKey, { label: string; color: string }> = {
  creator: { label: "Creator wallet", color: "var(--primary)" },
  buyback: { label: "Own-token buyback", color: "var(--accent-foreground)" },
  burn: { label: "Burn", color: "var(--destructive)" },
  other: { label: "Other recipients", color: "var(--muted-foreground)" },
};

export const PRESETS: { id: string; name: string; alloc: Allocation }[] = [
  { id: "creator", name: "Creator-first", alloc: { creator: 100, buyback: 0, burn: 0, other: 0 } },
  { id: "balanced", name: "Balanced", alloc: { creator: 60, buyback: 20, burn: 10, other: 10 } },
  { id: "buyback", name: "Buyback-heavy", alloc: { creator: 30, buyback: 50, burn: 15, other: 5 } },
  {
    id: "deflation",
    name: "Deflationary",
    alloc: { creator: 40, buyback: 10, burn: 50, other: 0 },
  },
];

const clean = (n: number) => (Number.isFinite(n) && n > 0 ? n : 0);
export const sumAlloc = (a: Allocation) => SLICE_KEYS.reduce((s, k) => s + clean(a[k]), 0);
export function allocationError(a: Allocation): string | null {
  if (SLICE_KEYS.some((k) => !Number.isFinite(a[k]) || a[k] < 0 || a[k] > 100))
    return "Each share must be between 0 and 100.";
  return sumAlloc(a) === 100 ? null : `Shares total ${sumAlloc(a)}%; they must total 100%.`;
}

export type ScenarioInput = {
  launches: number;
  volumePerCoinSol: number;
  feeRatePct: number;
  tokenPriceSol: number;
  alloc: Allocation;
};
export function simulateScenario(p: ScenarioInput) {
  const feesPerCoin = clean(p.volumePerCoinSol) * (clean(p.feeRatePct) / 100);
  const daily = feesPerCoin * clean(p.launches);
  const valid = allocationError(p.alloc) === null;
  const flows = Object.fromEntries(
    SLICE_KEYS.map((k) => [k, valid ? (daily * clean(p.alloc[k])) / 100 : 0]),
  ) as Allocation;
  const price = clean(p.tokenPriceSol);
  const tokensBoughtDaily = price ? (flows.buyback + flows.burn) / price : 0;
  return {
    tier: "hypothetical" as const,
    valid,
    feesPerCoin,
    daily,
    monthly: daily * 30,
    flows,
    tokensBoughtDaily,
  };
}

export type ProposalDraft = {
  kind: "buyback" | "burn";
  targetMint: string;
  amountSol: number;
  cadence: "once" | "daily" | "weekly";
  rationale: string;
};
export function proposalError(p: ProposalDraft): string | null {
  if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(p.targetMint))
    return "Target mint is not a valid address.";
  if (!(p.amountSol > 0) || p.amountSol > 1_000_000) return "Amount must be a positive SOL value.";
  if (p.rationale.trim().length < 10) return "Add a rationale of at least 10 characters.";
  return null;
}
/** Canonical proposal document. Authorship evidence only; it executes nothing. */
export function proposalDocument(p: ProposalDraft) {
  const body = {
    v: 1,
    tier: "hypothetical" as EvidenceTier,
    kind: p.kind,
    targetMint: p.targetMint,
    amountSol: p.amountSol,
    cadence: p.cadence,
    rationale: p.rationale.trim(),
    execution: "none — proposal only; no program routes fees, buys back or burns",
  };
  const canonical = JSON.stringify(body);
  return { body, canonical, digest: bytesToHex(sha256(new TextEncoder().encode(canonical))) };
}
