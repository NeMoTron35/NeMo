import { createFileRoute } from "@tanstack/react-router";
import { AgentPage } from "@/components/qli-core/agent";
import { metadata } from "@/lib/qli-core/data";
export const Route = createFileRoute("/agent")({
  head: () =>
    metadata("QLi Operator", "Deterministic liquidity strategy configuration and guardrails."),
  component: AgentPage,
});
