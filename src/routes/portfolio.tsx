import { createFileRoute } from "@tanstack/react-router";
import { Portfolio } from "@/components/qli/vault-pages";
import { metadata } from "@/lib/qli-core/data";
export const Route = createFileRoute("/portfolio")({
  head: () =>
    metadata(
      "Wallet Inventory",
      "Read your Solana wallet SOL, SPL, Token-2022 balances and confirmed transactions.",
    ),
  component: Portfolio,
});