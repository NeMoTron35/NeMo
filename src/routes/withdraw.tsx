import { createFileRoute } from "@tanstack/react-router";
import { VaultTransfer } from "@/components/qli/vault-pages";
import { metadata } from "@/lib/quantek/data";
export const Route = createFileRoute("/withdraw")({
  head: () =>
    metadata(
      "Withdraw",
      "Prepare and verify local ML-DSA withdrawal authorization. On-chain execution remains unavailable.",
    ),
  component: () => <VaultTransfer withdraw />,
});
