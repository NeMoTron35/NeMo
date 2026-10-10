import { createFileRoute } from "@tanstack/react-router";
import { Guide } from "@/components/qli/api-desk";
import { metadata } from "@/lib/quantek/data";
export const Route = createFileRoute("/markets")({
  head: () =>
    metadata(
      "Algorithm Atlas",
      "Explore ML-DSA, SLH-DSA and ML-KEM standards and their security boundaries.",
    ),
  component: Guide,
});
