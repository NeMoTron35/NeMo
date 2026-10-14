import { createFileRoute } from "@tanstack/react-router";
import { LaunchProofLookup } from "@/components/qli-core/launch-proofs";
import { metadata } from "@/lib/qli-core/data";
export const Route = createFileRoute("/launch-proofs/")({
  head: () =>
    metadata(
      "Launch Proofs",
      "Read-only verification of Meteora DBC launches from real Solana RPC evidence, with tamper-evident receipts.",
    ),
  component: LaunchProofLookup,
});
