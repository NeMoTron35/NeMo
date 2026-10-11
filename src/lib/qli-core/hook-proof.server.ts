// Server-only adapter for Hook Enforcement Proof v2: server-trusted devnet RPC only,
// bounded reads (≤6 accounts, ≤8 transactions), SDK 1.5.13 coder for DBC decoding. Never signs.
import { Connection, PublicKey } from "@solana/web3.js";
import { getExtraAccountMetaAddress } from "@solana/spl-token";
import { resolveServerRpc } from "./agent-v2-core";
import { base58Decode } from "./launch-proof";
import { type ChainTx, type ProofDecoder, type ProofRpc, verifyHookProof } from "./hook-proof";

const TIMEOUT = 10_000;
const timed = <T>(p: Promise<T>) =>
  Promise.race([
    p,
    new Promise<T>((_, r) => setTimeout(() => r(new Error("rpc timeout")), TIMEOUT)),
  ]);

export function derive(mint: string, hookProgram: string) {
  const m = new PublicKey(mint);
  const h = new PublicKey(hookProgram);
  return {
    extraMetas: getExtraAccountMetaAddress(m, h).toBase58(),
    qliConfig: PublicKey.findProgramAddressSync(
      [new TextEncoder().encode("qli-hook-config"), m.toBytes()],
      h,
    )[0].toBase58(),
  };
}

export function devnetRpc(): ProofRpc {
  const conn = new Connection(
    resolveServerRpc("devnet", process.env["QLI_DEVNET_RPC_URL"]).url,
    "confirmed",
  );
  return {
    derive,
    genesis: () => timed(conn.getGenesisHash()),
    async accounts(a) {
      const r = await timed(
        conn.getMultipleAccountsInfoAndContext(
          a.map((x) => new PublicKey(x)),
          "confirmed",
        ),
      );
      return {
        slot: r.context.slot,
        values: r.value.map((v) =>
          v
            ? { owner: v.owner.toBase58(), executable: v.executable, data: new Uint8Array(v.data) }
            : null,
        ),
      };
    },
    async transaction(sig): Promise<ChainTx | null> {
      const [tx, st] = await Promise.all([
        timed(
          conn.getTransaction(sig, { commitment: "confirmed", maxSupportedTransactionVersion: 0 }),
        ),
        timed(conn.getSignatureStatuses([sig])),
      ]);
      if (!tx || !tx.meta || tx.transaction.signatures[0] !== sig) return null;
      const keys = tx.transaction.message
        .getAccountKeys({ accountKeysFromLookups: tx.meta.loadedAddresses ?? null })
        .keySegments()
        .flat()
        .map((k) => k.toBase58());
      const msg = tx.transaction.message;
      const map = (ix: { programIdIndex: number; accounts: number[]; data: Uint8Array }) => ({
        programId: keys[ix.programIdIndex] ?? "",
        accounts: ix.accounts.map((i) => keys[i] ?? ""),
        data: ix.data,
      });
      const instructions = [
        ...msg.compiledInstructions.map((ix) =>
          map({
            programIdIndex: ix.programIdIndex,
            accounts: [...ix.accountKeyIndexes],
            data: new Uint8Array(ix.data),
          }),
        ),
        ...(tx.meta.innerInstructions ?? []).flatMap((g) =>
          g.instructions.map((ix) =>
            map({
              programIdIndex: ix.programIdIndex,
              accounts: ix.accounts,
              data: base58Decode(ix.data),
            }),
          ),
        ),
      ];
      return {
        slot: tx.slot,
        err: tx.meta.err,
        confirmation: st.value[0]?.confirmationStatus ?? null,
        accountKeys: keys,
        logs: (tx.meta.logMessages ?? []).slice(0, 400),
        instructions,
      };
    },
  };
}

export async function sdkDecoder(): Promise<ProofDecoder> {
  const { decodePoolStateAny, decodeDbcIxName } = await import("./lifecycle-sdk");
  return { poolState: decodePoolStateAny, dbcIxName: decodeDbcIxName };
}

export async function runHookProof(input: unknown) {
  return verifyHookProof(input, devnetRpc(), await sdkDecoder());
}