import { createFileRoute } from "@tanstack/react-router";
import { LaunchProofPage } from "@/components/qli-core/launch-proofs";
import { metadata } from "@/lib/qli-core/data";
export const Route = createFileRoute("/launch-proofs/$network/$signature")({
  head: () =>
    metadata(
      "Launch Proof",
      "Independent, read-only verification receipt for a Meteora DBC launch on Solana.",
    ),
  component: ProofRoute,
});
function ProofRoute() {
  const { network, signature } = Route.useParams();
  return <LaunchProofPage network={network} signature={signature} />;
}
