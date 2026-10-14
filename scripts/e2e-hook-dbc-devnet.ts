// Owner-computer only. Default read-only. This file is never imported by the application.
import { realpathSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve, dirname, relative, isAbsolute } from "node:path";
import { createHash } from "node:crypto";
import { createInterface } from "node:readline/promises";
import { fileURLToPath } from "node:url";
import { Connection, Keypair, PublicKey, VersionedTransaction } from "@solana/web3.js";
import {
  assertDevnet,
  assertReviewedCode,
  inspectProgram,
  inspectMint,
  buildSetPolicy,
  classifySimulation,
  DEVNET_GENESIS,
  type Built,
} from "../src/lib/qli-core/hook-devnet";
import {
  DEFAULT_DBC_FORM,
  buildDbcConfig,
  buildDbcPool,
  buildDbcSwap,
  inspectDbcConfig,
  inspectDbcPool,
  simulateDbc,
  migrationReadiness,
} from "../src/lib/qli-core/hook-dbc-devnet";
import {
  parseArgs,
  assertBudget,
  createSender,
  validateReceipt,
  type PublicReceipt,
} from "./hook-e2e-core";

const usage = `QuantumQLi Hook Forge v2.3 — owner-run public devnet only.
Default: --dry-run --program ID --fingerprint REVIEWED_HASH --wallet PUBLIC_KEY
New config/pool: --uri https://YOUR_METADATA_JSON (stored only, never fetched)
Existing state: --config ID --pool ID
Execution: --execute --ack-devnet and QLI_DEVNET_KEYPAIR_PATH outside repository.
Optional: --pause-test (pause → simulate denial → unpause → buy; explicit execution only)
Limits: --max-lamports 100000000 --buy-lamports 1000000 --slippage-bps 100
Output: --output /absolute/public-receipt.json (no keys, no automatic overwrite)
No deployment or migration. Issue #17 remains unverified.`;

function outsideRepo(path: string, root: string) {
  const rel = relative(root, path);
  if (!rel || (!rel.startsWith("..") && !isAbsolute(rel)))
    throw new Error("Local signer must be outside repository.");
}

