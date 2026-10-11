import { createFileRoute } from "@tanstack/react-router";
import { VaultKeys } from "@/components/qli/vault-pages";
import { metadata } from "@/lib/qli-core/data";
export const Route = createFileRoute("/vaults")({
  head: () =>
    metadata(
      "My Vaults & Key",
      "Generate or restore a local ML-DSA-65 key, inspect its fingerprint and manage an offline backup.",
    ),
  component: VaultKeys,
});