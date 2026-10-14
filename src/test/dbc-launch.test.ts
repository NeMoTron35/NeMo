// @vitest-environment node
import { describe, expect, it } from "vitest";
import { Connection, Keypair, LAMPORTS_PER_SOL, Transaction } from "@solana/web3.js";
import type { Wallet, WalletAccount } from "@wallet-standard/base";
import { SolanaSignTransaction } from "@solana/wallet-standard-features";
import {
  buildLaunch,
  submitAndConfirm,
  validateLaunchForm,
  verifyMetadata,
  type LaunchForm,
} from "@/lib/qli-core/dbc-launch";
import { draftToForm, SUPPORTED_PATCH } from "@/lib/qli-core/launch-mapping";
import { initialLaunch } from "@/lib/qli-core/launch-draft";
import { pickAccount, phantomBrowseLink, walletEnvironment } from "@/lib/qli-core/wallet-accounts";
import { signReviewedTransaction } from "@/lib/qli-core/wallet";

const form: LaunchForm = {
  name: "QLi Test",
  symbol: "QLIT",
  uri: "https://example.com/m.json",
  decimals: 6,
  totalSupply: 1_000_000_000,
  initialMarketCap: 30,
  migrationMarketCap: 300,
  feeBps: 100,
  firstBuyLamports: 0,
};

