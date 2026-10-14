import { describe, expect, it } from "vitest";
import { act, render } from "@testing-library/react";
import { ConsoleProvider } from "@/lib/qli-core/console-provider";
import { useConsole } from "@/lib/qli-core/context";
import type { ConsoleState } from "@/lib/qli-core/context";

describe("event log detail", () => {
  it("keeps simulation wording by default and records on-chain detail when given", () => {
    let c: ConsoleState | undefined;
    function Probe() {
      c = useConsole();
      return null;
    }
    render(
      <ConsoleProvider>
        <Probe />
      </ConsoleProvider>,
    );
    act(() => c!.log("Preview", "Agent"));
    expect(c!.events[0]?.detail).toBe("Local simulation · No on-chain write");
    act(() =>
      c!.log("Pool confirmed", "Launch", "AB", "On-chain · Solana devnet · signature S · pool P"),
    );
    expect(c!.events[0]?.detail).toMatch(/^On-chain · Solana devnet/);
    expect(c!.events[0]?.detail).not.toMatch(/simulation/i);
  });
});
