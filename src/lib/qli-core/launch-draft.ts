import { resolveQuoteMint, type LaunchDraft } from "./validation";
import { DBC_PROGRAM_ID } from "./dbc";
import { DOMAINS, hex, messageDigest } from "./pq";

// Default draft and canonical review digest; kept outside components so plan logic is testable.
export const initialLaunch: LaunchDraft = {
  mode: "standard",
  scheme: "wots",
  image: "",
  name: "",
  symbol: "",
  description: "",
  twitter: "",
  website: "",
  telegram: "",
  vanity: false,
  vanitySuffix: "",
  launchSlippage: 1,
  prioritySol: 0.0001,
  metadata: "",
  decimals: 9,
  supply: 1000000000,
  tokenType: "SPL",
  builder: "Market Cap",
  initialCap: 10000,
  migrationCap: 100000,
  quoteThreshold: 800,
  supplyMigration: 80,
  startingBps: 200,
  endingBps: 50,
  scheduler: "Linear",
  dynamic: true,
  collectMode: "Quote only",
  creatorFee: 20,
  creationFee: 0,
  dammFee: 100,
  partnerLiquidity: 20,
  creatorLiquidity: 80,
  partnerLocked: 10,
  creatorLocked: 40,
  vesting: 90,
  leftoverReceiver: "",
  quoteKind: "crypto",
  quote: "SOL",
  customMint: "",
  tokenizedMint: "",
  firstBuy: "none",
  firstBuyAmount: 0,
};
export function launchDigest(d: LaunchDraft) {
  const canonical = JSON.stringify({
    v: 1,
    mode: d.mode,
    name: d.name,
    symbol: d.symbol,
    uri: d.metadata,
    decimals: d.decimals,
    supply: d.supply,
    quoteMint: resolveQuoteMint(d),
    program: DBC_PROGRAM_ID,
    migration: "MET_DAMM_V2",
  });
  return { canonical, digest: hex(messageDigest(DOMAINS.launch, canonical)) };
}
