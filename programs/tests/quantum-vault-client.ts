// Quantum Vault Phase 1 typed client. Mirrors programs/quantum_vault (NOT AUDITED, NOT DEPLOYED).
// Every write path is refused until a verified deployment (program id + account version) is
// configured below. Local policy previews are advisory only — the program is the authority.
import { PublicKey, SystemProgram, TransactionInstruction, type Connection } from "@solana/web3.js";
import { sha256 } from "@noble/hashes/sha256";

export const TOKEN_PROGRAM_ID = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
export const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey(
  "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL",
);
export const VAULT_SEED = "qvault";
export const ACCOUNT_VERSION = 1;
export const SPEND_WINDOW_SECS = 86_400;
export const MAX_INTENT_TTL_SECS = 600;
export const UNPAUSE_DELAY_SECS = 86_400;
export const U64_MAX = (1n << 64n) - 1n;

/** Local-build id from programs/Anchor.toml. NOT a deployed address. */
export const LOCAL_BUILD_PROGRAM_ID = "93v9K8ytGDR3BAoxtaVVo7u1oaBv3Pu257eBAPCp7SH5";

export type VaultDeployment = {
  cluster: "devnet";
  programId: string;
  accountVersion: number;
  verifiedAt: string;
  upgradeAuthority: string | null;
  idlSha256: string;
  programSha256: string;
};
/** Null until a real devnet deployment is verified. Never fill with a guessed address. */
export const QUANTUM_VAULT_DEPLOYMENT: VaultDeployment | null = null;
export const VAULT_STATUS_LABEL = "DEVNET NOT DEPLOYED — DO NOT DEPOSIT";

export function writesEnabled(d: VaultDeployment | null = QUANTUM_VAULT_DEPLOYMENT): boolean {
  return (
    !!d &&
    d.cluster === "devnet" &&
    d.accountVersion === ACCOUNT_VERSION &&
    /^[a-f0-9]{64}$/.test(d.idlSha256) &&
    /^[a-f0-9]{64}$/.test(d.programSha256)
  );
}
export class VaultNotDeployedError extends Error {
  constructor() {
    super(`${VAULT_STATUS_LABEL}. Writes stay disabled until a verified deployment is configured.`);
    this.name = "VaultNotDeployedError";
  }
}
function requireDeployment(d: VaultDeployment | null): PublicKey {
  if (!d || !chainWritesEnabled(d)) throw new VaultNotDeployedError();
  return new PublicKey(d.programId);
}

const enc = new TextEncoder();
const disc = (s: string) => sha256(enc.encode(s)).slice(0, 8);
export const VAULT_DISCRIMINATOR = disc("account:Vault");
export const IX = {
  createVault: disc("global:create_vault"),
  deposit: disc("global:deposit"),
  withdraw: disc("global:withdraw"),
  pause: disc("global:pause"),
  requestUnpause: disc("global:request_unpause"),
  unpause: disc("global:unpause"),
} as const;

function u64le(v: bigint) {
  if (v < 0n || v > U64_MAX) throw new Error("u64 out of range");
  const b = new Uint8Array(8);
  new DataView(b.buffer).setBigUint64(0, v, true);
  return b;
}
function i64le(v: bigint) {
  if (v < -(1n << 63n) || v > (1n << 63n) - 1n) throw new Error("i64 out of range");
  const b = new Uint8Array(8);
  new DataView(b.buffer).setBigInt64(0, v, true);
  return b;
}
function u32le(v: number) {
  if (!Number.isInteger(v) || v < 0 || v > 0xffffffff) throw new Error("u32 out of range");
  const b = new Uint8Array(4);
  new DataView(b.buffer).setUint32(0, v, true);
  return b;
}
const cat = (...p: Uint8Array[]) => {
  const out = new Uint8Array(p.reduce((n, x) => n + x.length, 0));
  let o = 0;
  for (const x of p) {
    out.set(x, o);
    o += x.length;
  }
  return out;
};

export function deriveVault(
  programId: PublicKey,
  owner: PublicKey,
  mint: PublicKey,
  vaultId: bigint,
) {
  const [vault, bump] = PublicKey.findProgramAddressSync(
    [enc.encode(VAULT_SEED), owner.toBuffer(), mint.toBuffer(), u64le(vaultId)],
    programId,
  );
  const [escrow] = PublicKey.findProgramAddressSync(
    [vault.toBuffer(), TOKEN_PROGRAM_ID.toBuffer(), mint.toBuffer()],
    ASSOCIATED_TOKEN_PROGRAM_ID,
  );
  return { vault, bump, escrow };
}

