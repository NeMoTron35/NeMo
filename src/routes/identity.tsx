import { createFileRoute } from "@tanstack/react-router";
import { IdentityPage } from "@/components/qli-core/provenance";
import { metadata } from "@/lib/qli-core/data";
export const Route = createFileRoute("/identity")({
  head: () =>
    metadata(
      "Quantum Identity",
      "Derive, register, anchor and prove a qtk1 hash-based identity with a 256-leaf one-time budget.",
    ),
  component: IdentityPage,
});
