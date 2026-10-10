import { createFileRoute } from "@tanstack/react-router";
import { SecurityPage } from "@/components/qli/vault-pages";
import { metadata } from "@/lib/quantek/data";
export const Route = createFileRoute("/security")({
  head: () =>
    metadata(
      "Quantum Security",
      "Post-quantum security report, wallet limitations, verifier requirements and audit blockers.",
    ),
  component: SecurityPage,
});