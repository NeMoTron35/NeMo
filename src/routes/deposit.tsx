import { createFileRoute } from "@tanstack/react-router";
import { VaultTransfer } from "@/components/qli/vault-pages";
import { metadata } from "@/lib/qli-core/data";
export const Route = createFileRoute("/deposit")({
  head: () =>
    metadata(
      "Deposit",
      "Review deposit readiness without moving funds into an undeployed vault program.",
    ),
  component: VaultTransfer,
});