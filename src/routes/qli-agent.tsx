import { createFileRoute } from "@tanstack/react-router";
import { QliAgentPage } from "@/components/qli-core/qli-agent";
import { metadata } from "@/lib/qli-core/data";
export const Route = createFileRoute("/qli-agent")({
  head: () =>
    metadata(
      "QLi Agent",
      "Session-only read-only observer for your Meteora DBC pools with rule-based alerts and wallet-approved Flywheel proposals.",
    ),
  component: QliAgentPage,
});
