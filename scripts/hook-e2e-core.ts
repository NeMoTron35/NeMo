// Owner-computer CLI safety primitives; never imported by app runtime.
import {
  PublicKey,
  Transaction,
  VersionedTransaction,
  type Connection,
  type Keypair,
} from "@solana/web3.js";
import { assertDevnet, type Built } from "../src/lib/qli-core/hook-devnet";
import {
  allowedPrograms,
  requiredSigners,
  verifyTxShape,
} from "../src/lib/qli-core/hook-dbc-devnet";

export type Options = {
  execute: boolean;
  ack: boolean;
  pauseTest: boolean;
  program: string;
  fingerprint: string;
  wallet: string;
  uri: string;
  config: string;
  pool: string;
  output: string;
  maxLamports: number;
  buyLamports: bigint;
  slippageBps: number;
};

export function parseArgs(args: string[]): Options {
  const o: Options = {
    execute: false,
    ack: false,
    pauseTest: false,
    program: "",
    fingerprint: "",
    wallet: "",
    uri: "",
    config: "",
    pool: "",
    output: "hook-devnet-receipt.json",
    maxLamports: 100_000_000,
    buyLamports: 1_000_000n,
    slippageBps: 100,
  };
  const names: Record<string, keyof Options> = {
    "--program": "program",
    "--fingerprint": "fingerprint",
    "--wallet": "wallet",
    "--uri": "uri",
    "--config": "config",
    "--pool": "pool",
    "--output": "output",
    "--max-lamports": "maxLamports",
    "--buy-lamports": "buyLamports",
    "--slippage-bps": "slippageBps",
  };
  let dry = false;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--dry-run") {
      dry = true;
      continue;
    }
    if (arg === "--execute") {
      o.execute = true;
      continue;
    }
    if (arg === "--ack-devnet") {
      o.ack = true;
      continue;
    }
    if (arg === "--pause-test") {
      o.pauseTest = true;
      continue;
    }
    const key = arg ? names[arg] : undefined;
    const value = args[++i];
    if (!key || !value || value.startsWith("--"))
      throw new Error("Unknown option or missing argument.");
    if (key === "maxLamports" || key === "slippageBps") {
      if (!/^\d+$/.test(value)) throw new Error("Numeric options must be unsigned integers.");
      o[key] = Number(value);
    } else if (key === "buyLamports") {
      if (!/^\d+$/.test(value)) throw new Error("Buy amount must be an unsigned integer.");
      o.buyLamports = BigInt(value);
    } else if (key !== "execute" && key !== "ack" && key !== "pauseTest") o[key] = value;
  }
  if (dry && o.execute) throw new Error("Choose dry-run OR execute, never both.");
  if (o.execute && !o.ack) throw new Error("Execution requires --execute --ack-devnet.");
  if (o.pauseTest && !o.execute) throw new Error("Pause test requires explicit execution consent.");
  new PublicKey(o.program);
  if (o.wallet) new PublicKey(o.wallet);
  if (o.config) new PublicKey(o.config);
  if (o.pool) new PublicKey(o.pool);
  if (!/^[a-f0-9]{64}$/.test(o.fingerprint))
    throw new Error("A reviewed code fingerprint is required.");
  if (!Number.isSafeInteger(o.maxLamports) || o.maxLamports < 1 || o.maxLamports > 500_000_000)
    throw new Error("Maximum total debit must be 1–500,000,000 lamports.");
  if (o.buyLamports < 1n || o.buyLamports > 100_000_000n)
    throw new Error("Buy amount must be 1–100,000,000 lamports.");
  if (!Number.isInteger(o.slippageBps) || o.slippageBps < 1 || o.slippageBps > 1000)
    throw new Error("Slippage must be 1–1000 bps.");
  return o;
}

export type PublicReceipt = {
  schema: "qli-hook-e2e-v1";
  network: "devnet";
  genesis: string;
  program: string;
  codeFingerprint: string;
  owner: string;
  config: string | null;
  pool: string | null;
  mint: string | null;
  evidence: "DEVNET_DEPLOYED" | "DBC_SWAP_VERIFIED";
  transactions: { kind: Built["kind"]; signature: string; slot: number; messageSha256: string }[];
  simulations: { kind: string; outcome: string; slot: number; code: number | null }[];
  migration: "UNVERIFIED_ISSUE_17";
};

