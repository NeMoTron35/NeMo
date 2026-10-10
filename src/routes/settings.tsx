import { createFileRoute } from "@tanstack/react-router";
import { SettingsPage } from "@/components/quantek/operations";
import { metadata } from "@/lib/quantek/data";
export const Route = createFileRoute("/settings")({
  head: () => metadata("System", "Configure Solana network, RPC and execution policy."),
  component: SettingsPage,
});