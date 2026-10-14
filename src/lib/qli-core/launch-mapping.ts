import type { LaunchDraft } from "./validation";
import type { LaunchForm } from "./dbc-launch";

/** Wizard values the SDK path can apply exactly; every other value is reported, never silently dropped. */
export const SUPPORTED_PATCH: Partial<LaunchDraft> = {
  quoteKind: "crypto",
  quote: "SOL",
  tokenType: "SPL",
  vanity: false,
  builder: "Market Cap",
  firstBuy: "none",
  firstBuyAmount: 0,
  partnerLiquidity: 0,
  creatorLiquidity: 0,
  partnerLocked: 0,
  creatorLocked: 100,
  vesting: 0,
};

export function draftToForm(d: LaunchDraft): { form: LaunchForm; unsupported: string[] } {
  const u: string[] = [];
  if (d.quoteKind !== "crypto" || d.quote !== "SOL")
    u.push("Quote market must be SOL for on-chain launch.");
  if (d.tokenType !== "SPL") u.push("Token-2022 launches are not yet supported; choose SPL.");
  if (d.vanity) u.push("Vanity mint addresses are not supported; turn vanity off.");
  if (d.builder !== "Market Cap") u.push("Only the Market Cap curve builder is supported.");
  if (d.decimals !== 6 && d.decimals !== 9) u.push("Decimals must be 6 or 9.");
  if (d.startingBps !== d.endingBps)
    u.push("Fee schedulers are not yet supported: set starting and ending fee equal.");
  if (d.partnerLiquidity + d.creatorLiquidity + d.partnerLocked + d.creatorLocked !== 100)
    u.push("Liquidity split (step 4) must total 100%.");
  if (d.vesting !== 0) u.push("Liquidity vesting is not yet supported; set vesting to 0.");
  if (d.firstBuy !== "none") u.push("First buy is not yet supported; choose none.");
  return {
    unsupported: u,
    form: {
      name: d.name,
      symbol: d.symbol,
      uri: d.metadata,
      decimals: d.decimals === 6 ? 6 : 9,
      totalSupply: d.supply,
      initialMarketCap: d.initialCap,
      migrationMarketCap: d.migrationCap,
      feeBps: d.startingBps,
      firstBuyLamports: d.firstBuy === "none" ? 0 : Math.round(d.firstBuyAmount * 1e9),
      creatorFeePercent: d.creatorFee,
      liquidity: {
        partner: d.partnerLiquidity,
        creator: d.creatorLiquidity,
        partnerLocked: d.partnerLocked,
        creatorLocked: d.creatorLocked,
      },
    },
  };
}
