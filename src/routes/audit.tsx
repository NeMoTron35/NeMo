import { createFileRoute } from "@tanstack/react-router";
import { ActivityPage } from "@/components/quantek/operations";
import { metadata } from "@/lib/quantek/data";
export const Route = createFileRoute("/audit")({
  head: () =>
    metadata(
      "Event Log",
      "Filter and export the local simulation audit trail for liquidity operations.",
    ),
  component: ActivityPage,
});
