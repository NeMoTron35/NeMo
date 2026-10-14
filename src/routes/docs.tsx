import { createFileRoute } from "@tanstack/react-router";
import { DocsPage } from "@/components/qli-core/docs";
import { metadata } from "@/lib/qli-core/data";
import { documentationSearch } from "@/lib/qli/documentation";
export const Route = createFileRoute("/docs")({
  validateSearch: documentationSearch,
  head: () =>
    metadata(
      "Help",
      "First-party Quantum QLi documentation: product workflows, wallet review, Meteora DBC, reference proofs, APIs and contributor guides.",
    ),
  component: DocsPage,
});
