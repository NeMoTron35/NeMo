import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HackathonPitch } from "@/components/qli/hackathon-pitch";
import { pitchIndex, pitchSlides } from "@/lib/qli/hackathon-pitch";
vi.mock("@tanstack/react-router", () => ({
  Link: ({ to, children, ...props }: { to: string; children: React.ReactNode }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}));
vi.stubGlobal(
  "ResizeObserver",
  class {
    observe() {}
    disconnect() {}
  },
);
afterEach(cleanup);
describe("Public hackathon pitch", () => {
  it("has exactly eight slides and bounds URL input", () => {
    expect(pitchSlides).toHaveLength(8);
    for (const value of [0, 9, "unsafe", 1.5, undefined]) expect(pitchIndex(value)).toBe(1);
    expect(pitchIndex("8")).toBe(8);
  });
  it("navigates by keyboard and mouse with boundary controls", () => {
    const onSlide = vi.fn();
    render(<HackathonPitch slide={1} onSlide={onSlide} />);
    expect(screen.getByRole("button", { name: "Previous slide" })).toBeDisabled();
    fireEvent.keyDown(window, { key: "ArrowLeft" });
    expect(onSlide).not.toHaveBeenCalled();
    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(onSlide).toHaveBeenCalledWith(2);
    fireEvent.click(screen.getByRole("button", { name: "Go to slide 8: WHY METEORA / ROADMAP" }));
    expect(onSlide).toHaveBeenCalledWith(8);
  });
  it("retains honest evidence labels and public sources in printable slides", () => {
    render(<HackathonPitch slide={7} onSlide={() => {}} />);
    expect(screen.getByText("VERIFIED IN LOCAL TESTS")).toBeInTheDocument();
    expect(screen.getByText("REQUIRES REAL-WORLD VALIDATION")).toBeInTheDocument();
    expect(screen.getByText(/live hosted inference NOT VERIFIED/)).toBeInTheDocument();
    expect(screen.getByText(/Solana wallets still use Ed25519/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Public repository" })).toHaveAttribute(
      "href",
      "https://github.com/QuantumQLi/QLi",
    );
    expect(screen.getByRole("button", { name: "Print / Save PDF" })).toBeInTheDocument();
  });
});
