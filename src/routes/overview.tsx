import { createFileRoute } from "@tanstack/react-router";
import { Overview } from "@/components/qli-core/overview";
import { metadata } from "@/lib/qli-core/data";
export const Route = createFileRoute("/overview")({
  head: () =>
    metadata(
      "NEMOTRON3.5 Desk",
      "Noncustodial liquidity operations, agent guardrails and simulated DBC pool telemetry.",
    ),
  component: Overview,
});
