// Hook Forge v2.1 — devnet-only transaction builders and read-only diagnostics for the research
// QuantumQLi transfer hook (programs/quantum_transfer_hook). Browser-safe. Builders return unsigned
// transactions for the existing reviewed wallet flow (wallet.ts signReviewedTransaction); nothing
// here signs with a wallet, stores keys or sends. Mainnet is refused everywhere.
import "./buffer-global";
import {
  DEVNET_GENESIS,
  KNOWN_HOOK_BUILDS,
  MAX_ALLOW,
  validatePolicy,
  type Policy,
} from "./hook-devnet-core";
export * from "./hook-devnet-core";
import { Buffer } from "buffer";
import {
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
  VersionedTransaction,
  type Connection,
} from "@solana/web3.js";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  ExtensionType,
  TOKEN_2022_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
  createInitializeMint2Instruction,
  createInitializeTransferHookInstruction,
  createMintToCheckedInstruction,
  createTransferCheckedWithTransferHookInstruction,
  getAssociatedTokenAddressSync,
  getExtraAccountMetaAddress,
  getMintLen,
  getTransferHook,
  unpackMint,
} from "@solana/spl-token";

export const BPF_UPGRADEABLE_LOADER = "BPFLoaderUpgradeab1e11111111111111111111111";
export const TOKEN_2022 = TOKEN_2022_PROGRAM_ID.toBase58();

// Mirrors programs/quantum_transfer_hook/src/lib.rs exactly.
export const IX_INIT = new TextEncoder().encode("qlihk:in");
export const IX_SET = new TextEncoder().encode("qlihk:sp");
/** v2.2 mint-signer bootstrap for PDA-held TransferHook authorities (Meteora DBC). */
export const IX_INIT_DBC = new TextEncoder().encode("qlihk:db");
/**
 * Code fingerprint = SHA-256 of the program bytes with trailing zero padding removed (ProgramData
 * after its 45-byte header, or the .so file). Only builds listed here are labelled QLi code;
 * anything else is UNKNOWN THIRD-PARTY code unless the owner enters their own reviewed build hash.
 */
export async function codeFingerprint(bytes: Uint8Array): Promise<string> {
  let end = bytes.length;
  while (end > 0 && bytes[end - 1] === 0) end--;
  const d = await crypto.subtle.digest("SHA-256", bytes.slice(0, end));
  return Array.from(new Uint8Array(d), (b) => b.toString(16).padStart(2, "0")).join("");
}
export type Provenance = "known-qli-build" | "owner-reviewed-build" | "unknown-third-party";
/** Writes (mint/pool init) require known or owner-reviewed provenance. */
export function provenanceOf(fingerprint: string | null, expected: string): Provenance {
  const e = expected.trim().toLowerCase();
  if (!fingerprint) return "unknown-third-party";
  if (KNOWN_HOOK_BUILDS.some((b) => b.fingerprint === fingerprint)) return "known-qli-build";
  if (/^[0-9a-f]{64}$/.test(e) && e === fingerprint) return "owner-reviewed-build";
  return "unknown-third-party";
}
export const CONFIG_SEED = "qli-hook-config";
export const CONFIG_TAG = "QLIHOOK1";
export const CONFIG_LEN = 8 + 4 + 32 + 32 + 1 + 32 * MAX_ALLOW; // 333
export const HOOK_ERRORS: Record<number, string> = {
  0x5100: "Paused",
  0x5101: "ReceiverNotAllowed",
  0x5102: "NotTransferring",
  0x5103: "BadSourceAccount",
  0x5104: "BadDestinationAccount",
  0x5105: "BadMint",
  0x5106: "BadConfig",
  0x5107: "BadExtraMetas",
  0x5108: "Unauthorized",
  0x5109: "BadPolicy",
  0x510a: "UnsupportedInstruction",
};

/** Policy wire format: paused u8, allowlist u8, count u8, count * 32 bytes. */
export function encodePolicy(p: Policy): Uint8Array {
  const err = validatePolicy(p);
  if (err) throw new Error(err);
  const out = new Uint8Array(3 + 32 * p.allowed.length);
  out[0] = p.paused ? 1 : 0;
  out[1] = p.allowlist ? 1 : 0;
  out[2] = p.allowed.length;
  p.allowed.forEach((a, i) => out.set(new PublicKey(a).toBytes(), 3 + 32 * i));
  return out;
}
const concat = (a: Uint8Array, b: Uint8Array) => {
  const o = new Uint8Array(a.length + b.length);
  o.set(a);
  o.set(b, a.length);
  return o;
};

