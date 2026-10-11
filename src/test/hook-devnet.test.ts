// @vitest-environment node
import { describe, expect, it } from "vitest";
import { Keypair, PublicKey, SystemProgram } from "@solana/web3.js";
import {
  CONFIG_LEN,
  DBC_HOOK_NOTES,
  classifySimulation,
  decodeConfig,
  deriveHookAccounts,
  encodePolicy,
  initInstruction,
  inspectMint,
  inspectProgram,
  setPolicyInstruction,
  validatePolicy,
} from "@/lib/qli-core/hook-devnet";

const hook = Keypair.generate().publicKey;
const mint = Keypair.generate().publicKey;
const auth = Keypair.generate().publicKey;

// Mirror of Rust encode_config layout (programs/quantum_transfer_hook/src/lib.rs).
function rustConfig(paused: boolean, allowlist: boolean, allowed: PublicKey[]) {
  const d = new Uint8Array(CONFIG_LEN);
  d.set(new TextEncoder().encode("QLIHOOK1"));
  d[8] = 1;
  d[9] = 254;
  d[10] = +paused;
  d[11] = +allowlist;
  d.set(auth.toBytes(), 12);
  d.set(mint.toBytes(), 44);
  d[76] = allowed.length;
  allowed.forEach((a, i) => d.set(a.toBytes(), 77 + 32 * i));
  return d;
}

describe("Hook Forge v2.1 devnet builders", () => {
  it("matches the Rust policy wire format and instruction accounts", () => {
    const a = Keypair.generate().publicKey;
    const enc = encodePolicy({ paused: true, allowlist: true, allowed: [a.toBase58()] });
    expect([...enc.slice(0, 3)]).toEqual([1, 1, 1]);
    expect(enc.length).toBe(35);
    expect(CONFIG_LEN).toBe(333);
    const init = initInstruction(hook, auth, mint, {
      paused: false,
      allowlist: false,
      allowed: [],
    });
    expect(new TextDecoder().decode(init.data.subarray(0, 8))).toBe("qlihk:in");
    const { config, extraMetas } = deriveHookAccounts(mint, hook);
    expect(init.keys.map((k) => [k.pubkey.toBase58(), k.isSigner, k.isWritable])).toEqual([
      [auth.toBase58(), true, true],
      [config.toBase58(), false, true],
      [mint.toBase58(), false, false],
      [extraMetas.toBase58(), false, true],
      [SystemProgram.programId.toBase58(), false, false],
    ]);
    const set = setPolicyInstruction(hook, auth, mint, {
      paused: true,
      allowlist: false,
      allowed: [],
    });
    expect(new TextDecoder().decode(set.data.subarray(0, 8))).toBe("qlihk:sp");
    expect(set.keys).toHaveLength(3);
  });

  it("rejects invalid policies like the program does", () => {
    expect(validatePolicy({ paused: false, allowlist: true, allowed: [] })).toMatch(/at least one/);
    const k = Keypair.generate().publicKey.toBase58();
    expect(validatePolicy({ paused: false, allowlist: true, allowed: [k, k] })).toMatch(/unique/);
    const nine = Array.from({ length: 9 }, () => Keypair.generate().publicKey.toBase58());
    expect(validatePolicy({ paused: false, allowlist: true, allowed: nine })).toMatch(/At most/);
    expect(() => encodePolicy({ paused: false, allowlist: true, allowed: ["nope"] })).toThrow();
  });

  it("decodes the on-chain config layout and refuses malformed bytes", () => {
    const a = Keypair.generate().publicKey;
    const c = decodeConfig(rustConfig(true, true, [a]))!;
    expect(c).toMatchObject({ authority: auth.toBase58(), mint: mint.toBase58(), bump: 254 });
    expect(c.policy).toEqual({ paused: true, allowlist: true, allowed: [a.toBase58()] });
    const bad = rustConfig(false, false, []);
    bad[0] = 0;
    expect(decodeConfig(bad)).toBeNull();
    expect(decodeConfig(new Uint8Array(10))).toBeNull();
    const many = rustConfig(false, false, []);
    many[76] = 9;
    expect(decodeConfig(many)).toBeNull();
  });

  it("attributes simulation refusals to the hook only with the hook failure log", () => {
    const err = { InstructionError: [1, { Custom: 0x5100 }] };
    const logs = [
      `Program ${hook.toBase58()} invoke [2]`,
      `Program ${hook.toBase58()} failed: custom program error: 0x5100`,
    ];
    const v = classifySimulation(err, logs, 9, hook.toBase58());
    expect(v.outcome).toBe("hook-denied");
    expect(v.note).toMatch(/Simulation only/);
    expect(classifySimulation(err, ["Program X failed"], 9, hook.toBase58()).outcome).toBe(
      "other-failure",
    );
    expect(
      classifySimulation({ InstructionError: [0, { Custom: 1 }] }, logs, 9, hook.toBase58())
        .outcome,
    ).toBe("other-failure");
    expect(classifySimulation(null, [], 9, hook.toBase58()).outcome).toBe("allowed");
  });

  it("refuses non-devnet RPC and reports missing programs and non-Token-2022 mints", async () => {
    const mainnet = {
      getGenesisHash: async () => "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d",
    } as never;
    await expect(inspectProgram(mainnet, hook)).rejects.toThrow(/not Solana devnet/);
    const dev = {
      getGenesisHash: async () => "EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG",
      getAccountInfoAndContext: async () => ({ context: { slot: 5 }, value: null }),
      getMultipleAccountsInfoAndContext: async () => ({
        context: { slot: 5 },
        value: [
          {
            owner: new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"),
            data: Buffer.alloc(82),
          },
          null,
          null,
        ],
      }),
    } as never;
    const p = await inspectProgram(dev, hook);
    expect(p.executable).toBe(false);
    expect(p.checks[0]!.detail).toMatch(/Program deployment required/);
    const m = await inspectMint(dev, mint, hook);
    expect(m.token2022).toBe(false);
    expect(m.checks[0]!.ok).toBe(false);
  });

  it("keeps DBC/DAMM hook paths explicitly blocked", () => {
    expect(DBC_HOOK_NOTES.length).toBeGreaterThanOrEqual(3);
    expect(DBC_HOOK_NOTES.join(" ")).toMatch(/allowlist/);
    expect(DBC_HOOK_NOTES.join(" ")).toMatch(/pool authority PDA/);
  });
});