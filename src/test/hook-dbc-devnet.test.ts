// @vitest-environment node
// Hook Forge v2.2: DBC TransferHookPool builders. Offline: real SDK 1.5.13 instruction builders,
// stub RPC, throwaway local keys. Nothing here signs with a wallet, sends or contacts a network.
import { describe, expect, it } from "vitest";
import { Buffer } from "buffer";
import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";
import { DynamicBondingCurveClient } from "@meteora-ag/dynamic-bonding-curve-sdk";
import {
  DBC_PROGRAM,
  DEFAULT_DBC_FORM,
  TX_SIZE_LIMIT,
  WSOL,
  allowedPrograms,
  buildDbcConfig,
  dbcHookCurve,
  insertDbcHookInit,
  migrationReadiness,
  requiredSigners,
  txSize,
  validateDbcForm,
  verifySwapHookAccounts,
  verifyTxShape,
  type DbcPoolStatus,
} from "@/lib/qli-core/hook-dbc-devnet";
import {
  IX_INIT,
  IX_INIT_DBC,
  KNOWN_HOOK_BUILDS,
  assertReviewedCode,
  buildCreateMint,
  codeFingerprint,
  dbcInitInstruction,
  deriveHookAccounts,
  provenanceOf,
  type ProgramStatus,
} from "@/lib/qli-core/hook-devnet";

const hook = Keypair.generate().publicKey; // local throwaway id, NOT a deployed program
const wallet = Keypair.generate().publicKey;
const form = { ...DEFAULT_DBC_FORM, uri: "https://example.org/qli-hook-test.json" };
const offline = () =>
  new DynamicBondingCurveClient(new Connection("http://127.0.0.1:1"), "confirmed");
const BH = "11111111111111111111111111111111";

async function sdkPoolTx(mint: PublicKey, config: PublicKey) {
  // Same internal builder createPoolWithTransferHook calls after its config RPC read.
  return (
    offline().creator as unknown as {
      buildCreatePoolWithTransferHookTx: (...a: unknown[]) => Promise<Transaction>;
    }
  ).buildCreatePoolWithTransferHookTx(
    {
      name: form.name,
      symbol: form.symbol,
      uri: form.uri,
      payer: wallet,
      poolCreator: wallet,
      config,
      baseMint: mint,
      transferHookProgram: hook,
    },
    new PublicKey(WSOL),
    new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"),
  );
}
const withPayer = (t: Transaction) => {
  t.feePayer = wallet;
  t.recentBlockhash = BH;
  return t;
};

describe("qlihk:db instruction parity with programs/quantum_transfer_hook", () => {
  it("encodes discriminator, fixed open policy and exact account metas", () => {
    const mint = Keypair.generate().publicKey;
    const ix = dbcInitInstruction(hook, wallet, mint);
    expect(Buffer.from(ix.data).toString("hex")).toBe(
      Buffer.from("qlihk:db").toString("hex") + "000000",
    );
    expect(Buffer.from(IX_INIT_DBC).equals(Buffer.from(IX_INIT))).toBe(false);
    const { config, extraMetas } = deriveHookAccounts(mint, hook);
    expect(ix.keys.map((k) => [k.pubkey.toBase58(), k.isSigner, k.isWritable])).toEqual([
      [wallet.toBase58(), true, true],
      [config.toBase58(), false, true],
      [mint.toBase58(), true, false], // mint keypair must sign
      [extraMetas.toBase58(), false, true],
      ["11111111111111111111111111111111", false, false],
    ]);
  });
});

