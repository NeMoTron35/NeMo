import { PublicKey, type Connection } from "@solana/web3.js";

export const RWA_REGISTRY_LABEL = "Snapshot — verify live on-chain before launch";
export const RWA_ELIGIBILITY =
  "Availability and transfer restrictions vary by issuer and jurisdiction. A tokenized market asset represents only what its issuer’s terms grant; it does not imply direct equity ownership.";
export const ONDO_NOTE =
  "200+ Ondo Global Markets stocks and ETFs are issued on Solana. Quantum QLi ships no Ondo mints: enter a current mint and validate it on the active RPC before use.";

export type RwaAsset = {
  symbol: string;
  mint: string;
  family: "xStocks";
  issuer: "Backed Finance";
  type: "Stock" | "ETF";
  name: string;
};

const ETFS = new Set(["SPYx", "QQQx", "VTIx", "TQQQx", "GLDx"]);
const raw = `SPYx XsoCS1TfEyfFhfvj8EtZ528L3CaKBDBRqRapnBbDF2W S&P 500 ETF
CRWDx Xs7xXqkcK7K8urEqGg52SECi79dRp2cEKKuYjUePYDw CrowdStrike
TSLAx XsDoVfqeBukxuZHWhdvWHBhgEHjGNst4MLodqsJHzoB Tesla
MCDx XsqE9cRRpzxcGKDXj1BJ7Xmg4GRhZoyY1KpmGSxAWT2 McDonald's
GOOGLx XsCPL9dNWBMvFtTmwcCA5v3xWPSMEBCszbQdiLLq6aN Alphabet
VTIx XsssYEQjzxBCFgvYFFNuhJFBeHNdLWYeUSP8F45cDr9 Total Stock Market ETF
Vx XsqgsbXwWogGJsNcVZ3TyVouy2MbTkfCFhCGGGcQZ2p Visa
ORCLx XsjFwUPiLofddX5cWFHW35GCbXcSu1BCUGfxoQAQjeL Oracle
WMTx Xs151QeqTCiuKtinzfRATnUESM2xTU6V9Wy8Vy538ci Walmart
JPMx XsMAqkcKsUewDrzVkait4e5u4y8REgtyS7jWgCpLV2C JPMorgan Chase
MDTx XsDgw22qRLTv5Uwuzn6T63cW69exG41T6gwQhEK22u2 Medtronic
MRVLx XsuxRGDzbLjnJ72v74b7p9VY6N66uYgTCyfwwRjVCJA Marvell
QQQx Xs8S1uUs1zvS2p7iwtsG3b6fkhpvmwz4GYU3gWAmWHZ Nasdaq-100 ETF
AMZNx Xs3eBt7uRfJX8QUs4suhyU8p2M6DoUDrJyWBa8LLZsg Amazon
AZNx Xs3ZFkPYT2BN7qBMqf1j1bfTeTm1rFzEFSsQ1z3wAKU AstraZeneca
HONx XsRbLZthfABAPAfumWNEJhPyiKDW6TvDVeAeW7oKqA2 Honeywell
ACNx Xs5UJzmCRQ8DWZjskExdSQDnbE6iLkRu2jjrRAB1JSU Accenture
HDx XszjVtyhowGjSC5odCqBpW1CtXXwXjYokymrk7fGKD3 Home Depot
GMEx Xsf9mBktVB9BSU5kf4nHxPq5hCBJ2j2ui3ecFGxPRGc GameStop
HOODx XsvNBAYkrDRNhA7wPHQfX3ZUXZyZLdnCQDfHZ56bzpg Robinhood
INTCx XshPgPdXFRWB8tP1j82rebb2Q9rPgGX37RuqzohmArM Intel
DFDVx Xs2yquAgsHByNzx68WJC55WHjHBvG9JsMB7CWjTLyPy DeFi Development
BRK.Bx Xs6B6zawENwAbWVi7w92rjazLuAr5Az59qgWKcNb45x Berkshire Hathaway B
COINx Xs7ZdzSHLU9ftNJsii5fCeJhoRWSC32SQGzGQtePxNu Coinbase
BACx XswsQk4duEQmCbGzfqUUWYmi7pV7xpJ9eEmLHXCaEQP Bank of America
CVXx XsNNMt7WTNA2sV3jrb1NNfNgapxRF5i4i6GcnTRRHts Chevron
CSCOx Xsr3pdLQyXvDJBFgpR5nexCEZwXvigb8wbPYp4YoNFf Cisco
PGx XsYdjDjNUygZ7yGKfQaB6TxLh2gC6RRjzLtLAGJrhzV Procter & Gamble
CMCSAx XsvKCaNsxg2GN8jjUmq71qukMJr7Q1c5R2Mk9P8kcS8 Comcast
CRCLx XsueG8BtpquVJX9LVLLEGuViXUungE6WmK5YZ3p3bd1 Circle
METAx Xsa62P5mvPszXL1krVUnU5ar38bBSVcWAB6fmPCo5Zu Meta Platforms
LINx XsSr8anD1hkvNMu8XQiVcmiaTP7XGvYu7Q58LdmtE8Z Linde
UNHx XszvaiXGPwvk2nwb3o9C1CX4K6zH8sez11E6uyup6fe UnitedHealth
PEPx Xsv99frTRUeornyvCfvhnDesQDWuvns1M852Pez91vF PepsiCo
AMBRx XsaQTCgebC2KPbf27KUhdv5JFvHhQ4GDAPURwrEhAzb Amber
MSFTx XspzcW1PRtgf6Wj92HCiZdjzKCyFekVD8P5Ueh3dRMX Microsoft
MAx XsApJFV9MAktqnAc6jqzsHVujxkGm9xcSUffaBoYLKC Mastercard
NVOx XsfAzPzYrYjd4Dpa9BU3cusBsvWfVB9gBcyGC87S57n Novo Nordisk
PMx Xsba6tUnSjDae2VcopDB6FGGDaxRrewFCDa5hKn5vT3 Philip Morris
MSTRx XsP7xzNPvEHS1m6qfanPUGjNmdnmsLKEoNAnHjdxxyZ MicroStrategy
XOMx XsaHND8sHyfMfsWPj6kSdd5VwvCayZvjYgKmmcNL5qh Exxon Mobil
PFEx XsAtbqkAP1HJxy7hFDeq7ok6yM43DQ9mQ1Rh861X8rw Pfizer
GLDx Xsv9hRk1z5ystj9MhnA7Lq4vjSsLwzL2nxrwmwtD3re Gold ETF
NVDAx Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh NVIDIA
DHRx Xseo8tgCZfkHxWS9xbFYeKFyMSbWEvZGFV1Gh53GtCV Danaher
GSx XsgaUyp4jd1fNBCxgtTKkW64xnnhQcvgaxzsbAq5ZD1 Goldman Sachs
TMOx Xs8drBWy3Sd5QY3aifG9kt9KFs2K3PGZmx7jWrsrk57 Thermo Fisher
MRKx XsnQnU7AdbRZYe2akqqpibDdXjkieGFfSkbkjX1Sd1X Merck
ABTx XsHtf5RpxsQ7jeJ9ivNewouZKJHbPxhPoEy6yYvULr7 Abbott
CRMx XsczbcQ3zfcgAEt9qHQES8pxKAVG5rujPSHQEXi4kaN Salesforce
TQQQx XsjQP3iMAaQ3kQScQKthQpx9ALRbjKAjQtHg6TFomoc UltraPro QQQ ETF
JNJx XsGVi5eo1Dh2zUpic4qACcjuWGjNv8GCt3dm5XcX6Dn Johnson & Johnson
ABBVx XswbinNKyPmzTa5CskMbCPvMW6G5CMnZXZEeQSSQoie AbbVie
APPx XsPdAVBi8Zc1xvv53k4JcMrQaEDTgkGqKYeh7AYgPHV AppLovin
NFLXx XsEH7wWfJJu2ZT3UCFeVfALnVA6CP5ur7Ee11KmzVpL Netflix
PLTRx XsoBhf2ufR8fTyNSjqfU71DYGaE6Z3SUGAidpzriAA4 Palantir
LLYx Xsnuv4omNoHozR6EEW5mXkw8Nrny5rB3jVfLqi6gKMH Eli Lilly
AVGOx XsgSaSvNSqLTtFuyWPBhK9196Xb9Bbdyjj4fH3cPJGo Broadcom
KOx XsaBXg8dU5cPM6ehmVctMkVqoiRG2ZjMo1cyBJ3AykQ Coca-Cola
IBMx XspwhyYPdWVM8XBHZnpS9hgyag9MKjLRyE3tVfmCbSr IBM
AAPLx XsbEhLAtcf6HdfpFZ5xEMdqW8nfAvcsP5bdudRLJzJp Apple`;

