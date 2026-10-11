// @vitest-environment node
import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { Keypair, PublicKey, type Connection } from "@solana/web3.js";
import {
  getAssociatedTokenAddressSync,
  ASSOCIATED_TOKEN_PROGRAM_ID as SPL_ATA_PROGRAM,
} from "@solana/spl-token";
import { sha256 } from "@noble/hashes/sha256";
import {
  ACCOUNT_VERSION,
  IX,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  LOCAL_BUILD_PROGRAM_ID,
  MAX_INTENT_TTL_SECS,
  QUANTUM_VAULT_DEPLOYMENT,
  SPEND_WINDOW_SECS,
  VaultNotDeployedError,
  assertWithdrawInstruction,
  buildWithdrawInstruction,
  buildWithdrawIntent,
  decodeVault,
  deriveVault,
  deriveTokenAccount,
  encodeVault,
  previewWithdraw,
  writesEnabled,
  chainWritesEnabled,
  validateVaultDeployment,
  UPGRADEABLE_LOADER,
  DEVNET_GENESIS,
  buildCreateVaultInstruction,
  buildDepositInstruction,
  type VaultAccount,
  type VaultDeployment,
} from "@/lib/qli-core/quantum-vault";

const owner = Keypair.generate().publicKey;
const mint = Keypair.generate().publicKey;
const recipient = Keypair.generate().publicKey;
const dest = deriveTokenAccount(recipient, mint);
const pid = new PublicKey(LOCAL_BUILD_PROGRAM_ID);
const NOW = 1_800_000_000n;
const dep: VaultDeployment = {
  cluster: "devnet",
  programId: LOCAL_BUILD_PROGRAM_ID,
  accountVersion: 1,
  verifiedAt: "test",
  upgradeAuthority: owner.toBase58(),
  idlSha256: "a".repeat(64),
  programSha256: "b".repeat(64),
};
const state = (o: Partial<VaultAccount> = {}): VaultAccount => ({
  version: ACCOUNT_VERSION,
  bump: 255,
  owner,
  mint,
  vaultId: 1n,
  decimals: 6,
  destination: dest,
  destinationOwner: recipient,
  maxPerWithdraw: 100n,
  dailyLimit: 250n,
  unlockTs: NOW - 10n,
  windowStart: NOW - 100n,
  windowSpent: 0n,
  nonce: 0n,
  epoch: 0,
  paused: false,
  unpauseAt: 0n,
  ...o,
});
const vault = deriveVault(pid, owner, mint, 1n).vault;
const digest = (b: Uint8Array) => Buffer.from(sha256(b)).toString("hex");
async function attest(d: VaultDeployment = dep) {
  const idl = Buffer.from(JSON.stringify({ address: d.programId }));
  const payload = Buffer.from("test program payload, not deployed");
  d.idlSha256 = digest(idl);
  d.programSha256 = digest(payload);
  const programData = PublicKey.findProgramAddressSync([pid.toBuffer()], UPGRADEABLE_LOADER)[0];
  const program = Buffer.alloc(36);
  program.writeUInt32LE(2);
  programData.toBuffer().copy(program, 4);
  const pd = Buffer.alloc(45 + payload.length);
  pd.writeUInt32LE(3);
  pd[12] = 1;
  owner.toBuffer().copy(pd, 13);
  payload.copy(pd, 45);
  const connection = {
    getGenesisHash: vi.fn(async () => DEVNET_GENESIS),
    getAccountInfo: vi.fn(async (key: PublicKey) => ({
      executable: key.equals(pid),
      owner: UPGRADEABLE_LOADER,
      data: key.equals(pid) ? program : pd,
    })),
  } as unknown as Connection;
  await validateVaultDeployment(connection, d, idl);
  return { connection, idl, program, pd };
}

