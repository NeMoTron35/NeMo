import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowLeft, ArrowRight, Printer, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { pitchSlides } from "@/lib/qli/hackathon-pitch";

const stages = ["Asset", "Curve", "Fees", "Migration", "Quote Market", "First Buy", "Review"];

function List({ items }: { items: string[] }) {
  return (
    <ul className="pitch-list">
      {items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  );
}
function Block({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section className="pitch-block">
      <h3>{label}</h3>
      {children}
    </section>
  );
}
function SlideBody({ id }: { id: string }) {
  switch (id) {
    case "hero":
      return (
        <>
          <p className="pitch-event">Crypto World’s Fair | Meteora DBC track | October 2026</p>
          <div className="pitch-hero-line">
            <span>INTENT</span>
            <ArrowRight />
            <span>EVIDENCE</span>
            <ArrowRight />
            <span>WALLET REVIEW</span>
          </div>
          <p className="pitch-hero-note">Read-only intelligence. Explicit wallet control.</p>
        </>
      );
    case "problem":
      return (
        <>
          <div className="pitch-columns">
            <Block label="The operator’s burden">
              <List
                items={[
                  "Complex launch configurations",
                  "Fee and migration logic",
                  "RPC uncertainty and account state",
                  "Wallet signing and confirmation",
                ]}
              />
            </Block>
            <Block label="The missing layer">
              <p>
                A single, inspectable path connects the intended configuration to the state actually
                confirmed on-chain.
              </p>
              <p className="pitch-emphasis">A tooling / visibility problem.</p>
            </Block>
          </div>
          <p className="pitch-caution">
            No unproven market statistic. No claim that DBC needs replacing.
          </p>
        </>
      );
    case "product":
      return (
        <>
          <div className="pitch-forge">
            <div className="pitch-forge-bar">
              <span>LAUNCH FORGE / CONFIGURATION SCHEMATIC</span>
              <span>UNSIGNED</span>
            </div>
            <ol className="pitch-stages">
              {stages.map((stage, i) => (
                <li key={stage}>
                  <span>{String(i + 1).padStart(2, "0")}</span>
                  <strong>{stage}</strong>
                </li>
              ))}
            </ol>
            <div className="pitch-mode">
              <span>STANDARD</span>
              <span>QUANTUM</span>
              <span>REVIEW BEFORE WALLET APPROVAL</span>
            </div>
          </div>
          <div className="pitch-columns">
            <p>Standard and Quantum launch modes share the deliberate review path.</p>
            <p>
              Quantum attestation is an additional provenance layer, not a replacement for wallet
              approval.
            </p>
          </div>
          <p className="pitch-caution">
            Implementation support is narrower than the draft wizard: some advanced options are
            blocked. Schematic only — not transaction evidence.
          </p>
        </>
      );
    case "meteora":
      return (
        <>
          <div className="pitch-code">
            @meteora-ag/dynamic-bonding-curve-sdk
            <br />
            <strong>createConfigAndPool</strong>
            <span>Wrapped SOL quote · DAMM v2 migration target</span>
          </div>
          <div className="pitch-columns">
            <Block label="Before approval">
              <List
                items={[
                  "Genesis, program and account verification",
                  "Review → simulation → explicit wallet signature",
                ]}
              />
            </Block>
            <Block label="After approval">
              <List items={["One-time submission and confirmation", "Account ownership re-read"]} />
            </Block>
          </div>
          <p className="pitch-caution">
            Physical Phantom not yet tested. Funded public devnet and mainnet transactions NOT
            confirmed.
          </p>
        </>
      );
    case "neural":
      return (
        <>
          <div className="pitch-columns">
            <Block label="Deterministic / existing">
              <p>
                Read-only numerical evidence E1–E7 supports inspectable answers and proof
                provenance.
              </p>
              <p>
                Schema validation and graceful deterministic fallbacks keep unsupported results out.
              </p>
            </Block>
            <Block label="Hosted / configuration-gated">
              <List
                items={[
                  "Server-only HF_TOKEN + model allowlist",
                  "Explicit owner consent and hosted-call caps",
                  "Validated output; no signing or broadcasting",
                ]}
              />
            </Block>
          </div>
          <p className="pitch-caution">
            No HF_TOKEN configured; live hosted inference NOT VERIFIED as of Oct 11 2026. Call caps
            are not currency spend caps — spending caps belong at the provider account.
          </p>
        </>
      );
    case "identity":
      return (
        <>
          <div className="pitch-crypto">
            <span>ML-DSA-65</span>
            <span>SLH-DSA-SHA2-128s</span>
            <span>ML-KEM-768</span>
          </div>
          <div className="pitch-columns">
            <Block label="Local and application-level">
              <List
                items={[
                  "Local signing / verification and key encapsulation",
                  "WOTS / Merkle attestation and proof inspection",
                  "Application-level Quantum Authorization",
                ]}
              />
            </Block>
            <Block label="Not an on-chain PQ upgrade">
              <p>
                Solana wallets still use Ed25519. Application gates do not enforce post-quantum
                protection on-chain.
              </p>
              <p>Quantum Vault on-chain program: unaudited / not deployed.</p>
            </Block>
          </div>
        </>
      );
    case "evidence":
      return (
        <>
          <div className="pitch-columns pitch-evidence">
            <Block label="VERIFIED IN LOCAL TESTS">
              <List
                items={[
                  "Cloned-program local validator: DBC config + pool created and confirmed (~0.033 SOL)",
                  "Negative cases: wallet rejection, altered bytes, stale blockhash",
                  "SDK and public RPC dry-run preflight",
                  "App published",
                ]}
              />
            </Block>
            <Block label="REQUIRES REAL-WORLD VALIDATION">
              <List
                items={[
                  "Physical Phantom",
                  "Funded public devnet / mainnet launch",
                  "Public hosted HF inference",
                  "Deployed PQ vault verifier",
                ]}
              />
            </Block>
          </div>
          <p className="pitch-caution">
            Recorded local evidence, not a fresh rerun or a production deployment claim. No public
            transaction receipt is asserted.
          </p>
        </>
      );
    case "roadmap":
      return (
        <>
          <ol className="pitch-roadmap">
            <li>
              <span>01</span>
              <div>
                <h3>Public devnet evidence</h3>
                <p>Funded demonstration, Phantom browser E2E and video.</p>
              </div>
            </li>
            <li>
              <span>02</span>
              <div>
                <h3>Limited mainnet launch</h3>
                <p>Wallet-approved only, with evidence after security review.</p>
              </div>
            </li>
            <li>
              <span>03</span>
              <div>
                <h3>Validated hosted inference</h3>
                <p>HF credentials, model validation and provider spend controls.</p>
              </div>
            </li>
            <li>
              <span>04</span>
              <div>
                <h3>Publish verifiable provenance</h3>
                <p>Transaction links and inspectable evidence, not invented receipts.</p>
              </div>
            </li>
          </ol>
          <div className="pitch-cta">
            <a href="https://github.com/QuantumQLi/QLi" target="_blank" rel="noopener noreferrer">
              Inspect the public repo <ExternalLink />
            </a>
            <a href="https://x.com/QuantumQLi" target="_blank" rel="noopener noreferrer">
              Follow QuantumQLi on X <ExternalLink />
            </a>
          </div>
        </>
      );
    default:
      return null;
  }
}

function ScaledSlide({ index, current }: { index: number; current: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.5);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry)
        setScale(Math.min(entry.contentRect.width / 1920, entry.contentRect.height / 1080));
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  const slide = pitchSlides[index];
  if (!slide) return null;
  return (
    <div
      ref={ref}
      className={`pitch-slide-container ${current ? "is-current" : ""}`}
      aria-hidden={!current}
      style={{ "--pitch-scale": scale } as React.CSSProperties}
    >
      <article
        className={`pitch-slide pitch-${slide.id}`}
        aria-label={`Slide ${index + 1}: ${slide.kicker}`}
      >
        {slide.id === "hero" && <img className="pitch-art" src="/quantum-qli-hero.webp" alt="" />}
        <div className="pitch-slide-top">
          <span>QUANTUMQLi / METEORA DBC</span>
          <span>TECHNICAL SUBMISSION · OCT 2026</span>
        </div>
        <div className="pitch-slide-content">
          <p className="pitch-kicker">{slide.kicker}</p>
          <h1>{slide.title}</h1>
          <p className="pitch-summary">{slide.summary}</p>
          <SlideBody id={slide.id} />
        </div>
        <footer className="pitch-slide-footer">
          <span>Development-stage technical submission</span>
          <span>{String(index + 1).padStart(2, "0")} / 08</span>
        </footer>
      </article>
    </div>
  );
}