export const RWA_PRESETS: readonly RwaAsset[] = raw.split("\n").map((line) => {
  const [symbol, mint, ...rest] = line.trim().split(" ");
  return {
    symbol: symbol!,
    mint: mint!,
    name: rest.join(" "),
    family: "xStocks",
    issuer: "Backed Finance",
    type: ETFS.has(symbol!) ? "ETF" : "Stock",
  } as RwaAsset;
});

export function isValidMint(value: string) {
  try {
    return new PublicKey(value.trim()).toBase58() === value.trim();
  } catch {
    return false;
  }
}
export function searchRwa(query: string, list: readonly RwaAsset[] = RWA_PRESETS) {
  const q = query.trim().toLowerCase();
  if (!q) return list;
  return list.filter(
    (a) =>
      a.symbol.toLowerCase().includes(q) ||
      a.name.toLowerCase().includes(q) ||
      a.mint.toLowerCase().startsWith(q) ||
      a.type.toLowerCase() === q,
  );
}
export function findRwa(mint: string) {
  return RWA_PRESETS.find((a) => a.mint === mint);
}

export const TOKEN_PROGRAM = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
export const TOKEN_2022_PROGRAM = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";
export type MintCheck =
  | { status: "unverified" }
  | {
      status: "verified";
      decimals: number;
      program: "SPL Token" | "Token-2022";
      extensions: boolean;
    }
  | { status: "failed"; reason: string };

