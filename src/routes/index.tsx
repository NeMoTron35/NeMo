import { createFileRoute } from "@tanstack/react-router";
import { ApiDesk } from "@/components/qli/api-desk";
import { metadata } from "@/lib/quantek/data";
export const Route = createFileRoute("/")({
  head: () =>
    metadata(
      "QLi Desk",
      "Quantum QLi post-quantum crypto API, local NIST-standard playground and noncustodial Solana workspace.",
    ),
  component: ApiDesk,
});