async function main() {
  if (process.argv.includes("--help")) {
    console.log(usage);
    return;
  }
  const o = parseArgs(process.argv.slice(2));
  const conn = new Connection("https://api.devnet.solana.com", "confirmed");
  await assertDevnet(conn);
  const hook = new PublicKey(o.program);
  const program = await inspectProgram(conn, hook);
  if (!program.executable)
    throw new Error("NOT DEPLOYED: owner must deploy and verify reviewed artifact first.");
  assertReviewedCode(program, o.fingerprint);
  if (program.codeFingerprint !== o.fingerprint)
    throw new Error("Program fingerprint differs from explicitly reviewed hash.");
  let owner: Keypair | null = null;
  if (o.execute) {
    if (!process.stdin.isTTY)
      throw new Error(
        "Execution requires an interactive owner terminal; CI/noninteractive execution refused.",
      );
    const input = process.env["QLI_DEVNET_KEYPAIR_PATH"];
    if (!input)
      throw new Error(
        "Set QLI_DEVNET_KEYPAIR_PATH locally; never provide it through browser or chat.",
      );
    const path = realpathSync(input);
    const root = realpathSync(resolve(dirname(fileURLToPath(import.meta.url)), ".."));
    outsideRepo(path, root);
    // Read only after public network/program gates and explicit execution flags.
    const bytes = JSON.parse(readFileSync(path, "utf8")) as unknown;
    if (
      !Array.isArray(bytes) ||
      bytes.length !== 64 ||
      bytes.some((x) => !Number.isInteger(x) || x < 0 || x > 255)
    )
      throw new Error("Invalid local Solana CLI keypair format; contents are never printed.");
    owner = Keypair.fromSecretKey(Uint8Array.from(bytes));
    bytes.fill(0);
    if (o.wallet && !owner.publicKey.equals(new PublicKey(o.wallet)))
      throw new Error("Local signer differs from reviewed public wallet.");
  }
  const wallet = owner?.publicKey ?? (o.wallet ? new PublicKey(o.wallet) : null);
  if (!wallet) throw new Error("Dry-run requires --wallet PUBLIC_KEY, never a keypair.");
  if (o.execute && program.upgradeAuthority !== wallet.toBase58())
    throw new Error(
      "Owner-run execution requires program upgrade authority to match local signer.",
    );
  const startBalance = await conn.getBalance(wallet, "confirmed");
  const output = resolve(o.output);
  if (o.execute && existsSync(output))
    throw new Error("Receipt output exists; choose a fresh output path.");
  if (!existsSync(dirname(output))) throw new Error("Receipt output directory must already exist.");
  const receipt: PublicReceipt = {
    schema: "qli-hook-e2e-v1",
    network: "devnet",
    genesis: DEVNET_GENESIS,
    program: o.program,
    codeFingerprint: o.fingerprint,
    owner: wallet.toBase58(),
    config: o.config || null,
    pool: o.pool || null,
    mint: null,
    evidence: "DEVNET_DEPLOYED",
    transactions: [],
    simulations: [],
    migration: "UNVERIFIED_ISSUE_17",
  };
  const save = () => {
    if (o.execute)
      writeFileSync(output, JSON.stringify(validateReceipt(receipt), null, 2), { mode: 0o600 });
  };
  save();
  console.log(
    `Mode ${o.execute ? "OWNER EXECUTION" : "READ ONLY"}; balance ${startBalance} lamports; budget ${o.maxLamports}.`,
  );
  const sender = createSender();
  let config = o.config ? new PublicKey(o.config) : null;
  let pool = o.pool ? new PublicKey(o.pool) : null;

  async function freshGate() {
    await assertDevnet(conn);
    const p = await inspectProgram(conn, hook);
    if (
      !p.executable ||
      p.codeFingerprint !== o.fingerprint ||
      (o.execute && p.upgradeAuthority !== wallet?.toBase58())
    )
      throw new Error("Program code/owner changed since review.");
  }

  async function run(b: Built) {
    if (!wallet) throw new Error("Missing public wallet.");
    await freshGate();
    const currentBalance = await conn.getBalance(wallet, "confirmed");
    const actualDebit = Math.max(0, startBalance - currentBalance);
    const estimate = b.estimatedLamports + (b.kind === "dbc-swap" ? Number(o.buyLamports) : 0);
    assertBudget(estimate, actualDebit, o.maxLamports);
    if (currentBalance < estimate)
      throw new Error("Insufficient devnet SOL; use owner faucet, no automated funding.");
    console.log(b.summary.join("\n"));
    console.log(
      `Estimated maximum next debit ${estimate} lamports (rent estimates are not proof).`,
    );
    // Inspect simulated payer balance, not only approximate rent estimates.
    const simulation = await conn.simulateTransaction(
      new VersionedTransaction(b.transaction.compileMessage()),
      {
        sigVerify: false,
        replaceRecentBlockhash: false,
        accounts: { encoding: "base64", addresses: [wallet.toBase58()] },
      },
    );
    const verdict = classifySimulation(
      simulation.value.err,
      simulation.value.logs ?? [],
      simulation.context.slot,
      hook.toBase58(),
    );
    receipt.simulations.push({
      kind: b.kind,
      outcome: verdict.outcome,
      slot: verdict.slot,
      code: verdict.code,
    });
    save();
    if (verdict.outcome !== "allowed") {
      console.log(verdict.note);
      // Public program logs only. No signer/keypair/path or raw thrown payload.
      console.log(
        verdict.logs
          .filter((l) =>
            /^Program (log:|[1-9A-HJ-NP-Za-km-z]+ (invoke|success|failed|consumed))/.test(l),
          )
          .join("\n"),
      );
      throw new Error(
        "Simulation rejected; stopped without sending. Review token badge/metas/size/issue #17.",
      );
    }
    const simulatedPayer = simulation.value.accounts?.[0];
    if (!simulatedPayer)
      throw new Error("Simulated payer balance unavailable; budget cannot be proven.");
    const fees = (await conn.getFeeForMessage(b.transaction.compileMessage(), "confirmed")).value;
    if (fees === null) throw new Error("Fee quote unavailable; stop.");
    assertBudget(
      Math.max(0, currentBalance - simulatedPayer.lamports) + fees,
      actualDebit,
      o.maxLamports,
    );
    if (!o.execute || !owner) {
      console.log("Simulation only. No signatures or chain proof created.");
      return false;
    }
    const prompt = createInterface({ input: process.stdin, output: process.stdout });
    const answer = await prompt.question(
      `Review above. Type SEND ${b.kind} to approve ONE devnet transaction: `,
    );
    prompt.close();
    if (answer !== `SEND ${b.kind}`) throw new Error("Owner declined; no send.");
    const confirmed = await sender(conn, b, owner, hook, freshGate);
    receipt.transactions.push({
      kind: b.kind,
      ...confirmed,
      messageSha256: createHash("sha256").update(b.reviewedMessage).digest("hex"),
    });
    save();
    console.log(`Confirmed ${b.kind}: ${confirmed.signature} @ ${confirmed.slot}`);
    return true;
  }

  try {
    if (!config && !pool) {
      const built = await buildDbcConfig(
        conn,
        wallet,
        hook,
        { ...DEFAULT_DBC_FORM, uri: o.uri },
        o.fingerprint,
      );
      if (!(await run(built))) {
        console.log(
          "STAGED BLOCKER: new config exists only in simulation. Pool/swap cannot read uncommitted state; rerun with confirmed --config/--pool or explicit owner execution.",
        );
        return;
      }
      if (!built.artifacts?.config) throw new Error("Builder returned no config.");
      config = new PublicKey(built.artifacts.config);
      receipt.config = config.toBase58();
      save();
    }
    if (config && !(await inspectDbcConfig(conn, config, hook)).ok)
      throw new Error("Confirmed DBC config/hook binding failed.");
    if (!pool) {
      if (!config) throw new Error("Confirmed config required.");
      const built = await buildDbcPool(
        conn,
        wallet,
        hook,
        config,
        { ...DEFAULT_DBC_FORM, uri: o.uri },
        o.fingerprint,
      );
      if (!(await run(built))) {
        console.log(
          "STAGED BLOCKER: pool/mint are simulated only; swap requires confirmed --pool. No fabricated future state.",
        );
        return;
      }
      if (!built.artifacts?.pool) throw new Error("Builder returned no pool.");
      pool = new PublicKey(built.artifacts.pool);
    }
    const st = await inspectDbcPool(conn, pool, hook);
    if (!st.ok || !st.baseMint) throw new Error("Confirmed pool/mint/hook/PDA binding failed.");
    const mint = new PublicKey(st.baseMint);
    const ms = await inspectMint(conn, mint, hook);
    if (
      ms.config?.authority !== wallet.toBase58() ||
      ms.config.policy.allowlist ||
      ms.config.policy.paused
    )
      throw new Error(
        "Policy must belong to owner and be open; harness never silently overrides existing policy.",
      );
    receipt.pool = pool.toBase58();
    receipt.mint = st.baseMint;
    receipt.config = st.config;
    save();
    if (o.pauseTest) {
      await run(
        await buildSetPolicy(conn, wallet, hook, mint, {
          paused: true,
          allowlist: false,
          allowed: [],
        }),
      );
      try {
        const pausedSwap = await buildDbcSwap(
          conn,
          wallet,
          hook,
          pool,
          o.buyLamports,
          o.slippageBps,
        );
        const denied = await simulateDbc(conn, pausedSwap, hook);
        receipt.simulations.push({
          kind: "paused-buy",
          outcome: denied.outcome,
          slot: denied.slot,
          code: denied.code,
        });
        save();
        if (denied.outcome !== "hook-denied" || denied.code !== 0x5100)
          throw new Error(
            "Expected hook-attributed 0x5100 not observed; pool may remain paused. Owner recovery required.",
          );
        console.log("Hook-attributed 0x5100 observed in SIMULATION ONLY; nothing broadcast.");
      } catch {
        throw new Error(
          "Pause test stopped. Policy may remain paused; explicitly unpause via /hook-devnet. No automatic recovery transaction.",
        );
      }
      await run(
        await buildSetPolicy(conn, wallet, hook, mint, {
          paused: false,
          allowlist: false,
          allowed: [],
        }),
      );
    }
    const swap = await buildDbcSwap(conn, wallet, hook, pool, o.buyLamports, o.slippageBps);
    if (BigInt(swap.quote.minimumAmountOut) <= 0n) throw new Error("Zero minimum output refused.");
    if (await run(swap)) {
      const after = await inspectDbcPool(conn, pool, hook);
      if (!after.ok || after.baseMint !== receipt.mint || after.config !== receipt.config)
        throw new Error("Post-swap pool binding changed; no swap evidence tier.");
      receipt.evidence = "DBC_SWAP_VERIFIED";
      save();
    }
    console.log(JSON.stringify(migrationReadiness(await inspectDbcPool(conn, pool, hook))));
    console.log(
      "Migration NOT executed; issue https://github.com/QuantumQLi/QLi/issues/17. No graduation/post-grad proof claimed.",
    );
  } finally {
    owner?.secretKey.fill(0);
    console.log(
      "Stop on errors. One-time keys are not saved; do not rebuild/retry ambiguous sends. Reconcile public signatures and state first.",
    );
  }
}

main().catch((error) => {
  // Allow only our safe Error messages; never emit paths, stacks or raw RPC/provider payloads.
  const message =
    error instanceof Error && !/https?:|\/|\[|\{|secretKey/.test(error.message)
      ? error.message
      : "Stopped: input/file/RPC or SDK check failed. Inspect public state; no automatic retry.";
  console.error(message);
  process.exitCode = 1;
});
