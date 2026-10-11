import { createFileRoute } from "@tanstack/react-router";
import { IdentityV2Page } from "@/components/qli-core/identity-v2";
import { metadata } from "@/lib/qli-core/data";
export const Route = createFileRoute("/identity-v2")({
  head: () =>
    metadata(
      "Identity 2.0 / Experimental",
      "Research on verifying hash-based Quantum Identity proofs on Solana: sizes, compute estimates and a tested staging model.",
    ),
  component: IdentityV2Page,
});