export type HookConfig = {
  version: number;
  bump: number;
  authority: string;
  mint: string;
  policy: Policy;
};
export function decodeConfig(d: Uint8Array): HookConfig | null {
  if (d.length !== CONFIG_LEN) return null;
  if (new TextDecoder().decode(d.slice(0, 8)) !== CONFIG_TAG || d[8] !== 1) return null;
  if (d[10]! > 1 || d[11]! > 1 || d[76]! > MAX_ALLOW) return null;
  const n = d[76]!;
  const key = (o: number) => new PublicKey(d.slice(o, o + 32)).toBase58();
  return {
    version: 1,
    bump: d[9]!,
    authority: key(12),
    mint: key(44),
    policy: {
      paused: d[10] === 1,
      allowlist: d[11] === 1,
      allowed: Array.from({ length: n }, (_, i) => key(77 + 32 * i)),
    },
  };
}

export function deriveHookAccounts(mint: PublicKey, hook: PublicKey) {
  return {
    config: PublicKey.findProgramAddressSync(
      [new TextEncoder().encode(CONFIG_SEED), mint.toBytes()],
      hook,
    )[0],
    extraMetas: getExtraAccountMetaAddress(mint, hook),
  };
}

export function initInstruction(
  hook: PublicKey,
  authority: PublicKey,
  mint: PublicKey,
  p: Policy,
): TransactionInstruction {
  const { config, extraMetas } = deriveHookAccounts(mint, hook);
  return new TransactionInstruction({
    programId: hook,
    keys: [
      { pubkey: authority, isSigner: true, isWritable: true },
      { pubkey: config, isSigner: false, isWritable: true },
      { pubkey: mint, isSigner: false, isWritable: false },
      { pubkey: extraMetas, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: Buffer.from(concat(IX_INIT, encodePolicy(p))),
  });
}

/** `qlihk:db`: mint keypair AND policy-authority wallet both sign; initial policy is fixed open. */
export function dbcInitInstruction(
  hook: PublicKey,
  authority: PublicKey,
  mint: PublicKey,
): TransactionInstruction {
  const { config, extraMetas } = deriveHookAccounts(mint, hook);
  return new TransactionInstruction({
    programId: hook,
    keys: [
      { pubkey: authority, isSigner: true, isWritable: true },
      { pubkey: config, isSigner: false, isWritable: true },
      { pubkey: mint, isSigner: true, isWritable: false },
      { pubkey: extraMetas, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: Buffer.from(
      concat(IX_INIT_DBC, encodePolicy({ paused: false, allowlist: false, allowed: [] })),
    ),
  });
}

export function setPolicyInstruction(
  hook: PublicKey,
  authority: PublicKey,
  mint: PublicKey,
  p: Policy,
): TransactionInstruction {
  const { config } = deriveHookAccounts(mint, hook);
  return new TransactionInstruction({
    programId: hook,
    keys: [
      { pubkey: authority, isSigner: true, isWritable: false },
      { pubkey: config, isSigner: false, isWritable: true },
      { pubkey: mint, isSigner: false, isWritable: false },
    ],
    data: Buffer.from(concat(IX_SET, encodePolicy(p))),
  });
}

// ---------- read-only diagnostics ----------

export type Check = { ok: boolean | null; label: string; detail: string; source?: string };
export type ProgramStatus = {
  slot: number;
  executable: boolean;
  loader: string | null;
  upgradeAuthority: string | null | "immutable";
  programDataAddress?: string;
  programDataSlot: number | null;
  /** SHA-256 of ProgramData program bytes, trailing zero padding removed. */
  codeFingerprint: string | null;
  checks: Check[];
};

export async function assertDevnet(conn: Connection) {
  const g = await conn.getGenesisHash();
  if (g !== DEVNET_GENESIS)
    throw new Error("RPC is not Solana devnet (genesis mismatch). Mainnet is refused here.");
}

export async function inspectProgram(conn: Connection, programId: PublicKey) {
  await assertDevnet(conn);
  const r = await conn.getAccountInfoAndContext(programId, "confirmed");
  const a = r.value;
  const out: ProgramStatus = {
    slot: r.context.slot,
    executable: false,
    loader: a?.owner.toBase58() ?? null,
    upgradeAuthority: null,
    programDataSlot: null,
    codeFingerprint: null,
    checks: [],
  };
  if (!a) {
    out.checks.push({
      ok: false,
      label: "Program account",
      detail: "No account at this address on devnet. Program deployment required.",
    });
    return out;
  }
  out.executable = a.executable;
  out.checks.push({
    ok: a.executable,
    label: "Executable",
    detail: a.executable ? "Account is executable." : "Account exists but is not executable.",
    source: `getAccountInfo @ slot ${r.context.slot}`,
  });
  const upgradeable = a.owner.toBase58() === BPF_UPGRADEABLE_LOADER;
  out.checks.push({
    ok: upgradeable,
    label: "Loader",
    detail: upgradeable ? "BPF Upgradeable Loader." : `Unexpected loader ${a.owner.toBase58()}.`,
  });
  if (upgradeable && a.data.length === 36 && Buffer.from(a.data).readUInt32LE(0) === 2) {
    const pd = new PublicKey(a.data.subarray(4, 36));
    const canonical = PublicKey.findProgramAddressSync(
      [programId.toBuffer()],
      new PublicKey(BPF_UPGRADEABLE_LOADER),
    )[0];
    const pdAccount = await conn.getAccountInfo(pd, "confirmed");
    const p = pdAccount?.data;
    if (
      pd.equals(canonical) &&
      pdAccount?.owner?.toBase58() === BPF_UPGRADEABLE_LOADER &&
      !pdAccount.executable &&
      p &&
      p.length > 45 &&
      Buffer.from(p).readUInt32LE(0) === 3 &&
      (p[12] === 0 || p[12] === 1)
    ) {
      out.programDataAddress = pd.toBase58();
      out.programDataSlot = Number(Buffer.from(p).readBigUInt64LE(4));
      out.codeFingerprint = await codeFingerprint(new Uint8Array(p.subarray(45)));
      const known = KNOWN_HOOK_BUILDS.find((b) => b.fingerprint === out.codeFingerprint);
      out.checks.push({
        ok: known ? true : null,
        label: "Code fingerprint",
        detail: known
          ? `${out.codeFingerprint} matches ${known.label}.`
          : `${out.codeFingerprint} is not a listed QLi build: UNKNOWN THIRD-PARTY code unless it equals your own reviewed build hash.`,
        source: `ProgramData ${pd.toBase58()}`,
      });
      out.upgradeAuthority =
        p[12] === 1 ? new PublicKey(p.subarray(13, 45)).toBase58() : "immutable";
      out.checks.push({
        ok: null,
        label: "Upgrade authority",
        detail:
          out.upgradeAuthority === "immutable"
            ? "Immutable (no upgrade authority)."
            : `${out.upgradeAuthority} can replace this code at any time.`,
        source: `ProgramData ${pd.toBase58()}`,
      });
    } else
      out.checks.push({
        ok: false,
        label: "ProgramData",
        detail: "ProgramData account unreadable.",
      });
  }
  return out;
}

export type MintStatus = {
  slot: number;
  exists: boolean;
  token2022: boolean;
  decimals: number | null;
  mintAuthority: string | null;
  hookProgram: string | null;
  hookAuthority: string | null;
  extraMetasOwned: boolean;
  config: HookConfig | null;
  checks: Check[];
};

export async function inspectMint(conn: Connection, mint: PublicKey, hook: PublicKey) {
  await assertDevnet(conn);
  const { config, extraMetas } = deriveHookAccounts(mint, hook);
  const r = await conn.getMultipleAccountsInfoAndContext([mint, extraMetas, config], "confirmed");
  const [m, x, c] = r.value;
  const out: MintStatus = {
    slot: r.context.slot,
    exists: !!m,
    token2022: m?.owner.equals(TOKEN_2022_PROGRAM_ID) ?? false,
    decimals: null,
    mintAuthority: null,
    hookProgram: null,
    hookAuthority: null,
    extraMetasOwned: !!x && x.owner.equals(hook),
    config: null,
    checks: [],
  };
  const src = `getMultipleAccounts @ slot ${r.context.slot}`;
  if (!m || !out.token2022) {
    out.checks.push({
      ok: false,
      label: "Token-2022 mint",
      detail: m ? "Mint is not owned by Token-2022." : "Mint not found on devnet.",
      source: src,
    });
    return out;
  }
  try {
    const parsed = unpackMint(mint, m, TOKEN_2022_PROGRAM_ID);
    out.decimals = parsed.decimals;
    out.mintAuthority = parsed.mintAuthority?.toBase58() ?? null;
    const th = getTransferHook(parsed);
    out.hookProgram = th?.programId.toBase58() ?? null;
    out.hookAuthority = th?.authority.toBase58() ?? null;
  } catch {
    out.checks.push({ ok: false, label: "Mint decode", detail: "Mint data did not decode." });
    return out;
  }
  out.checks.push({
    ok: out.hookProgram === hook.toBase58(),
    label: "TransferHook extension",
    detail: out.hookProgram
      ? out.hookProgram === hook.toBase58()
        ? "Mint points at this hook program."
        : `Mint points at a different program ${out.hookProgram}.`
      : "No TransferHook program set on this mint.",
    source: src,
  });
  out.checks.push({
    ok: out.extraMetasOwned,
    label: "ExtraAccountMetaList",
    detail: x
      ? out.extraMetasOwned
        ? `${extraMetas.toBase58()} owned by hook.`
        : "Exists but not owned by the hook."
      : "Not initialized.",
    source: src,
  });
  out.config = c && c.owner.equals(hook) ? decodeConfig(new Uint8Array(c.data)) : null;
  out.checks.push({
    ok: !!out.config && out.config.mint === mint.toBase58(),
    label: "Policy config",
    detail: out.config
      ? `paused=${out.config.policy.paused} allowlist=${out.config.policy.allowlist} (${out.config.policy.allowed.length}) authority ${out.config.authority}`
      : c
        ? "Config account present but not a valid QLi config owned by the hook."
        : "Not initialized.",
    source: src,
  });
  return out;
}

// ---------- builders (unsigned; reviewed wallet flow signs) ----------

export type Built = {
  kind:
    | "create-mint"
    | "set-policy"
    | "transfer"
    | "dbc-config"
    | "dbc-pool"
    | "dbc-swap"
    | "dbc-migrate";
  transaction: Transaction;
  reviewedMessage: Uint8Array;
  lastValidBlockHeight: number;
  summary: string[];
  estimatedLamports: number;
  /** Public key of an in-memory one-time mint keypair, already partial-signed. Secret discarded. */
  ephemeralSigner?: string | undefined;
  /** Public addresses created by this transaction (config, pool, mint) for follow-up steps. */
  artifacts?: { config?: string; pool?: string; mint?: string } | undefined;
};

/** New writes require the on-chain code to be a listed QLi build or the owner's reviewed build. */
export function assertReviewedCode(prog: ProgramStatus, expected: string) {
  if (provenanceOf(prog.codeFingerprint, expected) === "unknown-third-party")
    throw new Error(
      "UNKNOWN THIRD-PARTY code: the program's code fingerprint is not a listed QLi build and does not equal the reviewed build hash you entered. Writes refused.",
    );
}

async function finalize(
  conn: Connection,
  payer: PublicKey,
  ixs: TransactionInstruction[],
  kind: Built["kind"],
  summary: string[],
  extraLamports: number,
  signer?: Keypair,
): Promise<Built> {
  const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash("confirmed");
  const tx = new Transaction({ feePayer: payer, blockhash, lastValidBlockHeight }).add(...ixs);
  if (signer) tx.partialSign(signer);
  const fee = (await conn.getFeeForMessage(tx.compileMessage(), "confirmed")).value ?? 5000;
  return {
    kind,
    transaction: tx,
    reviewedMessage: new Uint8Array(tx.serializeMessage()),
    lastValidBlockHeight,
    summary,
    estimatedLamports: fee + extraLamports,
    ephemeralSigner: signer?.publicKey.toBase58(),
  };
}

/** One transaction: create Token-2022 mint with TransferHook → this hook, init hook policy +
 *  ExtraAccountMetaList, create wallet ATA and mint test supply. The wallet is mint authority,
 *  TransferHook authority and policy authority. Requires an executable hook program. */
export async function buildCreateMint(
  conn: Connection,
  payer: PublicKey,
  hook: PublicKey,
  opts: { decimals: number; supply: bigint; policy: Policy; expectedFingerprint?: string },
): Promise<Built> {
  await assertDevnet(conn);
  const prog = await inspectProgram(conn, hook);
  if (!prog.executable)
    throw new Error("Program deployment required: hook is not executable on devnet.");
  assertReviewedCode(prog, opts.expectedFingerprint ?? "");
  if (!Number.isInteger(opts.decimals) || opts.decimals < 0 || opts.decimals > 9)
    throw new Error("Decimals must be 0–9.");
  if (opts.supply <= 0n || opts.supply > 10n ** 18n) throw new Error("Supply out of range.");
  const mintKp = Keypair.generate();
  const mint = mintKp.publicKey;
  const len = getMintLen([ExtensionType.TransferHook]);
  const mintRent = await conn.getMinimumBalanceForRentExemption(len);
  const ata = getAssociatedTokenAddressSync(mint, payer, false, TOKEN_2022_PROGRAM_ID);
  const { config, extraMetas } = deriveHookAccounts(mint, hook);
  const ixs = [
    SystemProgram.createAccount({
      fromPubkey: payer,
      newAccountPubkey: mint,
      lamports: mintRent,
      space: len,
      programId: TOKEN_2022_PROGRAM_ID,
    }),
    createInitializeTransferHookInstruction(mint, payer, hook, TOKEN_2022_PROGRAM_ID),
    createInitializeMint2Instruction(mint, opts.decimals, payer, null, TOKEN_2022_PROGRAM_ID),
    initInstruction(hook, payer, mint, opts.policy),
    createAssociatedTokenAccountIdempotentInstruction(
      payer,
      ata,
      payer,
      mint,
      TOKEN_2022_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID,
    ),
    createMintToCheckedInstruction(
      mint,
      ata,
      payer,
      opts.supply,
      opts.decimals,
      [],
      TOKEN_2022_PROGRAM_ID,
    ),
  ];
  const rentConfig = await conn.getMinimumBalanceForRentExemption(CONFIG_LEN);
  const rentMetas = await conn.getMinimumBalanceForRentExemption(4 + 8 + 4 + 4 + 35); // TLV list, 1 meta
  const rentAta = await conn.getMinimumBalanceForRentExemption(170 + 5);
  return finalize(
    conn,
    payer,
    ixs,
    "create-mint",
    [
      `New Token-2022 mint ${mint.toBase58()} (one-time key, already signed in memory, then discarded).`,
      `TransferHook program ${hook.toBase58()}; mint, hook and policy authority = your wallet.`,
      `Policy config ${config.toBase58()} · ExtraAccountMetaList ${extraMetas.toBase58()}.`,
      `Initial policy: paused=${opts.policy.paused}, allowlist=${opts.policy.allowlist}.`,
      `Mint ${opts.supply} atomic units to your Token-2022 account ${ata.toBase58()} (minting does not run the hook).`,
    ],
    mintRent + rentConfig + rentMetas + rentAta,
    mintKp,
  );
}

export async function buildSetPolicy(
  conn: Connection,
  payer: PublicKey,
  hook: PublicKey,
  mint: PublicKey,
  policy: Policy,
): Promise<Built> {
  const s = await inspectMint(conn, mint, hook);
  if (!s.config) throw new Error("Policy config not initialized for this mint and hook.");
  if (s.config.authority !== payer.toBase58())
    throw new Error(`Connected wallet is not the policy authority (${s.config.authority}).`);
  return finalize(
    conn,
    payer,
    [setPolicyInstruction(hook, payer, mint, policy)],
    "set-policy",
    [
      `Set policy on ${mint.toBase58()}: paused=${policy.paused}, allowlist=${policy.allowlist} (${policy.allowed.length}).`,
      "Only the stored authority can do this; the hook rejects any other signer (0x5108).",
    ],
    0,
  );
}

export async function buildTransfer(
  conn: Connection,
  payer: PublicKey,
  hook: PublicKey,
  mint: PublicKey,
  recipient: PublicKey,
  amount: bigint,
): Promise<Built> {
  const s = await inspectMint(conn, mint, hook);
  if (s.hookProgram !== hook.toBase58() || !s.extraMetasOwned || !s.config || s.decimals === null)
    throw new Error("Mint, hook program, ExtraAccountMetaList and config must all verify first.");
  if (amount <= 0n) throw new Error("Amount must be positive.");
  const src = getAssociatedTokenAddressSync(mint, payer, false, TOKEN_2022_PROGRAM_ID);
  const dst = getAssociatedTokenAddressSync(mint, recipient, true, TOKEN_2022_PROGRAM_ID);
  const transfer = await createTransferCheckedWithTransferHookInstruction(
    conn,
    src,
    mint,
    dst,
    payer,
    amount,
    s.decimals,
    [],
    "confirmed",
    TOKEN_2022_PROGRAM_ID,
  );
  // Extra metas resolved from the on-chain list must be exactly: hook program, metas PDA, config PDA.
  const { config, extraMetas } = deriveHookAccounts(mint, hook);
  const extra = transfer.keys.slice(4).map((k) => k.pubkey.toBase58());
  const want = [config.toBase58(), hook.toBase58(), extraMetas.toBase58()].sort();
  if (JSON.stringify([...extra].sort()) !== JSON.stringify(want))
    throw new Error("Resolved hook accounts differ from the expected program/metas/config set.");
  const ataRent = (await conn.getAccountInfo(dst))
    ? 0
    : await conn.getMinimumBalanceForRentExemption(175);
  return finalize(
    conn,
    payer,
    [
      createAssociatedTokenAccountIdempotentInstruction(
        payer,
        dst,
        recipient,
        mint,
        TOKEN_2022_PROGRAM_ID,
        ASSOCIATED_TOKEN_PROGRAM_ID,
      ),
      transfer,
    ],
    "transfer",
    [
      `transferChecked ${amount} atomic units of ${mint.toBase58()} to ${recipient.toBase58()}.`,
      `Token-2022 calls the hook with resolved accounts: ${extra.join(", ")}.`,
      `Current policy: paused=${s.config.policy.paused}, allowlist=${s.config.policy.allowlist}.`,
    ],
    ataRent,
  );
}

export type SimVerdict = {
  outcome: "allowed" | "hook-denied" | "other-failure";
  hookError: string | null;
  code: number | null;
  logs: string[];
  slot: number;
  note: string;
};

/** Simulation-only verdict (sigVerify off). NEVER evidence of an on-chain failed transaction. */
export async function simulateBuilt(
  conn: Connection,
  b: Built,
  hook: PublicKey,
): Promise<SimVerdict> {
  await assertDevnet(conn);
  const r = await conn.simulateTransaction(
    new VersionedTransaction(b.transaction.compileMessage()),
    {
      sigVerify: false,
      replaceRecentBlockhash: true,
    },
  );
  return classifySimulation(r.value.err, r.value.logs ?? [], r.context.slot, hook.toBase58());
}

export function classifySimulation(
  err: unknown,
  logs: string[],
  slot: number,
  hook: string,
): SimVerdict {
  const base = { logs: logs.slice(-24), slot };
  if (!err)
    return {
      ...base,
      outcome: "allowed",
      hookError: null,
      code: null,
      note: "Simulation succeeded.",
    };
  const custom = (() => {
    const ie = (err as { InstructionError?: [number, unknown] }).InstructionError;
    const c = ie && (ie[1] as { Custom?: number } | undefined)?.Custom;
    return typeof c === "number" ? c : null;
  })();
  const hookFailed = logs.some((l) => l.startsWith(`Program ${hook} failed`));
  if (custom !== null && HOOK_ERRORS[custom] && hookFailed)
    return {
      ...base,
      outcome: "hook-denied",
      hookError: HOOK_ERRORS[custom]!,
      code: custom,
      note: `Simulation only: the hook program refused with 0x${custom.toString(16)} (${HOOK_ERRORS[custom]}). No transaction was sent.`,
    };
  return {
    ...base,
    outcome: "other-failure",
    hookError: null,
    code: custom,
    note: "Simulation failed for a reason not attributed to the hook.",
  };
}
