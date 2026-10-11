// @vitest-environment node
import { describe, expect, it } from "vitest";
import { Connection, Keypair, Transaction } from "@solana/web3.js";
import type { Wallet, WalletAccount } from "@wallet-standard/base";
import { SolanaSignTransaction } from "@solana/wallet-standard-features";
import {
  canSignReviewed,
  launchFingerprint,
  verifyLaunchAttestation,
} from "@/lib/qli-core/launch-attestation";
import { initialLaunch, launchDigest } from "@/lib/qli-core/launch-draft";
import { draftToForm } from "@/lib/qli-core/launch-mapping";
import { accountSupportsChain } from "@/lib/qli-core/wallet-accounts";
import { signReviewedTransaction } from "@/lib/qli-core/wallet";
import { DOMAINS } from "@/lib/qli-core/pq";
import { buildTree, deriveKeys, signLeaf } from "@/lib/qli-core/identity";
import type { LaunchDraft } from "@/lib/qli-core/validation";

const draft: LaunchDraft = {
  ...initialLaunch,
  name: "QLi Test",
  symbol: "QLIT",
  metadata: "https://example.com/m.json",
};
function fp(d: LaunchDraft, o: Partial<Parameters<typeof launchFingerprint>[0]> = {}) {
  return launchFingerprint({
    form: draftToForm(d).form,
    mode: d.mode,
    canonical: launchDigest(d).canonical,
    network: "devnet",
    rpc: "https://api.devnet.solana.com",
    account: "A",
    wallet: "Phantom",
    identityRoot: "r",
    ...o,
  });
}

describe("reviewed transaction invalidation", () => {
  const base = fp(draft);
  it.each([
    ["name", fp({ ...draft, name: "Other" })],
    ["metadata URI", fp({ ...draft, metadata: "https://example.com/n.json" })],
    ["curve", fp({ ...draft, migrationCap: draft.migrationCap + 1 })],
    ["mode", fp({ ...draft, mode: "quantum" })],
    ["network", fp(draft, { network: "mainnet-beta" })],
    ["RPC", fp(draft, { rpc: "https://rpc.example.com" })],
    ["account", fp(draft, { account: "B" })],
    ["wallet", fp(draft, { wallet: "Solflare" })],
    ["attestation identity", fp(draft, { identityRoot: "other" })],
  ])("changing %s blocks signing the old review", (_, changed) => {
    expect(changed).not.toBe(base);
    expect(canSignReviewed(base, changed)).toBe(false);
  });
  it("allows signing only the identical, rebuilt review", () => {
    expect(canSignReviewed(null, base)).toBe(false);
    expect(canSignReviewed(base, fp(draft))).toBe(true);
  });
});

describe("wallet chain rule at signing", () => {
  const kp = Keypair.generate();
  const account = {
    address: kp.publicKey.toBase58(),
    publicKey: kp.publicKey.toBytes(),
    chains: [],
    features: [SolanaSignTransaction],
  } as unknown as WalletAccount;
  const wallet = (chains: string[]) =>
    ({ name: "Mock", chains, accounts: [account], features: {} }) as unknown as Wallet;
  it("accepts empty account chains when the wallet lists the chain", () => {
    expect(accountSupportsChain(wallet(["solana:devnet"]), account, "solana:devnet")).toBe(true);
    expect(accountSupportsChain(wallet(["solana:mainnet"]), account, "solana:devnet")).toBe(false);
  });
  it("passes the chain check and still enforces the network genesis", async () => {
    const t = new Transaction();
    t.feePayer = kp.publicKey;
    t.recentBlockhash = Keypair.generate().publicKey.toBase58();
    const w = wallet(["solana:devnet"]);
    (w.features as Record<string, unknown>)[SolanaSignTransaction] = {
      signTransaction: async () => [],
    };
    const conn = { getGenesisHash: async () => "not-devnet" } as unknown as Connection;
    const run = (wl: Wallet) =>
      signReviewedTransaction({
        wallet: wl,
        account,
        connection: conn,
        transaction: t,
        lastValidBlockHeight: 10,
        network: "devnet",
        reviewedMessage: new Uint8Array(t.serializeMessage()),
      });
    await expect(run(w)).rejects.toThrow(/RPC network differs/);
    await expect(run(wallet(["solana:mainnet"]))).rejects.toThrow(/does not support/);
  });
});

describe("Quantum Launch attestation", () => {
  it("verifies a real seal and rejects tampering", async () => {
    const tree = await buildTree(await deriveKeys(new Uint8Array(64).fill(7)));
    const proof = await signLeaf(tree, 3, DOMAINS.launch, launchDigest(draft).canonical);
    const identity = { root: proof.root, publicSeed: proof.publicSeed };
    const meta = (p: unknown) => ({ extensions: { [DOMAINS.launch]: { proof: p } } });
    expect(verifyLaunchAttestation(meta(proof), draft, identity).ok).toBe(true);
    const fail = (m: Record<string, unknown>, d = draft, id: typeof identity | null = identity) =>
      verifyLaunchAttestation(m, d, id);
    expect(fail(meta(proof), { ...draft, name: "Changed" }).ok).toBe(false);
    expect(fail(meta(proof), draft, { ...identity, root: "00".repeat(32) }).ok).toBe(false);
    expect(fail(meta({ ...proof, label: "public-demo" })).ok).toBe(false);
    const sig = [...proof.signature];
    sig[0] = "00".repeat(32);
    expect(fail(meta({ ...proof, signature: sig })).ok).toBe(false);
    expect(fail({ extensions: { [DOMAINS.launch]: { root: proof.root } } }).ok).toBe(false);
    expect(fail(meta(proof), draft, null).ok).toBe(false);
  }, 60_000);
});