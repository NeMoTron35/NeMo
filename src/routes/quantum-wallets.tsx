import { createFileRoute } from "@tanstack/react-router";
import { QuantumWalletsPage } from "@/components/quantek/quantum-wallets";
import { metadata } from "@/lib/quantek/data";
export const Route = createFileRoute("/quantum-wallets")({
  head: () =>
    metadata(
      "Quantum Wallets",
      "One-time WOTS vault chains, spend commitments and signature staging. Readiness model; verifier not deployed.",
    ),
  component: QuantumWalletsPage,
});