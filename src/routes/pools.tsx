import { createFileRoute } from "@tanstack/react-router";
import { PoolsPage } from "@/components/qli-core/markets";
import { metadata } from "@/lib/qli-core/data";
export const Route = createFileRoute("/pools")({
  head: () =>
    metadata(
      "Liquidity Chambers",
      "Inspect pool reserves, liquidity, trading fees and migration thresholds.",
    ),
  component: PoolsPage,
});