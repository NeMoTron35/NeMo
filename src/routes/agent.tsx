import { createFileRoute } from "@tanstack/react-router";
import { AgentPage } from "@/components/quantek/agent";
import { metadata } from "@/lib/quantek/data";
export const Route = createFileRoute("/agent")({
  head: () =>
    metadata("QLi Operator", "Deterministic liquidity strategy configuration and guardrails."),
  component: AgentPage,
});
