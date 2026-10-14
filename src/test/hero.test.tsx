import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import type { AnchorHTMLAttributes } from "react";
import { QuantumHero } from "@/components/qli/hero";

vi.mock("@/lib/qli-core/context", () => ({
  useConsole: () => ({ network: "mainnet-beta", rpcHealth: "Unavailable" }),
}));
vi.mock("@tanstack/react-router", () => ({
  Link: ({ to, ...props }: AnchorHTMLAttributes<HTMLAnchorElement> & { to: string }) => (
    <a href={to} {...props} />
  ),
}));

afterEach(cleanup);

describe("homepage artwork", () => {
  it("renders the exact eagerly loaded artwork in server HTML without a load gate", () => {
    const html = renderToString(<QuantumHero />);
    expect(html).toContain('src="/quantum-qli-hero-anime.webp"');
    expect(html).toContain('class="quantum-hero-image"');
    expect(html).toContain('loading="eager"');
    expect(html).toContain('fetchPriority="high"');
    expect(html).not.toMatch(/cosmic-fallback|cosmic-planet|cosmic-band|is-loaded/);
  });

  it("keeps useful links and copy when the image fails, without decorative shapes", () => {
    const { container } = render(<QuantumHero />);
    fireEvent.error(screen.getByRole("img"));
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Artwork could not load");
    expect(screen.getByRole("link", { name: /Open Launch Forge/ })).toHaveAttribute(
      "href",
      "/launch",
    );
    expect(screen.getByRole("link", { name: /Inspect a proof/ })).toHaveAttribute(
      "href",
      "/verify",
    );
    expect(container.querySelector(".cosmic-fallback")).toBeNull();
  });
});