describe("real SDK 1.5.13 transaction shapes", () => {
  it("config: createConfigWithTransferHook signs only wallet + config and invokes only DBC", async () => {
    const cfg = Keypair.generate();
    const sdk = await offline().partner.createConfigWithTransferHook({
      ...dbcHookCurve(form),
      config: cfg.publicKey,
      feeClaimer: wallet,
      leftoverReceiver: wallet,
      quoteMint: new PublicKey(WSOL),
      payer: wallet,
      transferHookProgram: hook,
    });
    const tx = withPayer(new Transaction().add(...sdk.instructions));
    const r = verifyTxShape(tx, {
      signers: [wallet.toBase58(), cfg.publicKey.toBase58()],
      programs: allowedPrograms(hook.toBase58()),
      mustInvoke: [DBC_PROGRAM],
    });
    expect(r.size).toBeLessThanOrEqual(TX_SIZE_LIMIT);
    // hook program id is carried in the config instruction accounts
    expect(sdk.instructions[0]!.keys.some((k) => k.pubkey.equals(hook))).toBe(true);
  });

  it("pool: qlihk:db is inserted right after DBC pool init, signers = wallet + mint, fits 1232", async () => {
    const mint = Keypair.generate();
    const cfg = Keypair.generate().publicKey;
    const sdk = await sdkPoolTx(mint.publicKey, cfg);
    const tx = withPayer(insertDbcHookInit(sdk, dbcInitInstruction(hook, wallet, mint.publicKey)));
    const ids = tx.instructions.map((i) => i.programId.toBase58());
    expect(ids[ids.indexOf(DBC_PROGRAM) + 1]).toBe(hook.toBase58());
    expect(requiredSigners(tx).sort()).toEqual(
      [wallet.toBase58(), mint.publicKey.toBase58()].sort(),
    );
    const r = verifyTxShape(tx, {
      signers: [wallet.toBase58(), mint.publicKey.toBase58()],
      programs: allowedPrograms(hook.toBase58()),
      mustInvoke: [DBC_PROGRAM, hook.toBase58()],
    });
    expect(r.size).toBeLessThanOrEqual(TX_SIZE_LIMIT);
    // Partial-sign with the one-time mint key; byte mutation after that breaks the signature.
    tx.partialSign(mint);
    const msg = tx.serializeMessage();
    const sig = tx.signatures.find((s) => s.publicKey.equals(mint.publicKey))!.signature!;
    expect(sig.length).toBe(64);
    const mutated = Buffer.from(msg);
    mutated[mutated.length - 1] = mutated[mutated.length - 1]! ^ 1;
    expect(Buffer.from(mutated).equals(Buffer.from(msg))).toBe(false);
    expect(tx.verifySignatures(false)).toBe(true);
  });

  it("refuses a hidden first buy (second DBC ix) and transactions without DBC", () => {
    const fake = new TransactionInstruction({
      programId: new PublicKey(DBC_PROGRAM),
      keys: [],
      data: Buffer.alloc(8),
    });
    const two = new Transaction().add(fake, fake);
    expect(() => insertDbcHookInit(two, dbcInitInstruction(hook, wallet, hook))).toThrow(
      /exactly one DBC/,
    );
    expect(() =>
      insertDbcHookInit(new Transaction(), dbcInitInstruction(hook, wallet, hook)),
    ).toThrow(/no DBC/);
  });

  it("verifyTxShape blocks unexpected signers, foreign programs and oversize", () => {
    const mint = Keypair.generate().publicKey;
    const tx = withPayer(new Transaction().add(dbcInitInstruction(hook, wallet, mint)));
    expect(() =>
      verifyTxShape(tx, {
        signers: [wallet.toBase58()],
        programs: allowedPrograms(hook.toBase58()),
        mustInvoke: [],
      }),
    ).toThrow(/signer set/);
    const other = Keypair.generate().publicKey;
    expect(() =>
      verifyTxShape(tx, {
        signers: [wallet.toBase58(), mint.toBase58()],
        programs: allowedPrograms(other.toBase58()),
        mustInvoke: [],
      }),
    ).toThrow(/Unexpected program/);
    const big = withPayer(new Transaction());
    for (let i = 0; i < 12; i++)
      big.add(new TransactionInstruction({ programId: hook, keys: [], data: Buffer.alloc(120) }));
    expect(txSize(big)).toBeGreaterThan(TX_SIZE_LIMIT);
    expect(() =>
      verifyTxShape(big, {
        signers: [wallet.toBase58()],
        programs: allowedPrograms(hook.toBase58()),
        mustInvoke: [],
      }),
    ).toThrow(/limit 1232/);
  });

  it("swap must carry hook, ExtraAccountMetaList and QLi config", () => {
    const mint = Keypair.generate().publicKey;
    const { config, extraMetas } = deriveHookAccounts(mint, hook);
    const ix = (keys: PublicKey[]) =>
      new Transaction().add(
        new TransactionInstruction({
          programId: new PublicKey(DBC_PROGRAM),
          keys: keys.map((pubkey) => ({ pubkey, isSigner: false, isWritable: false })),
          data: Buffer.alloc(8),
        }),
      );
    expect(() => verifySwapHookAccounts(ix([hook, extraMetas, config]), mint, hook)).not.toThrow();
    expect(() => verifySwapHookAccounts(ix([hook, config]), mint, hook)).toThrow(
      /ExtraAccountMetaList/,
    );
    expect(() => verifySwapHookAccounts(ix([extraMetas, config]), mint, hook)).toThrow(
      /hook program/,
    );
  });
});

