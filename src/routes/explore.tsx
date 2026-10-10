import { createFileRoute } from "@tanstack/react-router";
import { MarketPage } from "@/components/qli/markets";
import { metadata } from "@/lib/quantek/data";
export const Route = createFileRoute("/explore")({
  head: () =>
    metadata(
      "Market Explorer",
      "Search and compare Solana markets with explicit live-provider and demo data states.",
    ),
  component: MarketPage,
});