/** Read-only RPC verification of a quote mint (owner program + decimals). Required before live construction. */
export async function verifyMintOnRpc(connection: Connection, mint: string): Promise<MintCheck> {
  if (!isValidMint(mint)) return { status: "failed", reason: "Not a valid Solana public key." };
  try {
    const info = await connection.getParsedAccountInfo(new PublicKey(mint));
    const v = info.value;
    if (!v) return { status: "failed", reason: "Mint account not found on this network." };
    const owner = v.owner.toBase58();
    if (owner !== TOKEN_PROGRAM && owner !== TOKEN_2022_PROGRAM)
      return { status: "failed", reason: "Account is not owned by a token program." };
    const data = v.data as {
      parsed?: { type?: string; info?: { decimals?: number; extensions?: unknown[] } };
    };
    if (data.parsed?.type !== "mint" || typeof data.parsed.info?.decimals !== "number")
      return { status: "failed", reason: "Account is not a token mint." };
    return {
      status: "verified",
      decimals: data.parsed.info.decimals,
      program: owner === TOKEN_PROGRAM ? "SPL Token" : "Token-2022",
      extensions: (data.parsed.info.extensions?.length ?? 0) > 0,
    };
  } catch (e) {
    return { status: "failed", reason: e instanceof Error ? e.message : "RPC unavailable." };
  }
}