import { createFileRoute } from "@tanstack/react-router";
import { PageHeading } from "@/components/qli-core/controls";
import { NeuralWorkspace } from "@/components/qli-core/neural-workspace";
import { metadata } from "@/lib/qli-core/data";

function NeuralEnginePage() {
  return (
    <div>
      <PageHeading
        eyebrow="QLi Agent v3"
        title="Neural Engine"
        description="Read-only analysis, tamper-evident proof records, counterfactual stress grids, relationship signals and reproducible model benchmarks. Nothing here signs or moves funds."
      />
      <NeuralWorkspace />
    </div>
  );
}

export const Route = createFileRoute("/neural-engine")({
  head: () =>
    metadata(
      "Neural Engine",
      "QLi Agent v3: read-only pool analysis, Proof Engine records, Shadow stress grids, Threat Graph and Model Arena.",
    ),
  component: NeuralEnginePage,
});
