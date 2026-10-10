import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { whitepaperSections, whitepaperSearch } from "@/lib/qli/whitepaper";
import { WhitepaperPage } from "@/components/qli/whitepaper";
import { routeTree } from "@/routeTree.gen";
import type { AnchorHTMLAttributes } from "react";
type MockLinkProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> & {
  to: string;
  search?: { section?: string };
  hash?: string;
};
const state = vi.hoisted(() => ({ section: undefined as string | undefined, navigate: vi.fn() }));
vi.mock("@tanstack/react-router", async (original) => ({
  ...(await original<typeof import("@tanstack/react-router")>()),
  useSearch: () => ({ section: state.section }),
  useNavigate: () => state.navigate,
  Link: ({ to, search, hash, children, ...props }: MockLinkProps) => (
    <a
      href={`${to}${search?.section ? `?section=${search.section}` : ""}${hash ? `#${hash}` : ""}`}
      {...props}
    >
      {children}
    </a>
  ),
}));
afterEach(() => {
  cleanup();
  state.section = undefined;
  state.navigate.mockClear();
});
describe("Quantum QLi technical white paper", () => {
  it("matches the public whitepaper route", () => {
    const router = createRouter({ routeTree, context: { queryClient: new QueryClient() } });
    expect(router.matchRoutes("/whitepaper").at(-1)?.routeId).toBe("/whitepaper");
  });
  it("has twenty stable sections and explicit factual boundaries", () => {
    expect(whitepaperSections).toHaveLength(20);
    expect(new Set(whitepaperSections.map((s) => s.id)).size).toBe(20);
    const body = whitepaperSections.map((s) => s.body).join("\n");
    for (const boundary of [
      "signed, not submitted",
      "not globally synchronized",
      "JavaScript cannot guarantee",
      "does **not** commit",
      "scheduling preview",
      "no governance token",
      "DAMM v2 only",
      "ML-KEM-768",
    ])
      expect(body).toContain(boundary);
  });
  it("navigates sequentially and exposes section deep links", () => {
    render(<WhitepaperPage />);
    expect(screen.getByRole("button", { name: "Previous section" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Next section" }));
    expect(state.navigate).toHaveBeenCalledWith({
      to: "/whitepaper",
      search: { section: "1-problem-statement" },
      hash: "1-problem-statement",
    });
    expect(screen.getByRole("link", { name: "1. Problem Statement" })).toHaveAttribute(
      "href",
      "/whitepaper?section=1-problem-statement#1-problem-statement",
    );
  });
  it("supports the mobile section selector", () => {
    render(<WhitepaperPage />);
    fireEvent.change(screen.getByRole("combobox", { name: "Choose white paper section" }), {
      target: { value: "10-security-and-trust-boundaries" },
    });
    expect(state.navigate).toHaveBeenCalledWith({
      to: "/whitepaper",
      search: { section: "10-security-and-trust-boundaries" },
      hash: "10-security-and-trust-boundaries",
    });
  });
  it("prints the full source and links back to docs", () => {
    const print = vi.spyOn(window, "print").mockImplementation(() => {});
    render(<WhitepaperPage />);
    fireEvent.click(screen.getByRole("button", { name: "Print / Save PDF" }));
    expect(print).toHaveBeenCalledOnce();
    expect(document.querySelectorAll(".whitepaper-section")).toHaveLength(20);
    expect(screen.getByRole("link", { name: "Technical Docs · 27" })).toHaveAttribute(
      "href",
      "/docs",
    );
    print.mockRestore();
  });
  it("falls back safely for unknown sections and validates search types", () => {
    state.section = "missing";
    render(<WhitepaperPage />);
    expect(screen.getByRole("status")).toHaveTextContent("Executive Summary is shown instead");
    expect(document.querySelector(".whitepaper-section.is-current")?.id).toBe("executive-summary");
    expect(whitepaperSearch({ section: 42 })).toEqual({});
  });
});