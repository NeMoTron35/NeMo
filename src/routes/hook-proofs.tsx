import { createFileRoute } from "@tanstack/react-router";
import { HookProofsPage } from "@/components/qli-core/hook-proofs";
import { metadata } from "@/lib/qli-core/data";

export const Route = createFileRoute("/hook-proofs")({
  head: () =>
    metadata(
      "Hook Enforcement Proof",
      "Verify a Token-2022 transfer hook, Meteora DBC TransferHookPool and DAMM v2 graduation from devnet RPC evidence. Read-only.",
    ),
  component: HookProofsPage,
});
