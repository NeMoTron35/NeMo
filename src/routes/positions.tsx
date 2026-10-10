import { createFileRoute } from "@tanstack/react-router";
import { PositionsPage } from "@/components/qli-core/markets";
import { metadata } from "@/lib/qli-core/data";
export const Route = createFileRoute("/positions")({
  head: () => metadata("Inventory", "Token inventory, cost basis and quote reserve exposure."),
  component: PositionsPage,
});
