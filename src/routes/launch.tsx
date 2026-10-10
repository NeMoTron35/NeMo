import { createFileRoute } from "@tanstack/react-router";
import { LaunchPage } from "@/components/quantek/launch";
import { metadata } from "@/lib/quantek/data";
export const Route = createFileRoute("/launch")({
  head: () =>
    metadata(
      "Launch Forge",
      "Standard and Quantum Launch on Meteora DBC with DAMM v2 migration and tokenized market quotes.",
    ),
  component: LaunchPage,
});