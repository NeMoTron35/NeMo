import { createFileRoute } from "@tanstack/react-router";
import { VaultOverview } from "@/components/qli/vault-pages";
import { metadata } from "@/lib/quantek/data";
export const Route = createFileRoute("/vault")({
  head: () =>
    metadata(
      "Vault Desk",
      "Devnet vault readiness, local post-quantum key status and read-only wallet balances. Program not deployed.",
    ),
  component: VaultOverview,
});