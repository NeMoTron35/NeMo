import type { Wallet, WalletAccount } from "@wallet-standard/base";
import {
  SolanaSignTransaction,
  type SolanaSignTransactionFeature,
} from "@solana/wallet-standard-features";
import { PublicKey, Transaction, VersionedTransaction, type Connection } from "@solana/web3.js";
function equal(a: Uint8Array, b: Uint8Array) {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}
const genesis = {
  "mainnet-beta": "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp",
  devnet: "EtWTRABZaYq6iMfeYKouRu166VU2xqa1",
};
/** Explicit confirmation only; validates a frozen copy, simulates and returns signed bytes, never submits. */
export async function signReviewedTransaction({
  wallet,
  account,
  connection,
  transaction,
  lastValidBlockHeight,
  network,
  reviewedMessage,
}: {
  wallet: Wallet;
  account: WalletAccount;
  connection: Connection;
  transaction: Transaction;
  lastValidBlockHeight: number;
  network: "mainnet-beta" | "devnet";
  reviewedMessage: Uint8Array;
}) {
  const expected = new Uint8Array(reviewedMessage);
  if (!equal(transaction.serializeMessage(), expected))
    throw new Error("Transaction changed after review. Review again before signing.");
  const frozen = Transaction.from(
    transaction.serialize({ requireAllSignatures: false, verifySignatures: false }),
  );
  const payer = new PublicKey(account.address);
  if (!frozen.feePayer?.equals(payer)) throw new Error("Fee payer differs from connected wallet.");
  if (
    !frozen.recentBlockhash ||
    !Number.isSafeInteger(lastValidBlockHeight) ||
    lastValidBlockHeight < 0
  )
    throw new Error("A fresh blockhash and validity height are required.");
  const chain = network === "devnet" ? "solana:devnet" : "solana:mainnet";
  if (
    !account.chains.includes(chain) ||
    !wallet.accounts.some((a) => a.address === account.address)
  )
    throw new Error("Connected wallet account does not support the selected network.");
  const feature = wallet.features[SolanaSignTransaction] as
    SolanaSignTransactionFeature[typeof SolanaSignTransaction] | undefined;
  if (!feature) throw new Error("Wallet does not support transaction signing.");
  if ((await connection.getGenesisHash()) !== genesis[network])
    throw new Error("RPC network differs from the reviewed network.");
  if ((await connection.getBlockHeight()) > lastValidBlockHeight)
    throw new Error("Blockhash expired. Rebuild and review the transaction.");
  const valid = await connection.isBlockhashValid(frozen.recentBlockhash);
  if (!valid.value) throw new Error("Blockhash expired. Rebuild and review the transaction.");
  const simulation = await connection.simulateTransaction(
    new VersionedTransaction(frozen.compileMessage()),
    { sigVerify: false, replaceRecentBlockhash: false },
  );
  if (simulation.value.err)
    throw new Error(`Simulation failed: ${JSON.stringify(simulation.value.err)}`);
  if ((await connection.getBlockHeight()) > lastValidBlockHeight)
    throw new Error("Blockhash expired during simulation. Rebuild and review.");
  if (
    !equal(transaction.serializeMessage(), expected) ||
    !equal(frozen.serializeMessage(), expected) ||
    !wallet.accounts.some((a) => a.address === account.address)
  )
    throw new Error("Transaction or wallet changed during simulation. Review again.");
  const outputs = await feature.signTransaction({
    account,
    chain,
    transaction: new Uint8Array(
      frozen.serialize({ requireAllSignatures: false, verifySignatures: false }),
    ),
  });
  const output = outputs[0];
  if (outputs.length !== 1 || !output)
    throw new Error("Wallet returned no unique signed transaction.");
  const signed = Transaction.from(output.signedTransaction);
  if (!equal(signed.serializeMessage(), expected))
    throw new Error("Wallet changed the reviewed transaction. Signed bytes rejected.");
  const signature = signed.signatures.find((s) => s.publicKey.equals(payer))?.signature;
  if (!signature || !signed.verifySignatures(false))
    throw new Error("Wallet returned an invalid or missing signature.");
  return new Uint8Array(output.signedTransaction);
}
import { SolanaSignMessage, type SolanaSignMessageFeature } from "@solana/wallet-standard-features";
import { ed25519 } from "@noble/curves/ed25519";
/** Signs the deterministic NEMOTRON3.5 derivation message locally. No transaction. Returned signature stays in memory. */
export async function signDerivationMessage(
  wallet: Wallet,
  account: WalletAccount,
  message: string,
) {
  const feature = wallet.features[SolanaSignMessage] as
    SolanaSignMessageFeature[typeof SolanaSignMessage] | undefined;
  if (!feature) throw new Error("Wallet does not support message signing.");
  const bytes = new TextEncoder().encode(message);
  const [out] = await feature.signMessage({ account, message: bytes });
  if (!out || !equal(out.signedMessage, bytes))
    throw new Error("Wallet signed a different message. Derivation rejected.");
  if (!ed25519.verify(new Uint8Array(out.signature), bytes, new Uint8Array(account.publicKey)))
    throw new Error("Wallet returned an invalid signature.");
  return new Uint8Array(out.signature);
}
