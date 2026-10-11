import { createFileRoute } from "@tanstack/react-router";
import { ActivityPage } from "@/components/qli-core/operations";
import { metadata } from "@/lib/qli-core/data";
export const Route = createFileRoute("/audit")({
  head: () =>
    metadata(
      "Event Log",
      "Filter and export the local simulation audit trail for liquidity operations.",
    ),
  component: ActivityPage,
});