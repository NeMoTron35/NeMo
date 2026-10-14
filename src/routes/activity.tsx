import { createFileRoute } from "@tanstack/react-router";
import { WalletData, VaultNav } from "@/components/qli/vault-pages";
import { PageHeading } from "@/components/qli-core/controls";
import { metadata } from "@/lib/qli-core/data";
export const Route = createFileRoute("/activity")({
  head: () =>
    metadata(
      "Wallet Events",
      "Confirmed Devnet wallet signatures and read-only transaction history.",
    ),
  component: () => (
    <>
      <VaultNav />
      <PageHeading
        eyebrow="QLI> ACTIVITY --DEVNET"
        title="Wallet Events"
        description="Confirmed Devnet signatures. Simulated operations are recorded separately in Event Log."
      />
      <WalletData devnet activityOnly />
    </>
  ),
});
