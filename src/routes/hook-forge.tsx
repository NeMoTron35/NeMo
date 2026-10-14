import { createFileRoute, Link } from "@tanstack/react-router";
import { PageHeading } from "@/components/qli-core/controls";
import { HookForge } from "@/components/qli-core/hook-forge";
import { metadata } from "@/lib/qli-core/data";

function HookForgePage() {
  return (
    <div>
      <PageHeading
        eyebrow="QLi HOOK FORGE / V1"
        title="QuantumQLi Hook Forge"
        description="Programmable liquidity policy for Meteora DBC native configuration, plus read-only Token-2022 TransferHook inspection. Nothing here signs or sends a transaction."
        action={
          <span>
            <Link to="/launch" className="desk-link">
              Launch Forge
            </Link>{" "}
            <Link to="/hook-proofs" className="desk-link">
              Hook Proofs
            </Link>{" "}
            <Link to="/meteora-intelligence" className="desk-link">
              DBC Lifecycle Intelligence
            </Link>
          </span>
        }
      />
      <HookForge />
    </div>
  );
}

export const Route = createFileRoute("/hook-forge")({
  head: () =>
    metadata(
      "QuantumQLi Hook Forge",
      "Design Meteora DBC fee schedules, compare SDK-exact fee scenarios and inspect Token-2022 transfer hooks. Read-only.",
    ),
  component: HookForgePage,
});
