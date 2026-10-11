import { createFileRoute } from "@tanstack/react-router";
import { SettingsPage } from "@/components/qli-core/operations";
import { metadata } from "@/lib/qli-core/data";
export const Route = createFileRoute("/settings")({
  head: () => metadata("System", "Configure Solana network, RPC and execution policy."),
  component: SettingsPage,
});