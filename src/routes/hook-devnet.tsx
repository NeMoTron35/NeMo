import { createFileRoute } from "@tanstack/react-router";
import { HookDevnetConsole } from "@/components/qli-core/hook-devnet";
import { metadata } from "@/lib/qli-core/data";

export const Route = createFileRoute("/hook-devnet")({
  head: () =>
    metadata(
      "Hook Devnet Console",
      "Devnet-only console to verify a deployed QuantumQLi transfer hook, create a bound Token-2022 mint, toggle its policy and test transfers with wallet approval.",
    ),
  component: HookDevnetConsole,
});
