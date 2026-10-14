import { createFileRoute } from "@tanstack/react-router";
import { QuantumVaultPage } from "@/components/qli-core/quantum-vault";
import { metadata } from "@/lib/qli-core/data";
export const Route = createFileRoute("/quantum-vault")({
  head: () =>
    metadata(
      "Quantum Vault Protocol",
      "Phase 1 Solana program: owner-controlled SPL Token escrow with on-chain withdrawal limits. Unaudited, devnet not deployed.",
    ),
  component: QuantumVaultPage,
});
