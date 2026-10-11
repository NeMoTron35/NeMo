import { createFileRoute } from "@tanstack/react-router";
import { PageHeading } from "@/components/qli-core/controls";
import { NetworkTestCenter } from "@/components/qli-core/network-test";
import { metadata } from "@/lib/qli-core/data";

function NetworkLabPage() {
  return (
    <div>
      <PageHeading
        eyebrow="QLi DUAL NETWORK TEST CENTRE"
        title="Dual Network Test Centre"
        description="Devnet and Mainnet readiness: wallet diagnostics, RPC genesis, balance preflight and reviewed programs. Read-only; signing happens only in existing reviewed flows."
      />
      <NetworkTestCenter />
    </div>
  );
}

export const Route = createFileRoute("/network-lab")({
  head: () =>
    metadata(
      "Dual Network Test Centre",
      "Read-only Solana Devnet and Mainnet readiness checks for Phantom, RPC genesis, rent preflight and reviewed Meteora DBC programs.",
    ),
  component: NetworkLabPage,
});