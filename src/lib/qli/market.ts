export type Market = {
  id: string;
  name: string;
  symbol: string;
  mint: string;
  price: number;
  cap: number;
  liquidity: number;
  volume: number;
  change: number;
  activity: number;
  quote: string;
  exchange: string;
  points: number[];
};
export const demoMarkets: Market[] = [
  {
    id: "arc",
    name: "Arc Protocol",
    symbol: "ARC",
    mint: "demo:arc",
    price: 0.0842,
    cap: 842000,
    liquidity: 184260,
    volume: 92481,
    change: 8.24,
    activity: 85,
    quote: "SOL",
    exchange: "Meteora DBC",
    points: [20, 25, 22, 31, 29, 40, 35, 49, 43, 59, 53, 65, 62, 78],
  },
  {
    id: "nexus",
    name: "Nexus Network",
    symbol: "NXS",
    mint: "demo:nexus",
    price: 0.0126,
    cap: 1260000,
    liquidity: 128540,
    volume: 68204,
    change: -3.12,
    activity: 63,
    quote: "USDC",
    exchange: "Meteora DBC",
    points: [70, 74, 65, 68, 58, 63, 53, 57, 46, 49, 38, 42, 33, 29],
  },
  {
    id: "vector",
    name: "Vector Labs",
    symbol: "VEC",
    mint: "demo:vector",
    price: 0.0361,
    cap: 361000,
    liquidity: 111880,
    volume: 51620,
    change: 12.65,
    activity: 92,
    quote: "SOL",
    exchange: "Meteora DBC",
    points: [13, 17, 22, 18, 32, 28, 39, 44, 38, 52, 61, 58, 72, 86],
  },
];
export type MarketSort = "volume" | "cap" | "gainers" | "losers" | "activity";
export function filterMarkets(markets: Market[], query: string, sort: MarketSort) {
  const q = query.toLowerCase().trim();
  return markets
    .filter((m) => `${m.name} ${m.symbol} ${m.mint}`.toLowerCase().includes(q))
    .sort((a, b) =>
      sort === "losers"
        ? a.change - b.change
        : sort === "gainers"
          ? b.change - a.change
          : sort === "cap"
            ? b.cap - a.cap
            : sort === "activity"
              ? b.activity - a.activity
              : b.volume - a.volume,
    );
}
export async function getMarkets(mode: "demo" | "live"): Promise<Market[]> {
  if (mode === "demo") return demoMarkets.map((m) => ({ ...m, points: [...m.points] }));
  throw new Error(
    "Live market provider is not connected. Switch to demo data to explore markets safely.",
  );
}
export function validateOrder(amount: number, slippage: number, priority: number) {
  if (!Number.isFinite(amount) || amount <= 0 || amount > 1000)
    throw new Error("Amount must be greater than zero and no more than 1,000.");
  if (!Number.isFinite(slippage) || slippage <= 0 || slippage > 5)
    throw new Error("Slippage must be between 0 and 5%.");
  if (!Number.isFinite(priority) || priority < 0 || priority > 0.1)
    throw new Error("Priority fee must be between 0 and 0.1 SOL.");
}