export type VaultAccount = {
  version: number;
  bump: number;
  owner: PublicKey;
  mint: PublicKey;
  vaultId: bigint;
  decimals: number;
  destination: PublicKey;
  destinationOwner: PublicKey;
  maxPerWithdraw: bigint;
  dailyLimit: bigint;
  unlockTs: bigint;
  windowStart: bigint;
  windowSpent: bigint;
  nonce: bigint;
  epoch: number;
  paused: boolean;
  unpauseAt: bigint;
};
export const VAULT_ACCOUNT_SIZE = 208;

export function decodeVault(data: Uint8Array): VaultAccount {
  if (data.length !== VAULT_ACCOUNT_SIZE) throw new Error("Vault account too small");
  for (let i = 0; i < 8; i++)
    if (data[i] !== VAULT_DISCRIMINATOR[i]) throw new Error("Not a Quantum Vault account");
  const v = new DataView(data.buffer, data.byteOffset, data.byteLength);
  let o = 8;
  const u8 = () => {
    const value = data[o++];
    if (value === undefined) throw new Error("Truncated account");
    return value;
  };
  const key = () => {
    const k = new PublicKey(data.slice(o, o + 32));
    o += 32;
    return k;
  };
  const u64 = () => ((o += 8), v.getBigUint64(o - 8, true));
  const i64 = () => ((o += 8), v.getBigInt64(o - 8, true));
  const version = u8();
  if (version !== ACCOUNT_VERSION) throw new Error(`Unsupported vault version ${version}`);
  const bump = u8();
  const owner = key();
  const mint = key();
  const vaultId = u64();
  const decimals = u8();
  const destination = key();
  const destinationOwner = key();
  const maxPerWithdraw = u64();
  const dailyLimit = u64();
  const unlockTs = i64();
  const windowStart = i64();
  const windowSpent = u64();
  const nonce = u64();
  const epoch = ((o += 4), v.getUint32(o - 4, true));
  const pausedByte = u8();
  if (pausedByte > 1) throw new Error("Invalid paused flag");
  const unpauseAt = i64();
  return {
    version,
    bump,
    owner,
    mint,
    vaultId,
    decimals,
    destination,
    destinationOwner,
    maxPerWithdraw,
    dailyLimit,
    unlockTs,
    windowStart,
    windowSpent,
    nonce,
    epoch,
    paused: pausedByte === 1,
    unpauseAt,
  };
}

/** Test helper / fixtures: exact inverse of decodeVault. */
export function encodeVault(a: VaultAccount): Uint8Array {
  return cat(
    VAULT_DISCRIMINATOR,
    new Uint8Array([a.version, a.bump]),
    a.owner.toBytes(),
    a.mint.toBytes(),
    u64le(a.vaultId),
    new Uint8Array([a.decimals]),
    a.destination.toBytes(),
    a.destinationOwner.toBytes(),
    u64le(a.maxPerWithdraw),
    u64le(a.dailyLimit),
    i64le(a.unlockTs),
    i64le(a.windowStart),
    u64le(a.windowSpent),
    u64le(a.nonce),
    u32le(a.epoch),
    new Uint8Array([a.paused ? 1 : 0]),
    i64le(a.unpauseAt),
  );
}

export type WithdrawIntent = {
  vault: string;
  amount: bigint;
  destination: string;
  nonce: bigint;
  epoch: number;
  expiresAt: bigint;
};

/** Strict intent builder: nonce/epoch come from freshly read state, never from user input. */
export function buildWithdrawIntent(
  vault: PublicKey,
  state: VaultAccount,
  amount: bigint,
  nowSecs: bigint,
  ttlSecs = 120,
): WithdrawIntent {
  if (!Number.isInteger(ttlSecs) || ttlSecs < 30 || ttlSecs > MAX_INTENT_TTL_SECS)
    throw new Error(`Intent expiry must be 30–${MAX_INTENT_TTL_SECS} seconds`);
  if (amount <= 0n || amount > U64_MAX) throw new Error("Amount must be a positive u64");
  i64le(nowSecs);
  i64le(nowSecs + BigInt(ttlSecs));
  u64le(state.nonce);
  u32le(state.epoch);
  return {
    vault: vault.toBase58(),
    amount,
    destination: state.destination.toBase58(),
    nonce: state.nonce,
    epoch: state.epoch,
    expiresAt: nowSecs + BigInt(ttlSecs),
  };
}

