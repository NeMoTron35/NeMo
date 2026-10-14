import { createFileRoute } from "@tanstack/react-router";
import { FlywheelPage } from "@/components/qli-core/flywheel";
import { metadata } from "@/lib/qli-core/data";
export const Route = createFileRoute("/flywheel")({
  head: () =>
    metadata(
      "Quantum Flywheel Engine",
      "Hypothetical creator revenue, buyback and burn allocation scenarios with a fee wheel and proposal digests.",
    ),
  component: FlywheelPage,
});
