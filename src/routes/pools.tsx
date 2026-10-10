import { createFileRoute } from "@tanstack/react-router";
import { PoolsPage } from "@/components/quantek/markets";
import { metadata } from "@/lib/quantek/data";
export const Route = createFileRoute("/pools")({
  head: () =>
    metadata(
      "Liquidity Chambers",
      "Inspect pool reserves, liquidity, trading fees and migration thresholds.",
    ),
  component: PoolsPage,
});