export type PolicyResult = { ok: true; next: VaultAccount } | { ok: false; error: string };
/** Advisory mirror of quantum_vault_policy::check_withdraw. The program remains the authority. */
export function previewWithdraw(
  s: VaultAccount,
  i: WithdrawIntent,
  escrow: bigint,
  now: bigint,
): PolicyResult {
  const fail = (error: string) => ({ ok: false as const, error });
  if (i.amount < 0n || i.amount > U64_MAX || escrow < 0n || escrow > U64_MAX)
    return fail("Overflow");
  if (s.windowStart + BigInt(SPEND_WINDOW_SECS) > (1n << 63n) - 1n) return fail("Overflow");
  if (i.amount === 0n) return fail("ZeroAmount");
  if (s.paused) return fail("Paused");
  if (now < s.unlockTs) return fail("Locked");
  if (now > i.expiresAt) return fail("Expired");
  if (i.expiresAt - now > BigInt(MAX_INTENT_TTL_SECS)) return fail("ExpiryTooFar");
  if (i.epoch !== s.epoch) return fail("WrongEpoch");
  if (i.nonce !== s.nonce) return fail("WrongNonce");
  if (i.destination !== s.destination.toBase58()) return fail("WrongDestination");
  if (i.amount > s.maxPerWithdraw) return fail("OverPerWithdraw");
  if (i.amount > escrow) return fail("InsufficientEscrow");
  const reset = now >= s.windowStart + BigInt(SPEND_WINDOW_SECS);
  const start = reset ? now : s.windowStart;
  const spent = (reset ? 0n : s.windowSpent) + i.amount;
  if (spent > U64_MAX) return fail("Overflow");
  if (spent > s.dailyLimit) return fail("OverDailyLimit");
  if (s.nonce + 1n > U64_MAX) return fail("Overflow");
  return { ok: true, next: { ...s, windowStart: start, windowSpent: spent, nonce: s.nonce + 1n } };
}

/** Builds the withdraw instruction only when a verified deployment exists. */
export function buildWithdrawInstruction(
  owner: PublicKey,
  state: VaultAccount,
  intent: WithdrawIntent,
  deployment: VaultDeployment | null = QUANTUM_VAULT_DEPLOYMENT,
): TransactionInstruction {
  const programId = requireDeployment(deployment);
  if (!state.owner.equals(owner)) throw new Error("Connected wallet is not the vault owner");
  const { vault, escrow } = deriveVault(programId, owner, state.mint, state.vaultId);
  if (vault.toBase58() !== intent.vault) throw new Error("Intent vault does not match derived PDA");
  if (intent.amount <= 0n || intent.nonce !== state.nonce || intent.epoch !== state.epoch)
    throw new Error("Stale or invalid intent");
  if (!deriveTokenAccount(state.destinationOwner, state.mint).equals(state.destination))
    throw new Error("Noncanonical destination");
  if (intent.destination !== state.destination.toBase58()) throw new Error("Destination mismatch");
  const data = cat(
    IX.withdraw,
    u64le(intent.amount),
    u64le(intent.nonce),
    u32le(intent.epoch),
    i64le(intent.expiresAt),
  );
  return new TransactionInstruction({
    programId,
    keys: [
      { pubkey: owner, isSigner: true, isWritable: false },
      { pubkey: vault, isSigner: false, isWritable: true },
      { pubkey: state.mint, isSigner: false, isWritable: false },
      { pubkey: escrow, isSigner: false, isWritable: true },
      { pubkey: state.destination, isSigner: false, isWritable: true },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    data: data as unknown as Buffer,
  });
}

/** Exact instruction guard run before wallet review: program, accounts, signer and data. */
export function assertWithdrawInstruction(
  ix: TransactionInstruction,
  expected: TransactionInstruction,
) {
  if (!ix.programId.equals(expected.programId)) throw new Error("Unexpected program id");
  if (ix.keys.length !== expected.keys.length) throw new Error("Unexpected account list");
  ix.keys.forEach((k, n) => {
    const e = expected.keys[n];
    if (!e) throw new Error("Missing expected account");
    if (!k.pubkey.equals(e.pubkey) || k.isSigner !== e.isSigner || k.isWritable !== e.isWritable)
      throw new Error(`Account ${n} differs from reviewed instruction`);
  });
  const signers = ix.keys.filter((k) => k.isSigner);
  if (signers.length !== 1) throw new Error("Withdraw must have exactly one signer (owner)");
  if (ix.data.length !== expected.data.length || ix.data.some((b, n) => b !== expected.data[n]))
    throw new Error("Instruction data differs from reviewed intent");
}

/** Post-confirmation check: re-read state must show the nonce advanced exactly once. */
export function verifyPostWithdraw(
  before: VaultAccount,
  after: VaultAccount,
  programOwner: PublicKey,
  deployment: VaultDeployment | null = QUANTUM_VAULT_DEPLOYMENT,
) {
  const programId = requireDeployment(deployment);
  if (!programOwner.equals(programId)) throw new Error("Vault account is not owned by the program");
  if (after.nonce !== before.nonce + 1n) throw new Error("Nonce did not advance exactly once");
}

export function deriveTokenAccount(owner: PublicKey, mint: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [owner.toBuffer(), TOKEN_PROGRAM_ID.toBuffer(), mint.toBuffer()],
    ASSOCIATED_TOKEN_PROGRAM_ID,
  )[0];
}

