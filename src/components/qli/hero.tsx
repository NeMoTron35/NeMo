import { Link } from "@tanstack/react-router";
import { ArrowUpRight, ScanLine, ShieldCheck, Orbit } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useConsole } from "@/lib/qli-core/context";
export function QuantumHero() {
  const c = useConsole();
  return (
    <section className="quantum-hero" aria-label="Quantum QLi command desk">
      <div className="quantum-hero-shade" />
      <div className="hero-session">
        <span>
          <Orbit size={14} />
          SOLANA / {c.network === "devnet" ? "DEVNET" : "MAINNET"}
        </span>
        <span>RPC · {c.rpcHealth}</span>
        <span>
          <ShieldCheck size={14} />
          {c.account ? "WALLET CONNECTED" : "NON-CUSTODIAL"}
        </span>
      </div>
      <div className="quantum-hero-copy">
        <p className="hero-kicker">SOLANA LIQUIDITY COMMAND DESK</p>
        <h1>Quantum QLi</h1>
        <h2>
          Quantum liquidity,
          <br />
          under control.
        </h2>
        <p className="hero-description">
          A clear view of every reserve. A deliberate plan for every move.
        </p>
        <div className="quantum-hero-actions">
          <Button asChild>
            <Link to="/launch">
              Open Launch Forge
              <ArrowUpRight size={16} />
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link to="/verify">
              <ScanLine size={16} />
              Inspect a proof
            </Link>
          </Button>
        </div>
      </div>
      <div className="hero-status">
        <span>EXECUTION · REVIEW BEFORE SIGNING</span>
        <span>
          {c.identity
            ? `LEAF BUDGET · ${256 - (c.ledger?.used.length ?? 0)} / 256`
            : "IDENTITY · NOT OPEN"}
        </span>
        <span>LIVE CUSTODY · UNAVAILABLE</span>
      </div>
    </section>
  );
}
