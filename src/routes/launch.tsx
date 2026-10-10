import { createFileRoute } from "@tanstack/react-router";
import { LaunchPage } from "@/components/qli-core/launch";
import { metadata } from "@/lib/qli-core/data";
export const Route = createFileRoute("/launch")({
  head: () =>
    metadata(
      "Launch Forge",
      "Standard and Quantum Launch on Meteora DBC with DAMM v2 migration and tokenized market quotes.",
    ),
  component: LaunchPage,
});