describe("gates", () => {
  it("form validation: metadata URI required, devnet-sized curve", () => {
    expect(validateDbcForm(DEFAULT_DBC_FORM).join(" ")).toMatch(/Metadata URI missing/);
    expect(validateDbcForm(form)).toEqual([]);
    expect(validateDbcForm({ ...form, migrationMarketCap: 500 }).join(" ")).toMatch(/≤ 200/);
    expect(validateDbcForm({ ...form, uri: "http://x.org/a.json" }).length).toBe(1);
  });

  it("buildDbcConfig refuses mainnet genesis before any SDK call", async () => {
    const mainnet = {
      getGenesisHash: async () => "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d",
    } as never;
    await expect(buildDbcConfig(mainnet, wallet, hook, form, "")).rejects.toThrow(
      /not Solana devnet/,
    );
  });

  it("code fingerprint trims padding; unknown code blocks writes", async () => {
    const a = await codeFingerprint(new Uint8Array([1, 2, 3, 0, 0, 0]));
    expect(a).toBe(await codeFingerprint(new Uint8Array([1, 2, 3])));
    expect(provenanceOf(a, "")).toBe("unknown-third-party");
    expect(provenanceOf(a, a)).toBe("owner-reviewed-build");
    expect(provenanceOf(a, "deadbeef")).toBe("unknown-third-party");
    expect(provenanceOf(KNOWN_HOOK_BUILDS[0]!.fingerprint, "")).toBe("known-qli-build");
    expect(provenanceOf(null, a)).toBe("unknown-third-party");
    const prog = { codeFingerprint: a } as ProgramStatus;
    expect(() => assertReviewedCode(prog, "")).toThrow(/UNKNOWN THIRD-PARTY/);
    expect(() => assertReviewedCode(prog, a)).not.toThrow();
  });

  it("buildCreateMint refuses an executable program whose code is not reviewed", async () => {
    const loader = new PublicKey("BPFLoaderUpgradeab1e11111111111111111111111");
    const pd = PublicKey.findProgramAddressSync([hook.toBuffer()], loader)[0];
    const progData = Buffer.alloc(4 + 32);
    progData[0] = 2;
    pd.toBuffer().copy(progData, 4);
    const pdData = Buffer.concat([
      Buffer.from([3, 0, 0, 0]),
      Buffer.alloc(8),
      Buffer.from([1]),
      wallet.toBuffer(),
      Buffer.from([9, 9, 9]),
    ]);
    const dev = {
      getGenesisHash: async () => "EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG",
      getAccountInfoAndContext: async () => ({
        context: { slot: 7 },
        value: {
          executable: true,
          owner: new PublicKey("BPFLoaderUpgradeab1e11111111111111111111111"),
          data: progData,
        },
      }),
      getAccountInfo: async () => ({ data: pdData, owner: loader, executable: false }),
    } as never;
    await expect(
      buildCreateMint(dev, wallet, hook, {
        decimals: 6,
        supply: 1n,
        policy: { paused: false, allowlist: false, allowed: [] },
      }),
    ).rejects.toThrow(/UNKNOWN THIRD-PARTY/);
  });

  it("migration readiness reads real thresholds and never trusts the flag alone", () => {
    const base: DbcPoolStatus = {
      slot: 1,
      ok: true,
      isTransferHookPool: true,
      baseMint: "m",
      config: "c",
      quoteReserve: "5",
      migrationQuoteThreshold: "10",
      isMigrated: false,
      migrationFeeOption: 1,
      dammConfig: "d",
      checks: [],
    };
    expect(migrationReadiness(base).ready).toBe(false);
    expect(migrationReadiness(base).reasons[0]).toMatch(/5 of 10/);
    expect(migrationReadiness({ ...base, quoteReserve: "10" }).ready).toBe(true);
    expect(migrationReadiness({ ...base, quoteReserve: "10", ok: false }).ready).toBe(false);
    expect(migrationReadiness({ ...base, quoteReserve: "10", isMigrated: true }).ready).toBe(false);
    expect(migrationReadiness({ ...base, quoteReserve: "10", dammConfig: null }).ready).toBe(false);
  });
});
