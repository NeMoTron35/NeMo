import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  VersionedTransaction,
  type Commitment,
  type TransactionSignature,
} from "@solana/web3.js";
import {
  ActivationType,
  BaseFeeMode,
  CollectFeeMode,
  DynamicBondingCurveClient,
  MigrationFeeOption,
  MigrationOption,
  TokenAuthorityOption,
  TokenDecimal,
  TokenType,
  buildCurveWithMarketCap,
  deriveDbcPoolAddress,
} from "@meteora-ag/dynamic-bonding-curve-sdk";
import { DBC_PROGRAM_ID } from "./dbc";

export const WSOL_MINT = "So11111111111111111111111111111111111111112";
export const GENESIS = {
  "mainnet-beta": "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d",
  devnet: "EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG",
} as const;
export type LaunchNetwork = keyof typeof GENESIS | "localnet";
/**
 * Mainnet is no longer unconditionally locked. It is gated per launch by: genesis
 * check, program allowlist, exact signer set, wallet-as-authority checks, a
 * pre-wallet simulation, a cost ceiling and a separate mainnet acknowledgment in the UI.
 */
/**
 * Preflight threshold, not an on-chain cap: the build is refused when the simulated wallet
 * balance change (or, if the RPC cannot report it, the fee + rough rent estimate) exceeds it.
 */
export const MAINNET_MAX_COST_LAMPORTS = 100_000_000; // 0.1 SOL
/** Programs the createConfigAndPool transaction may invoke; anything else refuses the launch. */
export const ALLOWED_PROGRAMS = new Set([
  DBC_PROGRAM_ID,
  "11111111111111111111111111111111",
  "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
  "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb",
  "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL",
  "metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s",
  "ComputeBudget111111111111111111111111111111",
]);

export type LaunchForm = {
  name: string;
  symbol: string;
  uri: string;
  decimals: 6 | 9;
  totalSupply: number;
  initialMarketCap: number;
  migrationMarketCap: number;
  feeBps: number;
  firstBuyLamports: number;
  creatorFeePercent?: number;
  liquidity?: { partner: number; creator: number; partnerLocked: number; creatorLocked: number };
};

export type LaunchStatus =
  | "idle"
  | "building"
  | "review"
  | "awaiting-wallet"
  | "submitted"
  | "confirmed"
  | "failed"
  | "expired";

const SYMBOL = /^[A-Z0-9]{1,10}$/;
/** Returns actionable errors; an empty array means the SDK-backed path supports the form. */
export function validateLaunchForm(f: LaunchForm, network: LaunchNetwork): string[] {
  const e: string[] = [];
  if (!f.name.trim() || new TextEncoder().encode(f.name).length > 32)
    e.push("Name must be 1–32 bytes.");
  if (!SYMBOL.test(f.symbol)) e.push("Symbol must be 1–10 uppercase letters or digits.");
  try {
    const u = new URL(f.uri);
    if (u.protocol !== "https:") e.push("Metadata URI must use https.");
    if (f.uri.length > 200) e.push("Metadata URI must be 200 characters or fewer.");
  } catch {
    e.push("Metadata URI must be an absolute https URL to a JSON file.");
  }
  if (!Number.isInteger(f.totalSupply) || f.totalSupply < 1_000 || f.totalSupply > 1e12)
    e.push("Total supply must be a whole number between 1,000 and 1,000,000,000,000.");
  if (!(f.initialMarketCap > 0) || !(f.migrationMarketCap > f.initialMarketCap))
    e.push("Migration market cap must be greater than a positive initial market cap.");
  if (!Number.isInteger(f.feeBps) || f.feeBps < 25 || f.feeBps > 9900)
    e.push("Trading fee must be 25–9900 bps.");
  const cf = f.creatorFeePercent ?? 0;
  if (!Number.isInteger(cf) || cf < 0 || cf > 100) e.push("Creator fee share must be 0–100%.");
  if (f.firstBuyLamports !== 0)
    e.push("First buy is not yet supported by this console. Set it to 0.");
  void network; // network-specific gates run in buildLaunch against the live RPC
  return e;
}

