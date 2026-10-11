import { Link, useSearch, useNavigate } from "@tanstack/react-router";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ArrowLeft, ArrowRight, BookOpen, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { whitepaperSections, WHITEPAPER_VERSION } from "@/lib/qli/whitepaper";

export function WhitepaperPage() {
  const navigate = useNavigate();
  const search = useSearch({ from: "/whitepaper" });
  const found = whitepaperSections.findIndex((s) => s.id === search.section);
  const index = found < 0 ? 0 : found;
  const active = whitepaperSections[index];
  if (!active) return <p role="alert">White paper unavailable.</p>;
  const previous = whitepaperSections[index - 1];
  const next = whitepaperSections[index + 1];
  return (
    <section className="qli-whitepaper qli-help" aria-label="Quantum QLi Technical White Paper">
      <header className="help-header">
        <BookOpen size={25} />
        <div>
          <h1>Quantum QLi Technical White Paper</h1>
          <p>{WHITEPAPER_VERSION}</p>
        </div>
      </header>
      <div className="help-toolbar whitepaper-toolbar">
        <Button
          variant="outline"
          size="icon"
          disabled={!previous}
          aria-label="Previous section"
          onClick={() => {
            if (previous)
              void navigate({
                to: "/whitepaper",
                search: { section: previous.id },
                hash: previous.id,
              });
          }}
        >
          <ArrowLeft />
        </Button>
        <Button
          variant="outline"
          size="icon"
          disabled={!next}
          aria-label="Next section"
          onClick={() => {
            if (next)
              void navigate({ to: "/whitepaper", search: { section: next.id }, hash: next.id });
          }}
        >
          <ArrowRight />
        </Button>
        <Button className="whitepaper-print" onClick={() => window.print()}>
          <Printer size={16} />
          Print / Save PDF
        </Button>
        <Button asChild variant="outline">
          <Link to="/docs">
            <BookOpen size={16} />
            Technical Docs · 27
          </Link>
        </Button>
      </div>
      <div className="help-mobile-index">
        <label htmlFor="whitepaper-section">Section</label>
        <WhitepaperSelect value={active.id} />
      </div>
      <div className="help-layout">
        <nav className="help-contents" aria-label="White paper contents">
          <h2>Contents</h2>
          {whitepaperSections.map((s) => (
            <Link
              key={s.id}
              to="/whitepaper"
              search={{ section: s.id }}
              hash={s.id}
              aria-current={active.id === s.id ? "page" : undefined}
            >
              {s.title}
            </Link>
          ))}
        </nav>
        <article className="help-reader whitepaper-reader" aria-label="White paper reading surface">
          <div className="whitepaper-cover">
            <p className="help-breadcrumb">Quantum QLi / Technical White Paper</p>
            <h1>Quantum QLi — Technical White Paper</h1>
            <p>Quantum liquidity, under control.</p>
            <small>{WHITEPAPER_VERSION}</small>
          </div>
          {search.section && found < 0 && (
            <p role="status" className="help-message">
              That section was not found. Executive Summary is shown instead.
            </p>
          )}
          {whitepaperSections.map((s) => (
            <section
              key={s.id}
              id={s.id}
              className={`whitepaper-section ${s.id === active.id ? "is-current" : ""}`}
              aria-hidden={s.id !== active.id}
            >
              <h2>{s.title}</h2>
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  a: ({ href, children }) => {
                    if (href?.startsWith("/docs")) {
                      const url = new URL(href, "https://documentation.invalid");
                      const article = url.searchParams.get("article");
                      return (
                        <Link to="/docs" search={article ? { article } : {}}>
                          {children}
                        </Link>
                      );
                    }
                    return <a href={href}>{children}</a>;
                  },
                  table: ({ children }) => (
                    <div className="help-table">
                      <table>{children}</table>
                    </div>
                  ),
                }}
              >
                {s.body}
              </ReactMarkdown>
            </section>
          ))}
          <footer className="help-article-footer">
            Implementation description · not a security certification or investment offering
          </footer>
        </article>
      </div>
      <div className="help-status">
        <span>{active.title}</span>
        <span>
          {index + 1} / {whitepaperSections.length}
        </span>
      </div>
    </section>
  );
}
function WhitepaperSelect({ value }: { value: string }) {
  const navigate = useNavigate();
  return (
    <select
      id="whitepaper-section"
      aria-label="Choose white paper section"
      value={value}
      onChange={(e) => {
        void navigate({
          to: "/whitepaper",
          search: { section: e.target.value },
          hash: e.target.value,
        });
      }}
    >
      {whitepaperSections.map((s) => (
        <option key={s.id} value={s.id}>
          {s.title}
        </option>
      ))}
    </select>
  );
}