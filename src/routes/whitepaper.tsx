import { createFileRoute } from "@tanstack/react-router";
import { WhitepaperPage } from "@/components/qli/whitepaper";
import { whitepaperSearch } from "@/lib/qli/whitepaper";
import { metadata } from "@/lib/quantek/data";
export const Route = createFileRoute("/whitepaper")({
  validateSearch: whitepaperSearch,
  head: () =>
    metadata(
      "Technical White Paper",
      "Quantum QLi v0.1 — October 2026: non-custodial Solana liquidity planning, Meteora DBC, reference WOTS identities, cryptography and explicit trust boundaries.",
    ),
  component: WhitepaperPage,
});
