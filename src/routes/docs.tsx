import { createFileRoute } from "@tanstack/react-router";
import { DocsPage } from "@/components/quantek/docs";
import { metadata } from "@/lib/quantek/data";
import { documentationSearch } from "@/lib/qli/documentation";
export const Route = createFileRoute("/docs")({
  validateSearch: documentationSearch,
  head: () =>
    metadata(
      "Quantum QLi Help",
      "First-party Quantum QLi documentation: product workflows, wallet review, Meteora DBC, reference proofs, APIs and contributor guides.",
    ),
  component: DocsPage,
});
