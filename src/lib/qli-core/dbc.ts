import { DOMAINS } from "./compatibility";
import {
  Connection,
  PublicKey,
  Transaction,
  VersionedTransaction,
  type Commitment,
} from "@solana/web3.js";
import { DynamicBondingCurveClient, MigrationOption } from "@meteora-ag/dynamic-bonding-curve-sdk";
import { rpcSchema } from "./validation";
export const DBC_PROGRAM_ID = "dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN";
export const DEFAULT_MIGRATION = MigrationOption.MET_DAMM_V2;
/** All write services build unsigned transactions only. No send API is exposed. */
export function createDBCServices(rpc: string, commitment: Commitment = "confirmed") {
  const connection = new Connection(rpcSchema.parse(rpc), {
    commitment,
    disableRetryOnRateLimit: true,
  });
  const client = new DynamicBondingCurveClient(connection, commitment);
  async function getPool(address: string) {
    const key = new PublicKey(address);
    const account = await connection.getAccountInfo(key, commitment);
    if (!account) throw new Error("Pool account not found on the selected network.");
    if (!account.owner.equals(new PublicKey(DBC_PROGRAM_ID)))
      throw new Error("Account is not owned by the Meteora DBC program.");
    const pool = await client.state.getPool(key);
    if (!pool) throw new Error("Pool account not found on the selected network.");
    return pool;
  }
  return {
    connection,
    client,
    partner: {
      createConfigAndPoolWithFirstBuy: (
        p: Parameters<typeof client.partner.createConfigAndPoolWithFirstBuy>[0],
      ) =>
        client.partner.createConfigAndPoolWithFirstBuy({
          ...p,
          migrationOption: DEFAULT_MIGRATION,
        }),
      createConfig: (p: Parameters<typeof client.partner.createConfig>[0]) =>
        client.partner.createConfig({ ...p, migrationOption: DEFAULT_MIGRATION }),
      claimFees: (p: Parameters<typeof client.partner.claimPartnerTradingFee>[0]) =>
        client.partner.claimPartnerTradingFee(p),
    },
    creator: {
      createPool: (p: Parameters<typeof client.creator.createPool>[0]) =>
        client.creator.createPool(p),
      createPoolWithFirstBuy: (p: Parameters<typeof client.creator.createPoolWithFirstBuy>[0]) =>
        client.creator.createPoolWithFirstBuy(p),
      createPoolWithPartnerAndCreatorFirstBuy: (
        p: Parameters<typeof client.creator.createPoolWithPartnerAndCreatorFirstBuy>[0],
      ) => client.creator.createPoolWithPartnerAndCreatorFirstBuy(p),
      claimFees: (p: Parameters<typeof client.creator.claimCreatorTradingFee>[0]) =>
        client.creator.claimCreatorTradingFee(p),
    },
    pool: {
      get: getPool,
      swap: (p: Parameters<typeof client.pool.swap>[0]) => client.pool.swap(p),
    },
    migration: {
      toDammV2: (p: Parameters<typeof client.migration.migrateToDammV2>[0]) =>
        client.migration.migrateToDammV2(p),
    },
    state: {
      getPool,
      getConfig: (address: string) => client.state.getPoolConfig(new PublicKey(address)),
      getByBaseMint: (address: string) => client.state.getPoolByBaseMint(new PublicKey(address)),
      getByCreator: (address: string) => client.state.getPoolsByCreator(new PublicKey(address)),
      getByConfig: (address: string) => client.state.getPoolsByConfig(new PublicKey(address)),
      getMigrationThreshold: (address: string) =>
        client.state.getPoolMigrationQuoteThreshold(new PublicKey(address)),
      getProgress: (address: string) =>
        client.state.getPoolQuoteTokenCurveProgress(new PublicKey(address)),
      getFeeMetrics: (address: string) => client.state.getPoolFeeMetrics(new PublicKey(address)),
      getFeeBreakdown: (address: string) =>
        client.state.getPoolFeeBreakdown(new PublicKey(address)),
    },
    async prepare(transaction: Transaction, payer: PublicKey) {
      if (transaction.signatures.some((s) => s.signature))
        throw new Error("Preparation requires an unsigned transaction.");
      const prepared = new Transaction().add(...transaction.instructions);
      const block = await connection.getLatestBlockhash(commitment);
      prepared.feePayer = payer;
      prepared.recentBlockhash = block.blockhash;
      const message = prepared.compileMessage();
      const fee = await connection.getFeeForMessage(message, commitment);
      return {
        transaction: prepared,
        reviewedMessage: new Uint8Array(prepared.serializeMessage()),
        lastValidBlockHeight: block.lastValidBlockHeight,
        accounts: message.accountKeys.map((k) => k.toBase58()),
        requiredSigners: message.accountKeys
          .slice(0, message.header.numRequiredSignatures)
          .map((k) => k.toBase58()),
        feeLamports: fee.value,
      };
    },
    async simulate(transaction: Transaction) {
      const result = await connection.simulateTransaction(
        new VersionedTransaction(transaction.compileMessage()),
        { sigVerify: false, replaceRecentBlockhash: false },
      );
      if (result.value.err)
        throw new Error(`Simulation failed: ${JSON.stringify(result.value.err)}`);
      return result.value;
    },
  };
}
export type DBCServices = ReturnType<typeof createDBCServices>;
export function explainTransactionError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (/reject|declin/i.test(message)) return "Wallet request rejected. Nothing was submitted.";
  if (/blockhash|expired/i.test(message))
    return "Blockhash expired. Rebuild and review the transaction.";
  if (/account.*not|not.*account/i.test(message))
    return "Account not found on the selected network.";
  if (/429|fetch|network|403/i.test(message))
    return "RPC unavailable, mismatched or rate-limited. Execution paused.";
  return message;
}
export function explorer(address: string, network: string) {
  const verified = new PublicKey(address).toBase58();
  return `https://explorer.solana.com/address/${verified}${network === "devnet" ? "?cluster=devnet" : ""}`;
}