export function validateReceipt(r: PublicReceipt): PublicReceipt {
  if (
    r.schema !== "qli-hook-e2e-v1" ||
    r.network !== "devnet" ||
    r.genesis !== "EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG" ||
    !/^[a-f0-9]{64}$/.test(r.codeFingerprint) ||
    !["DEVNET_DEPLOYED", "DBC_SWAP_VERIFIED"].includes(r.evidence)
  )
    throw new Error("Malformed public receipt.");
  for (const key of [r.program, r.owner, r.config, r.pool, r.mint].filter(Boolean))
    new PublicKey(key as string);
  for (const t of r.transactions) {
    if (
      !/^[1-9A-HJ-NP-Za-km-z]{64,88}$/.test(t.signature) ||
      !Number.isSafeInteger(t.slot) ||
      t.slot < 0 ||
      !/^[a-f0-9]{64}$/.test(t.messageSha256)
    )
      throw new Error("Malformed confirmed transaction receipt.");
  }
  if (
    r.evidence === "DBC_SWAP_VERIFIED" &&
    (!r.pool || !r.mint || !r.transactions.some((t) => t.kind === "dbc-swap"))
  )
    throw new Error("Swap evidence requires confirmed swap and bound pool/mint.");
  // Explicit field reconstruction: extra input fields (including secrets) are never exported.
  return {
    schema: r.schema,
    network: r.network,
    genesis: r.genesis,
    program: r.program,
    codeFingerprint: r.codeFingerprint,
    owner: r.owner,
    config: r.config,
    pool: r.pool,
    mint: r.mint,
    evidence: r.evidence,
    migration: "UNVERIFIED_ISSUE_17",
    transactions: r.transactions.map((t) => ({
      kind: t.kind,
      signature: t.signature,
      slot: t.slot,
      messageSha256: t.messageSha256,
    })),
    simulations: r.simulations.map((s) => ({
      kind: s.kind,
      outcome: s.outcome,
      slot: s.slot,
      code: s.code,
    })),
  };
}

export function assertBudget(estimate: number, actualDebit: number, max: number) {
  if (
    ![estimate, actualDebit, max].every(Number.isSafeInteger) ||
    estimate < 0 ||
    actualDebit < 0 ||
    actualDebit + estimate > max
  )
    throw new Error("Total devnet debit budget exceeded; no signature or send.");
}

/** Used once per reviewed Built; refuses repeat sends even after an ambiguous RPC error. */
export function createSender() {
  const attempted = new WeakSet<Transaction>();
  return async (
    conn: Connection,
    b: Built,
    owner: Keypair,
    hook: PublicKey,
    beforeSign: () => Promise<void>,
  ) => {
    if (attempted.has(b.transaction))
      throw new Error(
        "Transaction already attempted. Reconcile its signature; never resend automatically.",
      );
    await assertDevnet(conn);
    await beforeSign();
    const frozen = Buffer.from(b.reviewedMessage);
    const tx = b.transaction;
    if (!tx.feePayer?.equals(owner.publicKey) || !Buffer.from(tx.serializeMessage()).equals(frozen))
      throw new Error("Reviewed payer/message changed.");
    const expected = [
      owner.publicKey.toBase58(),
      ...(b.ephemeralSigner ? [b.ephemeralSigner] : []),
    ];
    if (requiredSigners(tx).length !== expected.length) throw new Error("Unexpected signer count.");
    verifyTxShape(tx, {
      signers: expected,
      programs: allowedPrograms(hook.toBase58()),
      mustInvoke: [],
    });
    for (const s of tx.signatures) {
      if (!s.publicKey.equals(owner.publicKey) && !s.signature)
        throw new Error("Missing one-time signer.");
    }
    if (!tx.verifySignatures(false)) throw new Error("Invalid partial signature.");
    if (
      !tx.recentBlockhash ||
      (await conn.getBlockHeight("confirmed")) > b.lastValidBlockHeight ||
      !(await conn.isBlockhashValid(tx.recentBlockhash, { commitment: "confirmed" })).value
    )
      throw new Error("Blockhash expired; do not rebuild or retry automatically.");
    // Exact signed bytes will use this blockhash, not a replacement.
    const sim = await conn.simulateTransaction(new VersionedTransaction(tx.compileMessage()), {
      sigVerify: false,
      replaceRecentBlockhash: false,
    });
    if (sim.value.err) throw new Error("Final simulation failed; no signing or sending.");
    if (!Buffer.from(tx.serializeMessage()).equals(frozen))
      throw new Error("Message changed during simulation.");
    const prior = tx.signatures
      .filter((s) => !s.publicKey.equals(owner.publicKey))
      .map((s) => ({ key: s.publicKey, signature: Buffer.from(s.signature ?? []) }));
    tx.partialSign(owner);
    if (
      !Buffer.from(tx.serializeMessage()).equals(frozen) ||
      !tx.verifySignatures(true) ||
      prior.some(
        (s) =>
          !tx.signatures.find((x) => x.publicKey.equals(s.key))?.signature?.equals(s.signature),
      )
    )
      throw new Error("Signed bytes/signatures differ from review.");
    attempted.add(tx);
    const signature = await conn.sendRawTransaction(tx.serialize(), {
      skipPreflight: false,
      maxRetries: 0,
    });
    const confirmed = await conn.confirmTransaction(
      { signature, blockhash: tx.recentBlockhash, lastValidBlockHeight: b.lastValidBlockHeight },
      "confirmed",
    );
    if (confirmed.value.err)
      throw new Error("Confirmed transaction failed. Stop and inspect its public signature.");
    const chain = await conn.getTransaction(signature, {
      commitment: "confirmed",
      maxSupportedTransactionVersion: 0,
    });
    if (
      !chain ||
      !chain.meta ||
      chain.meta.err ||
      chain.transaction.signatures[0] !== signature ||
      !Buffer.from(chain.transaction.message.serialize()).equals(frozen)
    )
      throw new Error("Confirmed transaction bytes unavailable or mismatched. Stop and reconcile.");
    return { signature, slot: chain.slot };
  };
}
