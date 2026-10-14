import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { LifecycleIntelligencePage } from "@/components/qli-core/lifecycle";
import { metadata } from "@/lib/qli-core/data";

const search = z.object({
  network: z.enum(["mainnet-beta", "devnet"]).optional().catch(undefined),
  pool: z.string().max(44).optional().catch(undefined),
});
export const Route = createFileRoute("/meteora-intelligence")({
  validateSearch: search,
  head: () =>
    metadata(
      "Meteora Lifecycle Intelligence",
      "Read-only graduation, curve quote, fee and lifecycle evidence for any Meteora DBC pool from verified Solana RPC.",
    ),
  component: IntelRoute,
});
function IntelRoute() {
  const s = Route.useSearch();
  return <LifecycleIntelligencePage network={s.network ?? "devnet"} pool={s.pool ?? ""} />;
}
