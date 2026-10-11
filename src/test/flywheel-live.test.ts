// @vitest-environment node
import { describe, expect, it } from "vitest";
import { Keypair, PublicKey, SystemProgram, Transaction } from "@solana/web3.js";
import {
  TOKEN_PROGRAM,
  assertAllowedPrograms,
  burnCheckedInstruction,
  flywheelFingerprint,
  fromBaseUnits,
  toBaseUnits,
  buildFlywheelStep,
  type FlywheelPool,
} from "@/lib/qli-core/flywheel-live";

const owner = Keypair.generate().publicKey;
const mint = Keypair.generate().publicKey;

describe("flywheel live helpers", () => {
  it("converts decimal amounts exactly", () => {
    expect(toBaseUnits("1.5", 9)).toBe(1_500_000_000n);
    expect(fromBaseUnits(1_500_000_000n, 9)).toBe("1.5");
    expect(() => toBaseUnits("1.1234567", 6)).toThrow(/decimal places/);
    expect(() => toBaseUnits("-1", 6)).toThrow();
  });
  it("encodes BurnChecked exactly", () => {
    const ix = burnCheckedInstruction({
      account: owner,
      mint,
      owner,
      amount: 258n,
      decimals: 6,
      tokenProgram: new PublicKey(TOKEN_PROGRAM),
    });
    expect([...ix.data]).toEqual([15, 2, 1, 0, 0, 0, 0, 0, 0, 6]);
    expect(ix.keys[2]!.isSigner).toBe(true);
    expect(() =>
      burnCheckedInstruction({
        account: owner,
        mint,
        owner,
        amount: 0n,
        decimals: 6,
        tokenProgram: new PublicKey(TOKEN_PROGRAM),
      }),
    ).toThrow();
  });
  it("refuses unexpected programs", () => {
    const tx = new Transaction().add(
      SystemProgram.transfer({ fromPubkey: owner, toPubkey: mint, lamports: 1 }),
    );
    expect(() => assertAllowedPrograms(tx)).not.toThrow();
    tx.add({ programId: Keypair.generate().publicKey, keys: [], data: Buffer.alloc(0) });
    expect(() => assertAllowedPrograms(tx)).toThrow(/unexpected program/);
  });
  it("fingerprint changes with any reviewed input", () => {
    const base = {
      network: "mainnet-beta" as const,
      rpc: "https://a",
      account: "x",
      pool: "p",
      input: { step: "buyback" as const, amountSol: "1", capSol: 1, slippageBps: 100 },
    };
    const f = flywheelFingerprint(base);
    expect(flywheelFingerprint({ ...base, rpc: "https://b" })).not.toBe(f);
    expect(flywheelFingerprint({ ...base, input: { ...base.input, amountSol: "2" } })).not.toBe(f);
    expect(flywheelFingerprint({ ...base, account: "y" })).not.toBe(f);
  });
});

describe("flywheel step guards (before any RPC)", () => {
  const pool = {
    pool: Keypair.generate().publicKey.toBase58(),
    creator: owner.toBase58(),
    baseMint: mint.toBase58(),
    quoteMint: "So11111111111111111111111111111111111111112",
    baseDecimals: 6,
    baseTokenProgram: TOKEN_PROGRAM,
    isMigrated: false,
    creatorQuoteFee: "0",
    creatorBaseFee: "0",
  } as unknown as FlywheelPool;
  const rpc = "https://api.devnet.solana.com";
  it("blocks a wallet that is not the creator", async () => {
    await expect(buildFlywheelStep(rpc, pool, mint.toBase58(), { step: "claim" })).rejects.toThrow(
      /creator/,
    );
  });
  it("blocks empty claims, migrated pools, cap overruns and over-balance burns", async () => {
    const w = owner.toBase58();
    await expect(buildFlywheelStep(rpc, pool, w, { step: "claim" })).rejects.toThrow(
      /No creator fees/,
    );
    await expect(
      buildFlywheelStep(rpc, { ...pool, isMigrated: true }, w, {
        step: "buyback",
        amountSol: "0.1",
        capSol: 1,
        slippageBps: 100,
      }),
    ).rejects.toThrow(/migrated/);
    await expect(
      buildFlywheelStep(rpc, { ...pool, quoteMint: mint.toBase58() }, w, {
        step: "buyback",
        amountSol: "0.1",
        capSol: 1,
        slippageBps: 100,
      }),
    ).rejects.toThrow(/SOL-quoted/);
    await expect(
      buildFlywheelStep(rpc, pool, w, {
        step: "buyback",
        amountSol: "2",
        capSol: 1,
        slippageBps: 100,
      }),
    ).rejects.toThrow(/cap/);
    await expect(
      buildFlywheelStep(rpc, pool, w, {
        step: "buyback",
        amountSol: "0.1",
        capSol: 1,
        slippageBps: 5000,
      }),
    ).rejects.toThrow(/Slippage/);
    await expect(
      buildFlywheelStep(rpc, pool, w, { step: "burn", amount: "5", balance: 1_000_000n }),
    ).rejects.toThrow(/exceeds/);
  });
});