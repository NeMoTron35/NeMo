import { createFileRoute } from "@tanstack/react-router";
import { AuthorizationPage } from "@/components/qli-core/authorization";
import { metadata } from "@/lib/qli-core/data";
export const Route = createFileRoute("/authorization")({
  head: () =>
    metadata(
      "Quantum Authorization",
      "Opt-in application-level WOTS/Merkle authorization intents bound to exact Flywheel transactions. Not on-chain enforced.",
    ),
  component: AuthorizationPage,
});