describe("Quantum Vault Phase 1 client", () => {
  it("is not deployed and refuses all writes", () => {
    expect(QUANTUM_VAULT_DEPLOYMENT).toBeNull();
    expect(writesEnabled()).toBe(false);
    const i = buildWithdrawIntent(vault, state(), 10n, NOW);
    expect(() => buildWithdrawInstruction(owner, state(), i)).toThrow(VaultNotDeployedError);
    expect(writesEnabled({ ...dep, accountVersion: 2 })).toBe(false);
  });
  it("derives deterministic, distinct PDAs per owner/mint/id", () => {
    const a = deriveVault(pid, owner, mint, 1n);
    expect(deriveVault(pid, owner, mint, 1n).vault.equals(a.vault)).toBe(true);
    expect(deriveVault(pid, owner, mint, 2n).vault.equals(a.vault)).toBe(false);
    expect(PublicKey.isOnCurve(a.vault.toBytes())).toBe(false);
    expect(ASSOCIATED_TOKEN_PROGRAM_ID.equals(SPL_ATA_PROGRAM)).toBe(true);
    expect(a.escrow.equals(getAssociatedTokenAddressSync(mint, a.vault, true))).toBe(true);
  });
  it("round-trips and rejects tampered account data", () => {
    const bytes = encodeVault(state({ nonce: 7n, paused: true }));
    expect(bytes.length).toBe(208);
    expect(decodeVault(bytes).nonce).toBe(7n);
    const bad = bytes.slice();
    bad[0] = (bad[0] ?? 0) ^ 1;
    expect(() => decodeVault(bad)).toThrow(/Not a Quantum Vault/);
    const ver = bytes.slice();
    ver[8] = 2;
    expect(() => decodeVault(ver)).toThrow(/version/);
    const flag = bytes.slice();
    flag[8 + 1 + 1 + 32 + 32 + 8 + 1 + 64 + 8 * 6 + 4] = 9;
    expect(() => decodeVault(flag)).toThrow(/paused/);
  });
  it("bounds intent expiry and amount", () => {
    expect(() => buildWithdrawIntent(vault, state(), 0n, NOW)).toThrow();
    expect(() => buildWithdrawIntent(vault, state(), 1n, NOW, MAX_INTENT_TTL_SECS + 1)).toThrow();
    expect(() => buildWithdrawIntent(vault, state(), 1n, NOW, 5)).toThrow();
  });
  it("previews the same negative policy outcomes as the program", () => {
    const s = state();
    const i = buildWithdrawIntent(vault, s, 10n, NOW);
    expect(previewWithdraw(s, i, 1000n, NOW).ok).toBe(true);
    const e = (st: VaultAccount, it: typeof i, esc = 1000n, now = NOW) => {
      const r = previewWithdraw(st, it, esc, now);
      return r.ok ? "ok" : r.error;
    };
    expect(e(state({ paused: true }), i)).toBe("Paused");
    expect(e(state({ unlockTs: NOW + 1n }), i)).toBe("Locked");
    expect(e(s, { ...i, destination: owner.toBase58() })).toBe("WrongDestination");
    expect(e(s, { ...i, amount: 101n })).toBe("OverPerWithdraw");
    expect(e(s, i, 5n)).toBe("InsufficientEscrow");
    expect(e(s, i, 1000n, i.expiresAt + 1n)).toBe("Expired");
    expect(e(state({ nonce: 1n }), i)).toBe("WrongNonce");
    expect(e(state({ epoch: 1 }), i)).toBe("WrongEpoch");
    expect(e(state({ windowSpent: 245n }), i)).toBe("OverDailyLimit");
    expect(e(state({ windowSpent: 245n, windowStart: NOW - BigInt(SPEND_WINDOW_SECS) }), i)).toBe(
      "ok",
    );
  });
  it("guards exact instruction accounts, signer and data", async () => {
    await attest();
    const s = state();
    const i = buildWithdrawIntent(vault, s, 10n, NOW);
    const ix = buildWithdrawInstruction(owner, s, i, dep);
    expect(() => assertWithdrawInstruction(ix, ix)).not.toThrow();
    const tampered = buildWithdrawInstruction(owner, s, { ...i, amount: 11n }, dep);
    expect(() => assertWithdrawInstruction(tampered, ix)).toThrow(/data/);
    expect(() => buildWithdrawInstruction(dest, s, i, dep)).toThrow(/owner/);
    expect(() =>
      buildWithdrawInstruction(owner, s, { ...i, destination: owner.toBase58() }, dep),
    ).toThrow(/Destination/);
  });
  it("requires async chain proof, refuses wrong genesis/authority/bytes and builds all account orders", async () => {
    const d = { ...dep };
    expect(chainWritesEnabled(d)).toBe(false);
    expect(() => buildDepositInstruction(owner, state(), 1n, d)).toThrow(VaultNotDeployedError);
    const { connection, idl, pd } = await attest(d);
    expect(chainWritesEnabled(d)).toBe(true);
    const originalAuthority = d.upgradeAuthority;
    d.upgradeAuthority = null;
    expect(chainWritesEnabled(d)).toBe(false);
    d.upgradeAuthority = originalAuthority;
    expect(
      buildCreateVaultInstruction(
        owner,
        mint,
        {
          vaultId: 1n,
          maxPerWithdraw: 100n,
          dailyLimit: 250n,
          unlockTs: 0n,
          destinationOwner: recipient,
        },
        d,
      ).keys,
    ).toHaveLength(8);
    expect(buildDepositInstruction(owner, state(), 1n, d).keys).toHaveLength(6);
    vi.mocked(connection.getGenesisHash).mockResolvedValue("mainnet");
    await expect(validateVaultDeployment(connection, d, idl)).rejects.toThrow(/Devnet/);
    expect(chainWritesEnabled(d)).toBe(false);
    vi.mocked(connection.getGenesisHash).mockResolvedValue(DEVNET_GENESIS);
    pd[13] = (pd[13] ?? 0) ^ 1;
    await expect(validateVaultDeployment(connection, d, idl)).rejects.toThrow(/authority/);
    pd[13] = (pd[13] ?? 0) ^ 1;
    pd[45] = (pd[45] ?? 0) ^ 1;
    await expect(validateVaultDeployment(connection, d, idl)).rejects.toThrow(/hash/);
  });
  it("generated IDL matches the local program, version and exact withdraw discriminator", () => {
    const idl = JSON.parse(readFileSync("programs/idl/quantum_vault.json", "utf8"));
    expect(idl.address).toBe(LOCAL_BUILD_PROGRAM_ID);
    expect(idl.metadata.version).toBe("0.1.0");
    expect(
      idl.instructions.find((i: { name: string }) => i.name === "withdraw").discriminator,
    ).toEqual(Array.from(IX.withdraw));
  });
  it("program source keeps classic SPL Token only and no admin path", () => {
    const src = readFileSync("programs/quantum_vault/src/lib.rs", "utf8");
    expect(src).toContain("transfer_checked");
    expect(src).not.toMatch(/token_2022|fn (admin|rescue|set_policy|update_policy)/i);
  });
});