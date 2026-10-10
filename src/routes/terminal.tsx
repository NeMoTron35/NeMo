import { createFileRoute } from "@tanstack/react-router";
import { MarketPage } from "@/components/qli/markets";
import { metadata } from "@/lib/quantek/data";
export const Route = createFileRoute("/terminal")({
  head: () =>
    metadata("Trade Console", "Inspect markets and review noncustodial buy and sell order plans."),
  component: () => <MarketPage terminal />,
});