/** Fetches metadata JSON and checks name/symbol/image fields. */
export async function verifyMetadata(
  uri: string,
  form: Pick<LaunchForm, "name" | "symbol">,
  fetcher: typeof fetch = fetch,
) {
  const res = await fetcher(uri, { headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`Metadata URI returned HTTP ${res.status}.`);
  const json = (await res.json()) as Record<string, unknown>;
  if (json["name"] !== form.name) throw new Error("Metadata name does not match the launch name.");
  if (json["symbol"] !== form.symbol)
    throw new Error("Metadata symbol does not match the launch symbol.");
  if (typeof json["image"] !== "string" || !/^https:\/\//.test(json["image"]))
    throw new Error("Metadata must include an https image URL.");
  return json;
}

export function curveConfig(f: LaunchForm) {
  return buildCurveWithMarketCap({
    token: {
      tokenType: TokenType.SPLToken,
      tokenBaseDecimal: f.decimals === 9 ? TokenDecimal.NINE : TokenDecimal.SIX,
      tokenQuoteDecimal: 9,
      tokenAuthorityOption: TokenAuthorityOption.Immutable,
      totalTokenSupply: f.totalSupply,
      leftover: 0,
    },
    fee: {
      baseFeeParams: {
        baseFeeMode: BaseFeeMode.FeeSchedulerLinear,
        feeSchedulerParam: {
          startingFeeBps: f.feeBps,
          endingFeeBps: f.feeBps,
          numberOfPeriod: 0,
          totalDuration: 0,
        },
      },
      dynamicFeeEnabled: true,
      collectFeeMode: CollectFeeMode.QuoteToken,
      creatorTradingFeePercentage: f.creatorFeePercent ?? 0,
      poolCreationFee: 0,
      enableFirstSwapWithMinFee: false,
    },
    migration: {
      migrationOption: MigrationOption.MET_DAMM_V2,
      migrationFeeOption: MigrationFeeOption.FixedBps100,
      migrationFee: { feePercentage: 0, creatorFeePercentage: 0 },
    },
    liquidityDistribution: {
      partnerPermanentLockedLiquidityPercentage: f.liquidity?.partnerLocked ?? 0,
      partnerLiquidityPercentage: f.liquidity?.partner ?? 0,
      creatorPermanentLockedLiquidityPercentage: f.liquidity?.creatorLocked ?? 100,
      creatorLiquidityPercentage: f.liquidity?.creator ?? 0,
    },
    lockedVesting: {
      totalLockedVestingAmount: 0,
      numberOfVestingPeriod: 0,
      cliffUnlockAmount: 0,
      totalVestingDuration: 0,
      cliffDurationFromMigrationTime: 0,
    },
    activationType: ActivationType.Timestamp,
    initialMarketCap: f.initialMarketCap,
    migrationMarketCap: f.migrationMarketCap,
  });
}

export type BuiltLaunch = {
  transaction: Transaction;
  reviewedMessage: Uint8Array;
  lastValidBlockHeight: number;
  config: string;
  baseMint: string;
  pool: string;
  requiredSigners: string[];
  programIds: string[];
  feeLamports: number;
  rentLamports: number;
  balanceLamports: number;
  simulatedUnits: number;
  /** Wallet balance change in simulation plus fee; null when the RPC did not report it. */
  simulatedSpendLamports: number | null;
};

/**
 * Builds the single createConfigAndPool transaction. The connected wallet is
 * payer, fee claimer, leftover receiver and pool creator; no third party gains
 * authority. Config and mint keypairs are generated here, sign locally, and are
 * dropped after this call — they authorize nothing further on chain.
 */
export async function buildLaunch(
  connection: Connection,
  network: LaunchNetwork,
  wallet: PublicKey,
  form: LaunchForm,
  commitment: Commitment = "confirmed",
): Promise<BuiltLaunch> {
  const problems = validateLaunchForm(form, network);
  if (problems.length) throw new Error(problems[0]);
  if (network !== "localnet" && (await connection.getGenesisHash()) !== GENESIS[network])
    throw new Error("RPC network differs from the selected network.");
  const program = new PublicKey(DBC_PROGRAM_ID);
  const programAccount = await connection.getAccountInfo(program, commitment);
  if (!programAccount?.executable)
    throw new Error("Meteora DBC program is not deployed on this network.");
  const quote = await connection.getAccountInfo(new PublicKey(WSOL_MINT), commitment);
  if (!quote) throw new Error("Quote mint (wrapped SOL) not found on this network.");
  const client = new DynamicBondingCurveClient(connection, commitment);
  const configKp = Keypair.generate();
  const mintKp = Keypair.generate();
  const params = curveConfig(form);
  const tx = await client.partner.createConfigAndPool({
    ...params,
    config: configKp.publicKey,
    feeClaimer: wallet,
    leftoverReceiver: wallet,
    quoteMint: new PublicKey(WSOL_MINT),
    payer: wallet,
    preCreatePoolParam: {
      name: form.name,
      symbol: form.symbol,
      uri: form.uri,
      poolCreator: wallet,
      baseMint: mintKp.publicKey,
    },
  });
  const block = await connection.getLatestBlockhash(commitment);
  tx.feePayer = wallet;
  tx.recentBlockhash = block.blockhash;
  const message = tx.compileMessage();
  const requiredSigners = message.accountKeys
    .slice(0, message.header.numRequiredSignatures)
    .map((k) => k.toBase58());
  const expected = new Set([
    wallet.toBase58(),
    configKp.publicKey.toBase58(),
    mintKp.publicKey.toBase58(),
  ]);
  if (requiredSigners.length !== 3 || !requiredSigners.every((s) => expected.has(s)))
    throw new Error("Unexpected signer set in the SDK transaction. Launch refused.");
  const programIds = [...new Set(tx.instructions.map((i) => i.programId.toBase58()))];
  const foreign = programIds.filter((p) => !ALLOWED_PROGRAMS.has(p));
  if (foreign.length)
    throw new Error(`Unexpected program in the SDK transaction (${foreign[0]}). Launch refused.`);
  if (!programIds.includes(DBC_PROGRAM_ID))
    throw new Error("Transaction does not invoke the Meteora DBC program.");
  tx.partialSign(configKp, mintKp);
  const fee = (await connection.getFeeForMessage(message, commitment)).value ?? 5000 * 3;
  // Rough heuristic only (five ~1.2 KB accounts). Not a bound: actual rent depends on SDK account sizes.
  const rentLamports = (await connection.getMinimumBalanceForRentExemption(1200)) * 5;
  const balanceLamports = await connection.getBalance(wallet, commitment);
  if (balanceLamports < fee + rentLamports)
    throw new Error(
      `Insufficient SOL: roughly ${((fee + rentLamports) / 1e9).toFixed(4)} SOL is estimated for fees and rent.`,
    );
  // Simulate before any wallet prompt. The payer signature is absent, so sigVerify is off;
  // the reviewed blockhash is kept so simulation matches the bytes the wallet will sign.
  const sim = await connection.simulateTransaction(new VersionedTransaction(message), {
    sigVerify: false,
    replaceRecentBlockhash: false,
    commitment,
    accounts: { addresses: [wallet.toBase58()], encoding: "base64" },
  });
  if (sim.value.err) {
    const tail = (sim.value.logs ?? []).slice(-3).join(" | ").slice(0, 300);
    throw new Error(
      `Simulation failed before wallet prompt: ${JSON.stringify(sim.value.err)}${tail ? ` — ${tail}` : ""}`,
    );
  }
  const simulatedUnits = sim.value.unitsConsumed ?? 0;
  const post = sim.value.accounts?.[0]?.lamports;
  // Simulated spend excludes the network fee, so add it back.
  const simulatedSpendLamports =
    typeof post === "number" ? Math.max(0, balanceLamports - post) + fee : null;
  const checkedSpend = simulatedSpendLamports ?? fee + rentLamports;
  if (network === "mainnet-beta" && checkedSpend > MAINNET_MAX_COST_LAMPORTS)
    throw new Error(
      `Preflight spend (${(checkedSpend / 1e9).toFixed(4)} SOL) exceeds the 0.1 SOL mainnet threshold. Launch refused.`,
    );
  if (params.tokenUpdateAuthority !== TokenAuthorityOption.Immutable)
    throw new Error("Unexpected token authority option in the SDK config. Launch refused.");
  return {
    transaction: tx,
    reviewedMessage: new Uint8Array(tx.serializeMessage()),
    lastValidBlockHeight: block.lastValidBlockHeight,
    config: configKp.publicKey.toBase58(),
    baseMint: mintKp.publicKey.toBase58(),
    pool: deriveDbcPoolAddress(
      new PublicKey(WSOL_MINT),
      mintKp.publicKey,
      configKp.publicKey,
    ).toBase58(),
    requiredSigners,
    programIds,
    feeLamports: fee,
    rentLamports,
    balanceLamports,
    simulatedUnits,
    simulatedSpendLamports,
  };
}

/** Sends wallet-signed bytes once, with preflight, then confirms against the reviewed blockhash. */
export async function submitAndConfirm(
  connection: Connection,
  signed: Uint8Array,
  built: Pick<BuiltLaunch, "transaction" | "lastValidBlockHeight" | "pool" | "config">,
  onSubmitted: (sig: TransactionSignature) => void,
  commitment: Commitment = "confirmed",
) {
  const sig = await connection.sendRawTransaction(signed, {
    skipPreflight: false,
    preflightCommitment: commitment,
    maxRetries: 3,
  });
  onSubmitted(sig);
  const res = await connection.confirmTransaction(
    {
      signature: sig,
      blockhash: built.transaction.recentBlockhash!,
      lastValidBlockHeight: built.lastValidBlockHeight,
    },
    commitment,
  );
  if (res.value.err)
    throw new Error(`Transaction failed on chain: ${JSON.stringify(res.value.err)}`);
  const program = new PublicKey(DBC_PROGRAM_ID);
  const [pool, config] = await connection.getMultipleAccountsInfo(
    [new PublicKey(built.pool), new PublicKey(built.config)],
    commitment,
  );
  if (!pool?.owner.equals(program) || !config?.owner.equals(program))
    throw new Error("Confirmed, but pool/config accounts are not owned by the DBC program.");
  return sig;
}

const METAPLEX = new PublicKey("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s");
/** Parses update authority and isMutable from a Metaplex metadata account. */
export function parseMetadataAuthority(data: Uint8Array) {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const updateAuthority = new PublicKey(data.slice(1, 33)).toBase58();
  let o = 65;
  for (let i = 0; i < 3; i++) o += 4 + view.getUint32(o, true);
  o += 2;
  if (data[o++] === 1) o += 4 + view.getUint32(o, true) * 34;
  o += 1; // primary sale happened
  return { updateAuthority, isMutable: data[o] === 1 };
}

export type LaunchedAuthority = {
  feeClaimer: string;
  leftoverReceiver: string;
  creator: string;
  tokenUpdateAuthorityOption: number;
  metadataUpdateAuthority: string;
  metadataMutable: boolean;
};
/** Reads the confirmed config, pool and metadata accounts and refuses any unexpected authority. */
export async function verifyLaunchedAuthority(
  connection: Connection,
  built: Pick<BuiltLaunch, "pool" | "config" | "baseMint">,
  wallet: PublicKey,
): Promise<LaunchedAuthority> {
  const client = new DynamicBondingCurveClient(connection, "confirmed");
  const [cfg, pool] = await Promise.all([
    client.state.getPoolConfig(built.config),
    client.state.getPool(built.pool),
  ]);
  if (!cfg || !pool) throw new Error("Confirmed, but config or pool state could not be read.");
  const mint = new PublicKey(built.baseMint);
  const [mdPda] = PublicKey.findProgramAddressSync(
    [new TextEncoder().encode("metadata"), METAPLEX.toBytes(), mint.toBytes()],
    METAPLEX,
  );
  const md = await connection.getAccountInfo(mdPda, "confirmed");
  if (!md?.owner.equals(METAPLEX)) throw new Error("Confirmed, but token metadata was not found.");
  const meta = parseMetadataAuthority(md.data);
  const out: LaunchedAuthority = {
    feeClaimer: cfg.feeClaimer.toBase58(),
    leftoverReceiver: cfg.leftoverReceiver.toBase58(),
    creator: (pool as unknown as { creator: PublicKey }).creator.toBase58(),
    tokenUpdateAuthorityOption: cfg.tokenUpdateAuthority,
    metadataUpdateAuthority: meta.updateAuthority,
    metadataMutable: meta.isMutable,
  };
  const w = wallet.toBase58();
  if (out.feeClaimer !== w || out.leftoverReceiver !== w || out.creator !== w)
    throw new Error("Confirmed, but fee claimer, leftover receiver or creator is not your wallet.");
  if (out.tokenUpdateAuthorityOption !== TokenAuthorityOption.Immutable)
    throw new Error("Confirmed, but the config's token authority option is not immutable.");
  return out;
}

/**
 * Recovery for a sent launch: rebroadcasts the identical signed bytes (same signature,
 * so it cannot create a second launch) and reports the current on-chain status.
 */
export async function recheckLaunch(
  connection: Connection,
  sig: string,
  signed: Uint8Array | null,
  built: Pick<BuiltLaunch, "lastValidBlockHeight" | "pool" | "config">,
): Promise<"confirmed" | "failed" | "pending" | "expired"> {
  const st = (await connection.getSignatureStatuses([sig], { searchTransactionHistory: true }))
    .value[0];
  if (st?.err) return "failed";
  if (st?.confirmationStatus === "confirmed" || st?.confirmationStatus === "finalized") {
    const program = new PublicKey(DBC_PROGRAM_ID);
    const [pool, config] = await connection.getMultipleAccountsInfo([
      new PublicKey(built.pool),
      new PublicKey(built.config),
    ]);
    return pool?.owner.equals(program) && config?.owner.equals(program) ? "confirmed" : "failed";
  }
  const height = await connection.getBlockHeight("confirmed");
  if (height > built.lastValidBlockHeight) return "expired";
  if (signed) await connection.sendRawTransaction(signed, { skipPreflight: true, maxRetries: 0 });
  return "pending";
}

export function explorerTx(sig: string, network: LaunchNetwork) {
  const c =
    network === "devnet" ? "?cluster=devnet" : network === "localnet" ? "?cluster=custom" : "";
  return `https://solscan.io/tx/${sig}${c}`;
}
export function explorerAccount(addr: string, network: LaunchNetwork) {
  const c = network === "devnet" ? "?cluster=devnet" : "";
  return `https://solscan.io/account/${new PublicKey(addr).toBase58()}${c}`;
}
