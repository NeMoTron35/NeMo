import { createFileRoute } from "@tanstack/react-router";
import { VerifyPage } from "@/components/quantek/provenance";
import { metadata } from "@/lib/quantek/data";
export const Route = createFileRoute("/verify")({
  head: () =>
    metadata(
      "Proof Inspector",
      "Verify launch attestations, identity proofs and Quantum Wallet spend proofs locally.",
    ),
  component: VerifyPage,
});
