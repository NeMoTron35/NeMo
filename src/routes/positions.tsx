import { createFileRoute } from "@tanstack/react-router";
import { PositionsPage } from "@/components/quantek/markets";
import { metadata } from "@/lib/quantek/data";
export const Route = createFileRoute("/positions")({
  head: () => metadata("Inventory", "Token inventory, cost basis and quote reserve exposure."),
  component: PositionsPage,
});