export const DEVNET_GENESIS = "EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG";
export const UPGRADEABLE_LOADER = new PublicKey("BPFLoaderUpgradeab1e11111111111111111111111");
const verifiedDeployments = new WeakMap<
  VaultDeployment,
  { connection: Connection; until: number; fingerprint: string }
>();
const hex = (bytes: Uint8Array) =>
  Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");

/** Public, read-only chain attestation. No key, signing or broadcast. An IDL hash alone is not proof. */
export async function validateVaultDeployment(
  connection: Connection,
  deployment: VaultDeployment | null,
  idlBytes: Uint8Array,
): Promise<void> {
  if (!deployment || !writesEnabled(deployment)) throw new VaultNotDeployedError();
  verifiedDeployments.delete(deployment);
  if (hex(sha256(idlBytes)) !== deployment.idlSha256) throw new Error("IDL hash mismatch");
  const idl: unknown = JSON.parse(new TextDecoder().decode(idlBytes));
  if (
    !idl ||
    typeof idl !== "object" ||
    !("address" in idl) ||
    idl.address !== deployment.programId
  )
    throw new Error("IDL address mismatch");
  if ((await connection.getGenesisHash()) !== DEVNET_GENESIS) throw new Error("Devnet required");
  const pid = new PublicKey(deployment.programId);
  const program = await connection.getAccountInfo(pid, "confirmed");
  if (
    !program?.executable ||
    !program.owner.equals(UPGRADEABLE_LOADER) ||
    program.data.length !== 36
  )
    throw new Error("Executable upgradeable program required");
  const view = new DataView(program.data.buffer, program.data.byteOffset, program.data.length);
  if (view.getUint32(0, true) !== 2) throw new Error("Invalid program state");
  const address = new PublicKey(program.data.subarray(4, 36));
  const derived = PublicKey.findProgramAddressSync([pid.toBuffer()], UPGRADEABLE_LOADER)[0];
  if (!address.equals(derived)) throw new Error("ProgramData address mismatch");
  const data = await connection.getAccountInfo(address, "confirmed");
  if (!data || data.executable || !data.owner.equals(UPGRADEABLE_LOADER) || data.data.length < 45)
    throw new Error("Invalid ProgramData");
  const dv = new DataView(data.data.buffer, data.data.byteOffset, data.data.length);
  if (dv.getUint32(0, true) !== 3) throw new Error("Invalid ProgramData state");
  const option = data.data[12];
  if (option !== 0 && option !== 1) throw new Error("Invalid upgrade authority option");
  const authority = option === 1 ? new PublicKey(data.data.subarray(13, 45)).toBase58() : null;
  if (authority !== deployment.upgradeAuthority) throw new Error("Upgrade authority mismatch");
  // Hash includes the entire deployed program payload, including any allocated zero padding.
  if (hex(sha256(data.data.subarray(45))) !== deployment.programSha256)
    throw new Error("Deployed program hash mismatch");
  verifiedDeployments.set(deployment, {
    connection,
    until: Date.now() + 30_000,
    fingerprint: JSON.stringify(deployment),
  });
}

export function chainWritesEnabled(
  deployment: VaultDeployment | null = QUANTUM_VAULT_DEPLOYMENT,
): boolean {
  if (!deployment) return false;
  const proof = verifiedDeployments.get(deployment);
  return (
    writesEnabled(deployment) &&
    !!proof &&
    proof.until > Date.now() &&
    proof.fingerprint === JSON.stringify(deployment)
  );
}

