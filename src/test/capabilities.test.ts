// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  capability,
  assertCapability,
  MAINNET_CUSTOM_HOOKS_ENABLED,
  type Capability,
} from "@/lib/qli-core/capabilities";
import { laneState, type Facts } from "@/lib/qli-core/network-test";
import { GENESIS } from "@/lib/qli-core/dbc-launch";
import { DEVNET_GENESIS } from "@/lib/qli-core/hook-devnet-core";

const hookCaps: Capability[] = [
  "hook-mint-policy",
  "hook-dbc-launch",
  "hook-swap",
  "hook-migration",
  "hook-program-deploy",
];
describe("capability policy", () => {
  it("full canonical genesis constants", () => {
    expect(GENESIS["mainnet-beta"]).toBe("5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d");
    expect(GENESIS.devnet).toBe("EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG");
    expect(DEVNET_GENESIS).toBe(GENESIS.devnet);
  });
  it("never allows custom hooks or vault deposits on mainnet, even with a deployment", () => {
    expect(MAINNET_CUSTOM_HOOKS_ENABLED).toBe(false);
    const dep = { programId: "x", verifiedSlot: 1, codeFingerprint: "f", upgradeAuthority: "a" };
    for (const c of [...hookCaps, "quantum-vault-deposit" as const]) {
      expect(capability(c, "mainnet-beta", dep).allowed).toBe(false);
      expect(() => assertCapability(c, "mainnet-beta")).toThrow(/Refused/);
    }
  });
  it("devnet hook execution is disabled without a verified deployment", () => {
    for (const c of ["hook-mint-policy", "hook-dbc-launch", "hook-swap"] as const) {
      expect(capability(c, "devnet", null).allowed).toBe(false);
      expect(
        capability(c, "devnet", {
          programId: "x",
          verifiedSlot: 1,
          codeFingerprint: "f",
          upgradeAuthority: "a",
        }).allowed,
      ).toBe(true);
    }
    expect(
      capability("hook-migration", "devnet", {
        programId: "x",
        verifiedSlot: 1,
        codeFingerprint: "f",
        upgradeAuthority: "a",
      }).allowed,
    ).toBe(false);
    expect(capability("hook-program-deploy", "devnet").allowed).toBe(false);
  });
  it("standard DBC launch allowed only through the reviewed flow on both networks", () => {
    expect(capability("standard-dbc-launch", "mainnet-beta").reason).toMatch(
      /0\.1 SOL preflight threshold/,
    );
    expect(capability("standard-dbc-launch", "devnet").allowed).toBe(true);
  });
});

describe("lane badges", () => {
  const f = (o: Partial<Facts> = {}): Facts => ({
    rpc: { ok: true, genesis: GENESIS.devnet, slot: 1 },
    wallet: { connected: true, supportsChain: true, canSignTransaction: true, address: "a" },
    balance: 2e9,
    minLamports: 1e8,
    programsOk: true,
    sessionMatches: true,
    ...o,
  });
  it("maps facts to states without fake success", () => {
    expect(laneState(f())).toBe("ready-to-build");
    expect(
      laneState(
        f({
          wallet: {
            connected: false,
            supportsChain: false,
            canSignTransaction: false,
            address: null,
          },
        }),
      ),
    ).toBe("not-connected");
    expect(
      laneState(
        f({
          wallet: { connected: true, supportsChain: false, canSignTransaction: true, address: "a" },
        }),
      ),
    ).toBe("wrong-network");
    expect(laneState(f({ rpc: { ok: false, kind: "rate-limited", message: "" } }))).toBe(
      "rpc-unavailable",
    );
    expect(laneState(f({ rpc: { ok: false, kind: "wrong-genesis", message: "" } }))).toBe(
      "wrong-network",
    );
    expect(laneState(f({ balance: 5 }))).toBe("unfunded");
    expect(laneState(f({ rpc: null }))).toBe("not-connected");
    expect(
      laneState(
        f({
          launchProof: {
            source: "launch-proof-engine",
            signature: "s",
            slot: 2,
            pool: "p",
            creator: "W",
            baseMint: "m",
          },
        }),
      ),
    ).toBe("confirmed");
  });
});