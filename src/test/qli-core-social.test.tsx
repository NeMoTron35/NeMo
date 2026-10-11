import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import type { AnchorHTMLAttributes } from "react";

import { ConsoleProvider } from "@/lib/qli-core/console-provider";
import { WalletDialogContext } from "@/components/qli/wallet-dialog-context";
import { Shell } from "@/components/qli-core/shell";
import { GITHUB_URL, X_URL, TOKEN_CA } from "@/lib/qli-core/data";

type MockLinkProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> & {
  to: string;
  activeProps?: unknown;
  activeOptions?: unknown;
};

vi.mock("@tanstack/react-router", async (original) => ({
  ...(await original<typeof import("@tanstack/react-router")>()),
  useRouterState: () => "/",
  Link: ({
    to,
    children,
    activeProps: _activeProps,
    activeOptions: _activeOptions,
    ...props
  }: MockLinkProps) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}));

afterEach(cleanup);

function renderDesk() {
  return render(
    <ConsoleProvider>
      <WalletDialogContext.Provider value={() => {}}>
        <Shell>Quantum QLi workspace</Shell>
      </WalletDialogContext.Provider>
    </ConsoleProvider>,
  );
}

describe("Quantum QLi top-bar profiles", () => {
  it("exposes GitHub and X logo links in the global menu bar", () => {
    const { container } = renderDesk();
    const bar = container.querySelector<HTMLElement>(".desktop-menu-bar");
    expect(bar).not.toBeNull();

    const github = screen.getByRole("link", { name: "GitHub" });
    const x = screen.getByRole("link", { name: "X" });
    expect(bar?.contains(github)).toBe(true);
    expect(bar?.contains(x)).toBe(true);
    expect(github.getAttribute("href")).toBe(GITHUB_URL);
    expect(x.getAttribute("href")).toBe(X_URL);
    expect(github.getAttribute("target")).toBe("_blank");
    expect(x.getAttribute("target")).toBe("_blank");
    expect(github.getAttribute("rel")).toContain("noopener");
    expect(x.getAttribute("rel")).toContain("noopener");
  });

  it("offers a one-click copy of the token contract address beside the profiles", async () => {
    const { container } = renderDesk();
    const bar = container.querySelector<HTMLElement>(".desktop-menu-bar");
    expect(bar).not.toBeNull();

    const copy = screen.getByRole("button", { name: "Copy contract address" });
    expect(bar?.contains(copy)).toBe(true);
    Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });
    copy.click();
    await screen.findByRole("button", { name: "Copy contract address" });
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(TOKEN_CA);
  });

  it("renders each profile as its brand mark with no stray text", () => {
    renderDesk();
    for (const name of ["GitHub", "X"]) {
      const link = screen.getByRole("link", { name });
      expect(link.querySelector("svg")).not.toBeNull();
      expect(link.textContent).toBe("");
    }
  });

  it("keeps the profile coordinates on the verified first-party accounts", () => {
    expect(GITHUB_URL).toBe("https://github.com/QuantumQLi");
    expect(X_URL).toBe("https://x.com/QuantumQLi");
  });
});