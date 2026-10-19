import { createFileRoute } from "@tanstack/react-router";
import { LaunchesPage } from "@/components/qli/markets";
import { metadata } from "@/lib/qli-core/data";
export const Route = createFileRoute("/launches")({
  head: () =>
    metadata(
      "Forge Ledger",
      "NEMOTRON3.5 launch history, confirmed-account boundaries and searchable demo pools.",
    ),
  component: LaunchesPage,
});