describe("launch validation", () => {
  it("accepts a supported form on devnet and mainnet", () => {
    expect(validateLaunchForm(form, "devnet")).toEqual([]);
    expect(validateLaunchForm(form, "mainnet-beta")).toEqual([]);
  });
  it("rejects first buy, bad URI and bad caps", () => {
    const e = validateLaunchForm(
      { ...form, firstBuyLamports: 1, uri: "http://x", migrationMarketCap: 1 },
      "devnet",
    );
    expect(e.length).toBe(3);
  });
  it("reports unsupported wizard settings instead of dropping them", () => {
    expect(draftToForm(initialLaunch).unsupported.length).toBeGreaterThan(0);
    const ok = { ...initialLaunch, ...SUPPORTED_PATCH, endingBps: initialLaunch.startingBps };
    expect(draftToForm(ok).unsupported).toEqual([]);
    expect(draftToForm({ ...ok, quote: "USDC" }).unsupported.join()).toMatch(/SOL/);
  });
  it("verifies metadata JSON fields", async () => {
    const f = (body: unknown, status = 200) =>
      (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;
    await expect(
      verifyMetadata(
        form.uri,
        form,
        f({ name: "QLi Test", symbol: "QLIT", image: "https://i/x.png" }),
      ),
    ).resolves.toBeTruthy();
    await expect(verifyMetadata(form.uri, form, f({}, 404))).rejects.toThrow(/404/);
    await expect(
      verifyMetadata(form.uri, form, f({ name: "Other", symbol: "QLIT", image: "https://i" })),
    ).rejects.toThrow(/name/);
  });
});

describe("wallet discovery", () => {
  const acct = (chains: string[]) =>
    ({
      address: "a",
      publicKey: new Uint8Array(32),
      chains,
      features: [],
    }) as unknown as WalletAccount;
  const w = (chains: string[]) => ({ chains }) as unknown as Wallet;
  it("accepts accounts that list the chain, or wallets that list it when accounts do not", () => {
    expect(pickAccount(w([]), [acct(["solana:devnet"])], "solana:devnet")).toBeTruthy();
    expect(pickAccount(w(["solana:devnet"]), [acct([])], "solana:devnet")).toBeTruthy();
    expect(
      pickAccount(w(["solana:mainnet"]), [acct(["solana:mainnet"])], "solana:devnet"),
    ).toBeUndefined();
  });
  it("diagnoses framed, mobile and desktop environments", () => {
    const win = (top: boolean, ua: string) =>
      ({ self: 1, top: top ? 1 : 2, navigator: { userAgent: ua } }) as unknown as Window;
    expect(walletEnvironment(win(false, "Chrome"), 0)).toBe("framed");
    expect(walletEnvironment(win(true, "iPhone"), 0)).toBe("mobile-no-wallet");
    expect(walletEnvironment(win(true, "Chrome"), 0)).toBe("desktop-no-wallet");
    expect(walletEnvironment(win(true, "Chrome"), 1)).toBe("ok");
    expect(phantomBrowseLink("https://quantumqli.app/launch")).toContain(
      "phantom.app/ul/browse/https%3A%2F%2Fquantumqli.app%2Flaunch",
    );
  });
});

/**
 * Real execution against a local validator with the Meteora DBC program cloned
 * from devnet. Run: QLI_LOCAL_RPC=http://127.0.0.1:8899 bunx vitest run dbc-launch
 */
const rpc = process.env["QLI_LOCAL_RPC"];
describe.skipIf(!rpc)("local validator launch (real DBC program)", () => {
  function mockWallet(kp: Keypair, behaviour: "sign" | "reject" | "tamper") {
    const account = {
      address: kp.publicKey.toBase58(),
      publicKey: kp.publicKey.toBytes(),
      chains: ["solana:localnet"],
      features: [SolanaSignTransaction],
    } as unknown as WalletAccount;
    const wallet = {
      name: "Mock Phantom",
      chains: ["solana:localnet"],
      accounts: [account],
      features: {
        [SolanaSignTransaction]: {
          version: "1.0.0",
          supportedTransactionVersions: ["legacy"],
          signTransaction: async ({ transaction }: { transaction: Uint8Array }) => {
            if (behaviour === "reject") throw new Error("User rejected the request.");
            const t = Transaction.from(transaction);
            if (behaviour === "tamper") t.recentBlockhash = Keypair.generate().publicKey.toBase58();
            t.partialSign(kp);
            return [
              {
                signedTransaction: t.serialize({
                  requireAllSignatures: false,
                  verifySignatures: false,
                }),
              },
            ];
          },
        },
      },
    } as unknown as Wallet;
    return { wallet, account };
  }
  async function funded(conn: Connection, sol = 2) {
    const kp = Keypair.generate();
    await conn.confirmTransaction(await conn.requestAirdrop(kp.publicKey, sol * LAMPORTS_PER_SOL));
    return kp;
  }
  it("creates, submits and confirms a config + pool", async () => {
    const conn = new Connection(rpc!, "confirmed");
    const kp = await funded(conn);
    const b = await buildLaunch(conn, "localnet", kp.publicKey, form);
    const t = Transaction.from(b.transaction.serialize({ requireAllSignatures: false }));
    t.partialSign(kp);
    let submitted = "";
    const sig = await submitAndConfirm(conn, t.serialize(), b, (s) => (submitted = s));
    expect(sig).toBe(submitted);
    const pool = await conn.getAccountInfo(new (await import("@solana/web3.js")).PublicKey(b.pool));
    expect(pool?.owner.toBase58()).toBe("dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN");
  }, 60_000);
  it("refuses an unfunded wallet with a low-SOL message", async () => {
    const conn = new Connection(rpc!, "confirmed");
    await expect(buildLaunch(conn, "localnet", Keypair.generate().publicKey, form)).rejects.toThrow(
      /Insufficient SOL/,
    );
  }, 30_000);
  it("rejects a cluster mismatch, wallet rejection and tampered bytes", async () => {
    const conn = new Connection(rpc!, "confirmed");
    const kp = await funded(conn);
    const b = await buildLaunch(conn, "localnet", kp.publicKey, form);
    await expect(buildLaunch(conn, "devnet", kp.publicKey, form)).rejects.toThrow(/differs/);
    const run = (mode: "sign" | "reject" | "tamper", network: "devnet" | "localnet") => {
      const { wallet, account } = mockWallet(kp, mode);
      return signReviewedTransaction({
        wallet,
        account,
        connection: conn,
        transaction: b.transaction,
        lastValidBlockHeight: b.lastValidBlockHeight,
        network,
        reviewedMessage: b.reviewedMessage,
      });
    };
    await expect(run("sign", "devnet")).rejects.toThrow(/does not support|differs/);
    await expect(run("reject", "localnet")).rejects.toThrow(/rejected/);
    await expect(run("tamper", "localnet")).rejects.toThrow(/changed the reviewed/);
    const signed = await run("sign", "localnet");
    const sig = await submitAndConfirm(conn, signed, b, () => {});
    expect(sig.length).toBeGreaterThan(40);
  }, 60_000);
  it("rejects a stale blockhash on submit", async () => {
    const conn = new Connection(rpc!, "confirmed");
    const kp = await funded(conn);
    const b = await buildLaunch(conn, "localnet", kp.publicKey, form);
    const t = Transaction.from(b.transaction.serialize({ requireAllSignatures: false }));
    t.partialSign(kp);
    await expect(
      submitAndConfirm(conn, t.serialize(), { ...b, lastValidBlockHeight: 0 }, () => {}),
    ).rejects.toThrow();
  }, 60_000);
});
