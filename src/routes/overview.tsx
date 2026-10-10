import { createFileRoute } from "@tanstack/react-router";
import { Overview } from "@/components/quantek/overview";
import { metadata } from "@/lib/quantek/data";
export const Route = createFileRoute("/overview")({
  head: () =>
    metadata(
      "QLi Desk",
      "Noncustodial liquidity operations, agent guardrails and simulated DBC pool telemetry.",
    ),
  component: Overview,
});