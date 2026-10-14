// @vitest-environment node
import { beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { Keypair, Transaction } from "@solana/web3.js";
import {
  buildTree,
  createLeafLedger,
  deriveKeys,
  publicDemoKeys,
  publicIdentity,
  type IdentityTree,
  type PublicIdentity,
} from "@/lib/qli-core/identity";
import {
  canonicalIntent,
  createAuthorization,
  defaultPolicy,
  exportAuthorization,
  intentMessage,
  loadPolicy,
  parsePolicy,
  requiresAuthorization,
  verifyAuthorization,
  type AuthorizationIntent,
  type AuthorizationRecord,
} from "@/lib/qli-core/authorization";
import { expectedAuthorizationFields } from "@/lib/qli-core/flywheel-live";
import { verifyWotsProof } from "@/lib/qli-core/pq";
import { DOMAINS } from "@/lib/qli-core/compatibility";

const wallet = Keypair.generate().publicKey.toBase58();
const pool = Keypair.generate().publicKey.toBase58();
const mint = Keypair.generate().publicKey.toBase58();
const bh = Keypair.generate().publicKey.toBase58();
let tree: IdentityTree;
let id: PublicIdentity;

function built(msg = new Uint8Array([1, 2, 3]), amount = "50000000") {
  const tx = new Transaction();
  tx.recentBlockhash = bh;
  return {
    step: "buyback" as const,
    transaction: tx,
    reviewedMessage: msg,
    lastValidBlockHeight: 123,
    scope: {
      amountBase: amount,
      maxSpendLamports: amount,
      slippageBps: "100",
      minOutBase: "999",
      recipient: wallet,
    },
  };
}
const exp = (b = built(), network: "devnet" | "mainnet-beta" = "devnet", w = wallet) =>
  expectedAuthorizationFields({
    built: b,
    pool: { pool, creator: wallet, baseMint: mint },
    wallet: w,
    network,
    identity: id,
  });
const NOW = 1_800_000_000;

async function make(ledger = createLeafLedger(id.root)) {
  const intent: AuthorizationIntent = {
    ...exp(),
    issuedAt: String(NOW),
    expiresAt: String(NOW + 120),
    nonce: "ab".repeat(32),
  };
  const rec = await createAuthorization({
    intent,
    identity: id,
    tree,
    nextLeaf: ledger.next,
    reserveLeaf: (l, p) => ledger.reserve(l, p),
  });
  return { rec, ledger };
}

beforeAll(async () => {
  tree = await buildTree(await deriveKeys(new Uint8Array(64).fill(7)));
  id = publicIdentity(tree, "reference", wallet);
}, 60_000);

describe("Quantum Authorization v1", () => {
  it("signs a canonical intent with a real WOTS leaf and verifies", async () => {
    const { rec, ledger } = await make();
    expect(rec.proof.message).toBe(intentMessage(rec.intent));
    expect(verifyWotsProof(rec.proof).valid).toBe(true);
    expect(ledger.state.used).toEqual([0]);
    expect(verifyAuthorization(rec, exp(), id, NOW + 1, new Set())).toBeNull();
    expect(JSON.parse(canonicalIntent(rec.intent)).v).toBe("1");
  });
  it("fails closed on missing, tampered, expired and replayed proofs", async () => {
    const { rec } = await make();
    expect(verifyAuthorization(null, exp(), id, NOW, new Set())).toMatch(/No authorization/);
    const sig = [...rec.proof.signature];
    sig[0] = "00".repeat(32);
    expect(
      verifyAuthorization(
        { ...rec, proof: { ...rec.proof, signature: sig } },
        exp(),
        id,
        NOW,
        new Set(),
      ),
    ).toMatch(/invalid/);
    const tampered: AuthorizationRecord = { ...rec, intent: { ...rec.intent, amountBase: "1" } };
    expect(verifyAuthorization(tampered, exp(), id, NOW, new Set())).toMatch(/does not match/);
    expect(verifyAuthorization(rec, exp(), id, NOW + 120, new Set())).toMatch(/expired/);
    expect(verifyAuthorization(rec, exp(), id, NOW, new Set([rec.intent.nonce]))).toMatch(/replay/);
    expect(
      verifyAuthorization({ ...rec, status: "invalidated" }, exp(), id, NOW, new Set()),
    ).toMatch(/invalidated/);
    expect(
      verifyAuthorization(
        { ...rec, proof: { ...rec.proof, domain: DOMAINS.launch } },
        exp(),
        id,
        NOW,
        new Set(),
      ),
    ).toMatch(/domain/);
  });
  it("rejects network, wallet, pool, amount, stale quote and mutated review bytes", async () => {
    const { rec } = await make();
    const v = (e: ReturnType<typeof exp>) => verifyAuthorization(rec, e, id, NOW, new Set());
    expect(v(exp(built(), "mainnet-beta"))).toMatch(/network/);
    expect(v(exp(built(), "devnet", Keypair.generate().publicKey.toBase58()))).toMatch(/wallet/);
    expect(v({ ...exp(), pool: Keypair.generate().publicKey.toBase58() })).toMatch(/pool/);
    expect(v(exp(built(undefined, "60000000")))).toMatch(/amountBase/);
    expect(v({ ...exp(), minOutBase: "998" })).toMatch(/minOutBase/);
    expect(v({ ...exp(), blockhash: Keypair.generate().publicKey.toBase58() })).toMatch(
      /blockhash/,
    );
    expect(v(exp(built(new Uint8Array([1, 2, 4]))))).toMatch(/txMessageSha256/);
  });
  it("rejects a different identity and the public demo", async () => {
    const { rec } = await make();
    const other = publicIdentity(
      await buildTree(await deriveKeys(new Uint8Array(64).fill(9))),
      "reference",
      wallet,
    );
    expect(verifyAuthorization(rec, exp(), other, NOW, new Set())).toMatch(/identity|Mismatch/);
    const demoTree = await buildTree(await publicDemoKeys());
    const demo = publicIdentity(demoTree, "public-demo", null);
    await expect(
      createAuthorization({
        intent: rec.intent,
        identity: demo,
        tree: demoTree,
        nextLeaf: () => 0,
        reserveLeaf: (l) => l,
      }),
    ).rejects.toThrow(/public demo/);
    expect(verifyAuthorization(rec, exp(), demo, NOW, new Set())).toMatch(/demo/i);
  }, 60_000);
  it("never reuses a leaf and stops at exhaustion", async () => {
    const ledger = createLeafLedger(id.root);
    const a = await make(ledger);
    const b = await make(ledger);
    expect(a.rec.proof.leaf).not.toBe(b.rec.proof.leaf);
    for (let i = 0; i < 256; i++) if (!ledger.isUsed(i)) ledger.reserve(i, "fill");
    await expect(make(ledger)).rejects.toThrow(/All 256/);
  });
  it("validates policy bounds and fails closed on corrupt storage", () => {
    expect(() => parsePolicy({ ...defaultPolicy, expirySeconds: 5 })).toThrow();
    expect(() => parsePolicy({ ...defaultPolicy, buybackThresholdLamports: 1e12 })).toThrow();
    expect(loadPolicy({ getItem: () => "{bad" }).policy.enabled).toBe(true);
    const p = { ...defaultPolicy, enabled: true, buybackThresholdLamports: 100 };
    expect(requiresAuthorization(p, "buyback", 99n)).toBe(false);
    expect(requiresAuthorization(p, "buyback", 100n)).toBe(true);
    expect(requiresAuthorization(defaultPolicy, "burn", 0n)).toBe(false);
    expect(
      requiresAuthorization({ ...p, operations: { ...p.operations, burn: false } }, "burn", 0n),
    ).toBe(false);
  });
  it("exports public material only", async () => {
    const { rec } = await make();
    const json = exportAuthorization(rec);
    expect(json).not.toMatch(/skSeed|secret"|levels/);
    expect(json).toContain("not on-chain enforced");
  });
  it("authorization module never signs or broadcasts Solana transactions", () => {
    const src = readFileSync("src/lib/qli-core/authorization.ts", "utf8");
    expect(src).not.toMatch(/sendRawTransaction|signTransaction|signAndSend|Connection/);
    const ui = readFileSync("src/components/qli-core/flywheel-live.tsx", "utf8");
    // Wallet approval is still the only path to sending, and the gate re-verifies right before it.
    expect(ui.indexOf("authProblem(Math.floor")).toBeLessThan(
      ui.indexOf("signReviewedTransaction({"),
    );
  });
});