export const SDK_VERSION = "1.5.13";
export const PERMISSIONLESS_QUOTES: Record<string, { symbol: string; decimals: number }> = {
  So11111111111111111111111111111111111111112: { symbol: "SOL", decimals: 9 },
  EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v: { symbol: "USDC", decimals: 6 },
};
export type TokenBadgeState = "not-required" | "may-be-required" | "required";
/** Arbitrary quote mints are accepted by PoolConfig (any decimals since SDK 1.5.13). Non-permissionless quote mints may need a DBC tokenBadge remaining account (SDK >= 1.5.12). */
export function tokenBadgeState(
  quoteMint: string,
  check?: { program: string; extensions: boolean },
): TokenBadgeState {
  if (PERMISSIONLESS_QUOTES[quoteMint]) return "not-required";
  if (check && check.program === "Token-2022" && check.extensions) return "required";
  return "may-be-required";
}
export type LaunchMode = "standard" | "quantum";
export type LaunchPlanInput = {
  mode: LaunchMode;
  symbol: string;
  quoteMint: string;
  quoteDecimals: number | null;
  quoteVerified: boolean;
  firstBuy: "none" | "creator" | "partner-and-creator";
  firstBuyAmount: number;
  badge: TokenBadgeState;
};
export function sdkMethodPlan(i: LaunchPlanInput) {
  const methods = [
    "client.partner.createConfig({ migrationOption: MET_DAMM_V2, quoteMint" +
      (i.badge === "not-required" ? "" : ", tokenBadge") +
      " })",
  ];
  methods.push(
    i.firstBuy === "none"
      ? "client.creator.createPool({ config, baseMint, name, symbol, uri })"
      : i.firstBuy === "creator"
        ? "client.creator.createPoolWithFirstBuy({ createPoolParam, firstBuyParam })"
        : "client.creator.createPoolWithPartnerAndCreatorFirstBuy({ createPoolParam, partnerFirstBuyParam, creatorFirstBuyParam })",
  );
  if (i.mode === "quantum")
    methods.push(`metadata.extensions["${DOMAINS.launch}"] = Attestation Seal`);
  const signers = [
    "Partner / config authority wallet",
    "Config keypair (generated at build time)",
    "Base mint keypair (generated at build time)",
    "Creator wallet",
  ];
  const liveBlocked = [
    !i.quoteVerified && "Quote mint unverified in this session",
    i.quoteDecimals === null && "Quote decimals unknown until RPC check",
    i.badge === "required" && "Token badge account must be supplied",
  ].filter(Boolean) as string[];
  return {
    methods,
    signers,
    checkpoints: 2,
    liveBlocked,
    programId: DBC_PROGRAM_ID,
    migration: "MET_DAMM_V2",
    sdk: SDK_VERSION,
  };
}
