import { createFileRoute } from "@tanstack/react-router";
import { ApiDocs } from "@/components/qli/api-desk";
import { metadata } from "@/lib/qli-core/data";
export const Route = createFileRoute("/api-docs")({
  head: () =>
    metadata(
      "API Reference",
      "Quantum QLi public verification and key encapsulation API contracts, limits and examples.",
    ),
  component: ApiDocs,
});