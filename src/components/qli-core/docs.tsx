import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ArrowLeft, ArrowRight, BookOpen, Download, Link2, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  documentation,
  searchDocumentation,
  articleHeadings,
  headingId,
} from "@/lib/qli/documentation";
import { navigation } from "@/lib/qli-core/data";
export const DOCS = documentation;
function textOf(children: ReactNode): string {
  if (typeof children === "string" || typeof children === "number") return String(children);
  if (Array.isArray(children)) return children.map(textOf).join("");
  if (children && typeof children === "object" && "props" in children)
    return textOf((children.props as { children?: ReactNode }).children);
  return "";
}
export function DocsPage() {
  const search = useSearch({ from: "/docs" });
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [notice, setNotice] = useState("");
  const reader = useRef<HTMLElement>(null);
  const active = documentation.find((a) => a.id === search.article);
  const article = active ?? documentation[0];
  const results = searchDocumentation(q);
  const groups = [...new Set(results.map((a) => a.group))];
  const index = documentation.findIndex((a) => a.id === article?.id);
  function select(id: string, hash = "") {
    setNotice("");
    void navigate({ to: "/docs", search: { article: id }, hash });
  }
  useEffect(() => {
    reader.current?.scrollTo({ top: 0 });
    setNotice("");
  }, [search.article]);
  useEffect(() => {
    if (!window.location.hash) return;
    const hash = decodeURIComponent(window.location.hash.slice(1));
    requestAnimationFrame(() => {
      document.getElementById(hash)?.scrollIntoView({ block: "start" });
    });
  }, [search.article]);
  if (!article) return <p role="alert">Documentation is unavailable.</p>;
  function download() {
    const url = URL.createObjectURL(new Blob([article?.body ?? ""], { type: "text/markdown" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `quantum-qli-${article?.id}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }
  async function copyLink() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setNotice("Article link copied.");
    } catch {
      setNotice("Could not copy the link. Use the address bar to share this article.");
    }
  }
  const headings = articleHeadings(article.body);
  return (
    <section className="qli-help" aria-label="NEMOTRON3.5 Help">
      <header className="help-header">
        <BookOpen size={25} />
        <div>
          <h1>NEMOTRON3.5 Help</h1>
          <p>Product guide · current implementation</p>
        </div>
        <Button asChild variant="outline">
          <Link to="/whitepaper">White Paper</Link>
        </Button>
      </header>
      <div className="help-toolbar">
        <Button
          variant="outline"
          size="icon"
          aria-label="Previous article"
          title="Previous article"
          disabled={index <= 0}
          onClick={() => {
            const previous = documentation[index - 1];
            if (previous) select(previous.id);
          }}
        >
          <ArrowLeft />
        </Button>
        <Button
          variant="outline"
          size="icon"
          aria-label="Next article"
          title="Next article"
          disabled={index >= documentation.length - 1}
          onClick={() => {
            const next = documentation[index + 1];
            if (next) select(next.id);
          }}
        >
          <ArrowRight />
        </Button>
        <div className="help-search">
          <Search size={16} />
          <input
            aria-label="Search documentation"
            placeholder="Search NEMOTRON3.5 Help…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          {q && (
            <Button
              variant="ghost"
              size="icon"
              aria-label="Clear documentation search"
              onClick={() => setQ("")}
            >
              <X size={14} />
            </Button>
          )}
        </div>
        <Button
          variant="outline"
          size="icon"
          aria-label="Copy article link"
          title="Copy article link"
          onClick={copyLink}
        >
          <Link2 />
        </Button>
        <Button
          variant="outline"
          size="icon"
          aria-label="Download article Markdown"
          title="Download article Markdown"
          onClick={download}
        >
          <Download />
        </Button>
      </div>
      <div className="help-mobile-index">
        <label htmlFor="help-article">Contents</label>
        <select
          id="help-article"
          aria-label="Choose documentation article"
          value={article.id}
          onChange={(e) => select(e.target.value)}
        >
          {documentation.map((a) => (
            <option key={a.id} value={a.id}>
              {a.title}
            </option>
          ))}
        </select>
      </div>
      <div className="help-layout">
        <nav className="help-contents" aria-label="Documentation contents">
          {groups.map((group) => (
            <section key={group}>
              <h2>{group}</h2>
              {results
                .filter((a) => a.group === group)
                .map((a) => (
                  <Link
                    key={a.id}
                    to="/docs"
                    search={{ article: a.id }}
                    aria-current={article.id === a.id ? "page" : undefined}
                  >
                    {a.title}
                  </Link>
                ))}
            </section>
          ))}
          {!results.length && <p role="status">No matching topics.</p>}
        </nav>
        <article ref={reader} className="help-reader" aria-label={article.title}>
          {notice && (
            <p className="help-message" role="status">
              {notice}
            </p>
          )}
          {search.article && !active && (
            <p className="help-message" role="status">
              That topic was not found. Welcome is shown instead.
            </p>
          )}
          {q && (
            <section className="help-results" aria-label="Documentation search results">
              <h2>
                {results.length} {results.length === 1 ? "matching topic" : "matching topics"}
              </h2>
              {results.map((a) => (
                <div key={a.id}>
                  <Link to="/docs" search={{ article: a.id }} onClick={() => setQ("")}>
                    {a.title}
                    <ArrowRight size={13} />
                  </Link>
                  <p>{a.summary}</p>
                </div>
              ))}
              {!results.length && <p role="status">No topics match “{q}”.</p>}
            </section>
          )}
          <p className="help-breadcrumb">NEMOTRON3.5 Help / {article.group}</p>
          {headings.length > 0 && (
            <details className="help-on-this-page">
              <summary>On this page</summary>
              <nav aria-label="Article sections">
                {headings.map((h) => (
                  <Link key={h.id} to="/docs" search={{ article: article.id }} hash={h.id}>
                    {h.title}
                  </Link>
                ))}
              </nav>
            </details>
          )}
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              h2: ({ children }) => <h2 id={headingId(textOf(children))}>{children}</h2>,
              a: ({ href, children }) => {
                if (href?.startsWith("/docs?")) {
                  const url = new URL(href, "https://documentation.invalid");
                  return (
                    <Link
                      to="/docs"
                      search={{ article: url.searchParams.get("article") ?? "welcome" }}
                      hash={url.hash.slice(1)}
                    >
                      {children}
                    </Link>
                  );
                }
                const route = navigation.find(([, path]) => path === href);
                return route ? (
                  <Link to={route[1]}>{children}</Link>
                ) : (
                  <a
                    href={href}
                    rel={href?.startsWith("https:") ? "noopener noreferrer" : undefined}
                  >
                    {children}
                  </a>
                );
              },
              table: ({ children }) => (
                <div className="help-table">
                  <table>{children}</table>
                </div>
              ),
            }}
          >
            {article.body}
          </ReactMarkdown>
          <footer className="help-article-footer">
            <span>{article.source}</span>
            <span>Current code · demo boundaries stated explicitly</span>
          </footer>
        </article>
      </div>
      <div className="help-status">
        <span>
          {q ? `${results.length} matching topics` : `${documentation.length} topics`} ·{" "}
          {article.group}
        </span>
        <span>
          {index + 1} / {documentation.length}
        </span>
      </div>
    </section>
  );
}