export type CreateVaultPolicy = {
  vaultId: bigint;
  maxPerWithdraw: bigint;
  dailyLimit: bigint;
  unlockTs: bigint;
  destinationOwner: PublicKey;
};
export function buildCreateVaultInstruction(
  owner: PublicKey,
  mint: PublicKey,
  policy: CreateVaultPolicy,
  deployment: VaultDeployment | null = QUANTUM_VAULT_DEPLOYMENT,
): TransactionInstruction {
  const programId = requireDeployment(deployment);
  if (
    policy.maxPerWithdraw <= 0n ||
    policy.dailyLimit < policy.maxPerWithdraw ||
    policy.unlockTs < 0n
  )
    throw new Error("Invalid immutable policy");
  const { vault, escrow } = deriveVault(programId, owner, mint, policy.vaultId);
  const destination = deriveTokenAccount(policy.destinationOwner, mint);
  if (destination.equals(escrow) || policy.destinationOwner.equals(vault))
    throw new Error("Self destination refused");
  return new TransactionInstruction({
    programId,
    keys: [
      { pubkey: owner, isSigner: true, isWritable: true },
      { pubkey: mint, isSigner: false, isWritable: false },
      { pubkey: vault, isSigner: false, isWritable: true },
      { pubkey: escrow, isSigner: false, isWritable: true },
      { pubkey: destination, isSigner: false, isWritable: false },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: cat(
      IX.createVault,
      u64le(policy.vaultId),
      u64le(policy.maxPerWithdraw),
      u64le(policy.dailyLimit),
      i64le(policy.unlockTs),
    ) as unknown as Buffer,
  });
}

export function buildDepositInstruction(
  depositor: PublicKey,
  state: VaultAccount,
  amount: bigint,
  deployment: VaultDeployment | null = QUANTUM_VAULT_DEPLOYMENT,
): TransactionInstruction {
  const programId = requireDeployment(deployment);
  if (amount <= 0n) throw new Error("Positive amount required");
  const { vault, escrow } = deriveVault(programId, state.owner, state.mint, state.vaultId);
  return new TransactionInstruction({
    programId,
    keys: [
      { pubkey: depositor, isSigner: true, isWritable: false },
      { pubkey: vault, isSigner: false, isWritable: false },
      { pubkey: state.mint, isSigner: false, isWritable: false },
      { pubkey: deriveTokenAccount(depositor, state.mint), isSigner: false, isWritable: true },
      { pubkey: escrow, isSigner: false, isWritable: true },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    data: cat(IX.deposit, u64le(amount)) as unknown as Buffer,
  });
}

/** Fresh public state read. Accounts must be owned by the expected programs and canonical PDAs. */
export async function readVerifiedVault(
  connection: Connection,
  vault: PublicKey,
  deployment: VaultDeployment,
): Promise<VaultAccount> {
  requireDeployment(deployment);
  if (verifiedDeployments.get(deployment)?.connection !== connection)
    throw new Error("RPC differs from deployment attestation");
  const raw = await connection.getAccountInfo(vault, "confirmed");
  if (!raw || raw.executable || !raw.owner.equals(new PublicKey(deployment.programId)))
    throw new Error("Vault program owner mismatch");
  const state = decodeVault(raw.data);
  const derived = deriveVault(
    new PublicKey(deployment.programId),
    state.owner,
    state.mint,
    state.vaultId,
  );
  if (!vault.equals(derived.vault) || state.bump !== derived.bump)
    throw new Error("Vault PDA mismatch");
  const [mint, escrow, destination] = await connection.getMultipleAccountsInfo(
    [state.mint, derived.escrow, state.destination],
    "confirmed",
  );
  if (
    !mint ||
    !mint.owner.equals(TOKEN_PROGRAM_ID) ||
    mint.data.length !== 82 ||
    mint.data[44] !== state.decimals ||
    mint.data[45] !== 1
  )
    throw new Error("Classic mint/decimals mismatch");
  const checkToken = (a: typeof escrow, authority: PublicKey) => {
    if (
      !a ||
      !a.owner.equals(TOKEN_PROGRAM_ID) ||
      a.data.length !== 165 ||
      a.data[108] !== 1 ||
      !new PublicKey(a.data.subarray(0, 32)).equals(state.mint) ||
      !new PublicKey(a.data.subarray(32, 64)).equals(authority)
    )
      throw new Error("Token account authority/mint/state mismatch");
  };
  checkToken(escrow, vault);
  checkToken(destination, state.destinationOwner);
  if (!deriveTokenAccount(state.destinationOwner, state.mint).equals(state.destination))
    throw new Error("Destination ATA mismatch");
  return state;
}