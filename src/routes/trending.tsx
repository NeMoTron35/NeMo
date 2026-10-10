import { createFileRoute } from "@tanstack/react-router";
import { MarketPage } from "@/components/qli/markets";
import { metadata } from "@/lib/quantek/data";
export const Route = createFileRoute("/trending")({
  head: () =>
    metadata(
      "Market Pulse",
      "Rank Solana markets by activity, volume, market cap and price change.",
    ),
  component: () => <MarketPage trending />,
});