export function HackathonPitch({
  slide,
  onSlide,
}: {
  slide: number;
  onSlide: (slide: number) => void;
}) {
  const startX = useRef<number | null>(null);
  useEffect(() => {
    function key(event: KeyboardEvent) {
      if (
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey ||
        (event.target instanceof HTMLElement &&
          event.target.closest("input,select,textarea,[contenteditable=true]"))
      )
        return;
      if (event.key === "ArrowRight" && slide < 8) {
        event.preventDefault();
        onSlide(slide + 1);
      }
      if (event.key === "ArrowLeft" && slide > 1) {
        event.preventDefault();
        onSlide(slide - 1);
      }
    }
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [slide, onSlide]);
  return (
    <main className="hackathon-pitch">
      <header className="pitch-toolbar">
        <Link to="/" className="pitch-brand">
          <img src="/quantum-qli-mark.svg" alt="" />
          QUANTUMQLi
        </Link>
        <span className="pitch-toolbar-label">Crypto World’s Fair / DBC track</span>
        <Button variant="outline" onClick={() => window.print()}>
          <Printer size={16} />
          Print / Save PDF
        </Button>
      </header>
      <div
        className="pitch-viewer"
        onTouchStart={(event) => {
          startX.current = event.changedTouches[0]?.clientX ?? null;
        }}
        onTouchEnd={(event) => {
          const end = event.changedTouches[0]?.clientX;
          if (startX.current !== null && end !== undefined && Math.abs(end - startX.current) > 70)
            onSlide(Math.min(8, Math.max(1, slide + (end < startX.current ? 1 : -1))));
          startX.current = null;
        }}
      >
        {pitchSlides.map((s, i) => (
          <ScaledSlide key={s.id} index={i} current={i === slide - 1} />
        ))}
      </div>
      <nav className="pitch-navigation" aria-label="Slide navigation">
        <Button
          variant="outline"
          size="icon"
          aria-label="Previous slide"
          disabled={slide === 1}
          onClick={() => onSlide(slide - 1)}
        >
          <ArrowLeft />
        </Button>
        <div className="pitch-dots">
          {pitchSlides.map((s, i) => (
            <Button
              key={s.id}
              variant="ghost"
              size="icon"
              aria-label={`Go to slide ${i + 1}: ${s.kicker}`}
              aria-current={slide === i + 1 ? "step" : undefined}
              onClick={() => onSlide(i + 1)}
            >
              {String(i + 1).padStart(2, "0")}
            </Button>
          ))}
        </div>
        <span className="pitch-count" role="status" aria-live="polite">
          {slide} / 8
        </span>
        <Button
          variant="outline"
          size="icon"
          aria-label="Next slide"
          disabled={slide === 8}
          onClick={() => onSlide(slide + 1)}
        >
          <ArrowRight />
        </Button>
      </nav>
      <footer className="pitch-sources">
        <span>Development-stage technical submission</span>
        <div>
          <a href="https://github.com/QuantumQLi/QLi" target="_blank" rel="noopener noreferrer">
            Public repository
          </a>
          <Link to="/docs">Documentation</Link>
          <Link to="/whitepaper">White paper</Link>
        </div>
      </footer>
    </main>
  );
}
