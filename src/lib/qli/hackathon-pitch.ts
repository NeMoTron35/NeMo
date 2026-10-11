export const pitchSlides = [
  {
    id: "hero",
    title: "Quantum liquidity, under control.",
    kicker: "QUANTUMQLi",
    summary: "Verifiable intelligence and wallet-controlled execution for Meteora DBC.",
  },
  {
    id: "problem",
    title: "A launch is more than a transaction.",
    kicker: "THE PROBLEM",
    summary:
      "DBC executes. Operators need a single inspectable path from intent to confirmed state.",
  },
  {
    id: "product",
    title: "One forge. Seven deliberate stages.",
    kicker: "THE PRODUCT",
    summary:
      "Launch Forge brings configuration, protocol choices and wallet review into one inspectable workflow.",
  },
  {
    id: "meteora",
    title: "Built around Meteora DBC.",
    kicker: "METEORA DBC INTEGRATION",
    summary:
      "Real SDK transaction construction — with explicit boundaries between building, signing and confirmed state.",
  },
  {
    id: "neural",
    title: "Intelligence without execution authority.",
    kicker: "NEURAL ENGINE × HUGGING FACE",
    summary:
      "Deterministic, read-only analysis grounds every answer in evidence E1–E7. Hosted inference is optional.",
  },
  {
    id: "identity",
    title: "Inspect the proof. Know its boundary.",
    kicker: "QUANTUM IDENTITY",
    summary:
      "Local cryptographic workbenches, reference attestations and application-level authorization — not a Solana security upgrade.",
  },
  {
    id: "evidence",
    title: "Evidence, not implied readiness.",
    kicker: "EVIDENCE MATRIX",
    summary:
      "Local execution evidence is distinct from funded public-chain validation and production readiness.",
  },
  {
    id: "roadmap",
    title: "Meteora executes. QLi makes it inspectable.",
    kicker: "WHY METEORA / ROADMAP",
    summary:
      "DBC provides the launch primitive. QuantumQLi adds review, visibility and provenance around the operator’s decisions.",
  },
] as const;

export function pitchIndex(value: unknown): number {
  const n = Number(value);
  return Number.isInteger(n) && n >= 1 && n <= pitchSlides.length ? n : 1;
}