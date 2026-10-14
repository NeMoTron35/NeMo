import { createFileRoute } from "@tanstack/react-router";
import { VerifyPage } from "@/components/qli-core/provenance";
import { metadata } from "@/lib/qli-core/data";
export const Route = createFileRoute("/verify")({
  head: () =>
    metadata(
      "Proof Inspector",
      "Verify launch attestations, identity proofs and Quantum Wallet spend proofs locally.",
    ),
  component: VerifyPage,
});
