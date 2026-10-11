// @vitest-environment node
import { describe, expect, it } from "vitest";
import { Connection, Keypair } from "@solana/web3.js";
import { ALLOWED_PROGRAMS, GENESIS, buildLaunch } from "@/lib/qli-core/dbc-launch";
import { DBC_PROGRAM_ID } from "@/lib/qli-core/dbc";

describe("network identity", () => {
  it("uses full 44-character genesis hashes", () => {
    expect(GENESIS["mainnet-beta"]).toBe("5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d");
    expect(GENESIS.devnet).toBe("EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG");
    expect(ALLOWED_PROGRAMS.has(DBC_PROGRAM_ID)).toBe(true);
  });
});

// Opt-in: QLI_PUBLIC_RPC=1. Builds against real public RPCs with an empty throwaway
// address; nothing is signed or sent. Passing means every check before funding succeeded.
const form = {
  name: "Dry Run",
  symbol: "DRY",
  uri: "https://example.com/m.json",
  decimals: 6 as const,
  totalSupply: 1_000_000_000,
  initialMarketCap: 30,
  migrationMarketCap: 300,
  feeBps: 100,
  firstBuyLamports: 0,
};
describe.skipIf(!process.env["QLI_PUBLIC_RPC"])("public RPC dry run", () => {
  for (const [n, url] of [
    ["mainnet-beta", "https://api.mainnet-beta.solana.com"],
    ["devnet", "https://api.devnet.solana.com"],
  ] as const)
    it(
      n,
      async () => {
        await expect(
          buildLaunch(new Connection(url, "confirmed"), n, Keypair.generate().publicKey, form),
        ).rejects.toThrow(/Insufficient SOL/);
      },
      60_000,
    );
});