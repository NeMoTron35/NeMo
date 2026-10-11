// LOCAL-VALIDATOR end-to-end check of the compiled SBF research hook using the same browser
// builders as /hook-devnet (src/lib/qli-core/hook-devnet.ts). Local only: requires
//   solana-test-validator --upgradeable-program <PID> target/deploy/quantum_transfer_hook.so none
//   QLI_HOOK_LOCAL_PID=<PID> bun scripts/e2e-transfer-hook-localnet.ts
// The payer is an in-memory throwaway keypair funded by local airdrop. The builders refuse non-devnet
// genesis, so this harness (and only this harness) reports the devnet genesis for 127.0.0.1.
import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey, Transaction } from "@solana/web3.js";
import {
  DEVNET_GENESIS,
  buildCreateMint,
  buildSetPolicy,
  buildTransfer,
  inspectMint,
  inspectProgram,
  setPolicyInstruction,
  simulateBuilt,
  type Built,
} from "../src/lib/qli-core/hook-devnet";

const url = process.env["QLI_HOOK_LOCAL_RPC"] ?? "http://127.0.0.1:8899";
if (!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(url)) throw new Error("Local validator only.");
const pid = new PublicKey(process.env["QLI_HOOK_LOCAL_PID"] ?? "");
const conn = new Connection(url, "confirmed");
conn.getGenesisHash = async () => DEVNET_GENESIS; // local harness only
const results: [string, boolean, string][] = [];
const check = (name: string, ok: boolean, detail = "") => {
  results.push([name, ok, detail]);
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? " — " + detail : ""}`);
};

async function send(b: Built, payer: Keypair) {
  const tx = Transaction.from(
    b.transaction.serialize({ requireAllSignatures: false, verifySignatures: false }),
  );
  tx.partialSign(payer);
  const sig = await conn.sendRawTransaction(tx.serialize());
  await conn.confirmTransaction(
    {
      signature: sig,
      blockhash: tx.recentBlockhash!,
      lastValidBlockHeight: b.lastValidBlockHeight,
    },
    "confirmed",
  );
  const st = await conn.getSignatureStatus(sig);
  if (st.value?.err) throw new Error(JSON.stringify(st.value.err));
  return sig;
}

const payer = Keypair.generate();
const other = Keypair.generate();
await conn.confirmTransaction(
  await conn.requestAirdrop(payer.publicKey, 5 * LAMPORTS_PER_SOL),
  "confirmed",
);
await conn.confirmTransaction(
  await conn.requestAirdrop(other.publicKey, LAMPORTS_PER_SOL),
  "confirmed",
);

const prog = await inspectProgram(conn, pid);
check(
  "program executable via upgradeable loader",
  prog.executable && prog.upgradeAuthority !== null,
);

const open = { paused: false, allowlist: false, allowed: [] as string[] };
const cm = await buildCreateMint(conn, payer.publicKey, pid, {
  decimals: 6,
  supply: 1_000_000n,
  policy: open,
});
check("create-mint simulation allowed", (await simulateBuilt(conn, cm, pid)).outcome === "allowed");
await send(cm, payer);
const mint = new PublicKey(cm.ephemeralSigner!);
const ms = await inspectMint(conn, mint, pid);
check(
  "mint/hook/metas/config verified",
  ms.hookProgram === pid.toBase58() &&
    ms.extraMetasOwned &&
    ms.config?.authority === payer.publicKey.toBase58(),
);

const t1 = await buildTransfer(conn, payer.publicKey, pid, mint, other.publicKey, 10n);
check(
  "unpaused transfer simulated allowed",
  (await simulateBuilt(conn, t1, pid)).outcome === "allowed",
);
await send(t1, payer);
check("unpaused transfer confirmed", true);

// Unauthorized pause: another wallet signs set_policy.
{
  const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash();
  const tx = new Transaction({ feePayer: other.publicKey, blockhash, lastValidBlockHeight }).add(
    setPolicyInstruction(pid, other.publicKey, mint, { ...open, paused: true }),
  );
  const v = await simulateBuilt(
    conn,
    {
      kind: "set-policy",
      transaction: tx,
      reviewedMessage: tx.serializeMessage(),
      lastValidBlockHeight,
      summary: [],
      estimatedLamports: 0,
    },
    pid,
  );
  check(
    "unauthorized pause refused 0x5108",
    v.outcome === "hook-denied" && v.code === 0x5108,
    v.note,
  );
}

await send(
  await buildSetPolicy(conn, payer.publicKey, pid, mint, { ...open, paused: true }),
  payer,
);
const t2 = await buildTransfer(conn, payer.publicKey, pid, mint, other.publicKey, 10n);
const v2 = await simulateBuilt(conn, t2, pid);
check(
  "paused transfer refused 0x5100 (simulation)",
  v2.outcome === "hook-denied" && v2.code === 0x5100,
  v2.note,
);

await send(
  await buildSetPolicy(conn, payer.publicKey, pid, mint, {
    paused: false,
    allowlist: true,
    allowed: [payer.publicKey.toBase58()],
  }),
  payer,
);
const v3 = await simulateBuilt(
  conn,
  await buildTransfer(conn, payer.publicKey, pid, mint, other.publicKey, 1n),
  pid,
);
check(
  "non-allowlisted receiver refused 0x5101 (simulation)",
  v3.outcome === "hook-denied" && v3.code === 0x5101,
  v3.note,
);

await send(await buildSetPolicy(conn, payer.publicKey, pid, mint, open), payer);
await send(await buildTransfer(conn, payer.publicKey, pid, mint, other.publicKey, 5n), payer);
const after = await inspectMint(conn, mint, pid);
check("unpaused again and transfer confirmed", after.config?.policy.paused === false);

const failed = results.filter((r) => !r[1]).length;
console.log(
  `\n${results.length - failed} passed, ${failed} failed (local validator, compiled SBF binary)`,
);
if (failed) throw new Error(`${failed} local hook checks failed`);
export const LOCAL_RESULTS = results;