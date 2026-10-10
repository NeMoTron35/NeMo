import { createFileRoute } from "@tanstack/react-router";
import { IdentityPage } from "@/components/quantek/provenance";
import { metadata } from "@/lib/quantek/data";
export const Route = createFileRoute("/identity")({
  head: () =>
    metadata(
      "Quantum Identity",
      "Derive, register, anchor and prove a qtk1 hash-based identity with a 256-leaf one-time budget.",
    ),
  component: IdentityPage,
});
