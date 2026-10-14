import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Connection, LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import { Button } from "@/components/ui/button";
import { useConsole } from "@/lib/qli-core/context";
import { useWalletDialog } from "@/components/qli/wallet-dialog-context";
import { signReviewedTransaction } from "@/lib/qli-core/wallet";
import { explainTransactionError } from "@/lib/qli-core/dbc";
import { isAddress } from "@/lib/qli-core/launch-proof";
import { Panel, Field, PageHeading } from "./controls";
import {
  DBC_HOOK_NOTES,
  KNOWN_HOOK_BUILDS,
  DEVNET_GENESIS,
  explorerAddress,
  explorerTx,
  validatePolicy,
  type Policy,
} from "@/lib/qli-core/hook-devnet-core";
import type { DbcConfigStatus } from "@/lib/qli-core/hook-dbc-devnet";
import {
  DEFAULT_DBC_FORM,
  migrationReadiness,
  validateDbcForm as validateForm,
  type DbcHookForm,
  type DbcPoolStatus,
} from "@/lib/qli-core/hook-dbc-core";
import type {
  Built,
  Check,
  MintStatus,
  ProgramStatus,
  SimVerdict,
} from "@/lib/qli-core/hook-devnet";

// Token-2022 helpers load only on interaction (CommonJS deps cannot run during SSR).
const lib = () => import("@/lib/qli-core/hook-devnet");
const dbcLib = () => import("@/lib/qli-core/hook-dbc-devnet");
const KNOWN_FPS = KNOWN_HOOK_BUILDS.map((b) => b.fingerprint);
const DEFAULT_FORM: DbcHookForm = DEFAULT_DBC_FORM;

const KEY = "qli.hook-devnet.v1";
type Receipt = { kind: string; signature: string; slot: number | null; at: number };
type Saved = {
  hook: string;
  mint: string;
  receipts: Receipt[];
  fp?: string;
  dbcConfig?: string;
  dbcPool?: string;
};

function Badge({ ok }: { ok: boolean | null }) {
  return (
    <span className={`hd-badge ${ok === true ? "ok" : ok === false ? "bad" : "info"}`}>
      {ok === true ? "VERIFIED" : ok === false ? "NOT MET" : "INFO"}
    </span>
  );
}
function Checks({ list }: { list: Check[] }) {
  return (
    <ul className="hd-checks">
      {list.map((c, i) => (
        <li key={i}>
          <Badge ok={c.ok} /> <b>{c.label}</b> — {c.detail}
          {c.source ? <span className="micro"> · {c.source}</span> : null}
        </li>
      ))}
    </ul>
  );
}

export function HookDevnetConsole() {
  const c = useConsole();
  const openWallet = useWalletDialog();
  const [hook, setHook] = useState("");
  const [mint, setMint] = useState("");
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [genesis, setGenesis] = useState<"checking" | "ok" | "bad" | "error">("checking");
  const [balance, setBalance] = useState<number | null>(null);
  const [prog, setProg] = useState<ProgramStatus | null>(null);
  const [mintS, setMintS] = useState<MintStatus | null>(null);
  const [policy, setPolicy] = useState<Policy>({ paused: false, allowlist: false, allowed: [] });
  const [allowText, setAllowText] = useState("");
  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("1");
  const [built, setBuilt] = useState<Built | null>(null);
  const [sim, setSim] = useState<SimVerdict | null>(null);
  const [ack, setAck] = useState(false);
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState("");
  const [fp, setFp] = useState("");
  const [form, setForm] = useState<DbcHookForm>(DEFAULT_FORM);
  const [dbcConfig, setDbcConfig] = useState("");
  const [dbcPool, setDbcPool] = useState("");
  const [cfgS, setCfgS] = useState<DbcConfigStatus | null>(null);
  const [poolS, setPoolS] = useState<DbcPoolStatus | null>(null);
  const [swapLamports, setSwapLamports] = useState("1000000");
  const [slippage, setSlippage] = useState("100");
  const inFlight = useRef(false);

  const isDevnet = c.network === "devnet";
  const conn = () => new Connection(c.rpc, "confirmed");
  const wallet = c.account?.address ?? null;

  // Per-tab session state only (addresses + public receipts). Never keys.
  useEffect(() => {
    try {
      const s = JSON.parse(window.sessionStorage.getItem(KEY) ?? "null") as Saved | null;
      if (s && typeof s.hook === "string") {
        setHook(s.hook);
        setMint(typeof s.mint === "string" ? s.mint : "");
        setReceipts(Array.isArray(s.receipts) ? s.receipts.slice(0, 20) : []);
        setFp(typeof s.fp === "string" ? s.fp : "");
        setDbcConfig(typeof s.dbcConfig === "string" ? s.dbcConfig : "");
        setDbcPool(typeof s.dbcPool === "string" ? s.dbcPool : "");
      }
    } catch {
      /* ignore malformed session state */
    }
    setLoaded(true);
  }, []);
  useEffect(() => {
    if (!loaded) return;
    window.sessionStorage.setItem(
      KEY,
      JSON.stringify({ hook, mint, receipts, fp, dbcConfig, dbcPool } satisfies Saved),
    );
  }, [hook, mint, receipts, loaded, fp, dbcConfig, dbcPool]);

  useEffect(() => {
    if (!isDevnet) return;
    let live = true;
    setGenesis("checking");
    conn()
      .getGenesisHash()
      .then((g) => live && setGenesis(g === DEVNET_GENESIS ? "ok" : "bad"))
      .catch(() => live && setGenesis("error"));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [c.rpc, isDevnet]);

  useEffect(() => {
    if (!wallet || !isDevnet) return setBalance(null);
    conn()
      .getBalance(new PublicKey(wallet), "confirmed")
      .then(setBalance)
      .catch(() => setBalance(null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wallet, isDevnet, c.rpc, receipts.length]);

  // Any input change discards a built review.
  useEffect(() => {
    setBuilt(null);
    setSim(null);
    setAck(false);
  }, [
    hook,
    mint,
    recipient,
    amount,
    wallet,
    c.network,
    policy,
    fp,
    form,
    dbcConfig,
    dbcPool,
    swapLamports,
    slippage,
  ]);

  async function guard(label: string, f: () => Promise<void>): Promise<void> {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(label);
    setMsg("");
    try {
      await f();
    } catch (e) {
      setMsg(explainTransactionError(e));
    } finally {
      inFlight.current = false;
      setBusy("");
    }
  }

  const checkProgram = () =>
    guard("program", async () => {
      setProg(await (await lib()).inspectProgram(conn(), new PublicKey(hook.trim())));
    });
  const checkMint = () =>
    guard("mint", async () => {
      const s = await (
        await lib()
      ).inspectMint(conn(), new PublicKey(mint.trim()), new PublicKey(hook.trim()));
      setMintS(s);
      if (s.config) {
        setPolicy(s.config.policy);
        setAllowText(s.config.policy.allowed.join("\n"));
      }
    });

  const checkDbcConfig = () =>
    guard("dbc-cfg-read", async () => {
      setCfgS(
        await (
          await dbcLib()
        ).inspectDbcConfig(conn(), new PublicKey(dbcConfig.trim()), new PublicKey(hook.trim())),
      );
    });
  const checkDbcPool = () =>
    guard("dbc-pool-read", async () => {
      setPoolS(
        await (
          await dbcLib()
        ).inspectDbcPool(conn(), new PublicKey(dbcPool.trim()), new PublicKey(hook.trim())),
      );
    });
  const editPolicy = (p: Partial<Policy>, text = allowText) => {
    const allowed = text
      .split(/[\s,]+/)
      .map((x) => x.trim())
      .filter(Boolean);
    setPolicy((o) => ({ ...o, ...p, allowed }));
  };
  const policyErr = validatePolicy(policy);
  const provenance = (() => {
    if (!prog?.codeFingerprint) return "unknown-third-party";
    const e = fp.trim().toLowerCase();
    if (KNOWN_FPS.includes(prog.codeFingerprint)) return "known-qli-build";
    return /^[0-9a-f]{64}$/.test(e) && e === prog.codeFingerprint
      ? "owner-reviewed-build"
      : "unknown-third-party";
  })();
  const progOk = !!prog?.executable && prog.loader !== null && provenance !== "unknown-third-party";
  const mintOk =
    !!mintS &&
    mintS.hookProgram === hook.trim() &&
    mintS.extraMetasOwned &&
    !!mintS.config &&
    mintS.config.mint === mint.trim();
  const formErrs = validateForm(form);
  const readiness = poolS ? migrationReadiness(poolS) : null;
  const isAuthority = !!mintS?.config && mintS.config.authority === wallet;

  const build = (kind: Built["kind"]) =>
    guard(kind, async () => {
      if (!wallet) throw new Error("Connect a wallet first.");
      const cn = conn();
      const payer = new PublicKey(wallet);
      const h = new PublicKey(hook.trim());
      const h2 = h;
      const sl = kind.startsWith("dbc-") ? await dbcLib() : null;
      const b =
        sl && kind === "dbc-config"
          ? await sl.buildDbcConfig(cn, payer, h2, form, fp)
          : sl && kind === "dbc-pool"
            ? await sl.buildDbcPool(cn, payer, h2, new PublicKey(dbcConfig.trim()), form, fp)
            : sl && kind === "dbc-swap"
              ? await sl.buildDbcSwap(
                  cn,
                  payer,
                  h2,
                  new PublicKey(dbcPool.trim()),
                  BigInt(swapLamports || "0"),
                  Number(slippage),
                )
              : sl && kind === "dbc-migrate"
                ? await sl.buildDbcMigration(cn, payer, h2, new PublicKey(dbcPool.trim()))
                : kind === "create-mint"
                  ? await (
                      await lib()
                    ).buildCreateMint(cn, payer, h, {
                      decimals: 6,
                      supply: 1_000_000_000n,
                      policy,
                      expectedFingerprint: fp,
                    })
                  : kind === "set-policy"
                    ? await (
                        await lib()
                      ).buildSetPolicy(cn, payer, h, new PublicKey(mint.trim()), policy)
                    : await (
                        await lib()
                      ).buildTransfer(
                        cn,
                        payer,
                        h,
                        new PublicKey(mint.trim()),
                        new PublicKey(recipient.trim()),
                        BigInt(amount || "0"),
                      );
      setBuilt(b);
      setSim(await (await lib()).simulateBuilt(cn, b, h));
    });

  const signAndSend = () =>
    guard("send", async () => {
      if (!built || !c.wallet || !c.account || !ack) return;
      if (sim?.outcome !== "allowed")
        throw new Error(
          "Simulation did not succeed; this console never sends known-to-fail transactions.",
        );
      const cn = conn();
      const signed = await signReviewedTransaction({
        wallet: c.wallet,
        account: c.account,
        connection: cn,
        transaction: built.transaction,
        lastValidBlockHeight: built.lastValidBlockHeight,
        network: "devnet",
        reviewedMessage: built.reviewedMessage,
      });
      const sig = await cn.sendRawTransaction(signed, { skipPreflight: false, maxRetries: 3 });
      const conf = await cn.confirmTransaction(
        {
          signature: sig,
          blockhash: built.transaction.recentBlockhash!,
          lastValidBlockHeight: built.lastValidBlockHeight,
        },
        "confirmed",
      );
      if (conf.value.err)
        throw new Error(`Transaction failed on-chain: ${JSON.stringify(conf.value.err)}`);
      const st = await cn.getSignatureStatus(sig);
      setReceipts((r) =>
        [
          { kind: built.kind, signature: sig, slot: st.value?.slot ?? null, at: Date.now() },
          ...r,
        ].slice(0, 20),
      );
      c.log(
        `Hook devnet ${built.kind} confirmed · ${sig.slice(0, 8)}…`,
        "Hook Forge",
        "devnet",
        `On-chain · Solana devnet · signature ${sig}`,
      );
      if (built.kind === "create-mint" && built.ephemeralSigner) setMint(built.ephemeralSigner);
      if (built.kind === "dbc-config" && built.artifacts?.config)
        setDbcConfig(built.artifacts.config);
      if (built.kind === "dbc-pool" && built.artifacts?.pool) {
        setDbcPool(built.artifacts.pool);
        if (built.artifacts.mint) setMint(built.artifacts.mint);
      }
      setBuilt(null);
      setSim(null);
      setAck(false);
      // Re-read state after confirmation.
      if (built.kind === "set-policy" || built.kind === "transfer") {
        const s = await (
          await lib()
        ).inspectMint(cn, new PublicKey(mint.trim()), new PublicKey(hook.trim()));
        setMintS(s);
      }
    });

  const step = (n: number, title: string, state: boolean | null, body: React.ReactNode) => (
    <Panel
      title={`${n}. ${title}`}
      tag={state === true ? "VERIFIED" : state === false ? "BLOCKED" : "PENDING"}
    >
      <div className="instrument-body hd-step">{body}</div>
    </Panel>
  );

  return (
    <div>
      <PageHeading
        eyebrow="QLi HOOK FORGE / DEVNET CONSOLE"
        title="QuantumQLi Hook Devnet Console"
        description="Devnet-only activation of the research transfer hook: verify your deployed program, create a Token-2022 mint bound to it, toggle the policy and run transfers. Every transaction is wallet-approved; nothing is sent automatically."
        action={
          <span>
            <Link to="/hook-forge" className="desk-link">
              Hook Forge
            </Link>{" "}
            <Link to="/hook-proofs" className="desk-link">
              Hook Proofs
            </Link>
          </span>
        }
      />
      <div className="settings-stack">
        <Panel
          title="v2.3 · Owner activation"
          tag={prog?.codeFingerprint ? "CHECK PROGRAM" : "NOT DEPLOYED / UNVERIFIED"}
        >
          <div className="instrument-body hd-step">
            <p>
              Unsigned research artifact:{" "}
              <a
                className="desk-link"
                href="https://github.com/QuantumQLi/QLi/actions"
                target="_blank"
                rel="noreferrer"
              >
                GitHub Actions · PR #16
              </a>
              . Latest build status and digest are unverified here. Download the reviewed v2.2 .so
              plus .sha256; old v2.1 binaries cannot initialize DBC policy.
            </p>
            <Field
              label="Owner-only deploy command"
              hint="Replace artifact paths locally. Never share wallet or program keypairs."
            >
              <textarea
                readOnly
                rows={4}
                value={
                  "QLI_HOOK_SO=/absolute/quantum_transfer_hook.so QLI_HOOK_SHA256=/absolute/quantum_transfer_hook.so.sha256 bash scripts/deploy-transfer-hook-devnet.sh ~/qli-hook-program.json"
                }
              />
            </Field>
            <Button
              variant="outline"
              onClick={() =>
                guard("copy-deploy", async () => {
                  await navigator.clipboard.writeText(
                    "QLI_HOOK_SO=/absolute/quantum_transfer_hook.so QLI_HOOK_SHA256=/absolute/quantum_transfer_hook.so.sha256 bash scripts/deploy-transfer-hook-devnet.sh ~/qli-hook-program.json",
                  );
                  setMsg("Owner deployment command copied.");
                })
              }
            >
              Copy deploy command
            </Button>
            <p className="micro">
              File SHA256 checks the entire .so. Code fingerprint checks on-chain ProgramData with
              trailing zero padding removed. Neither is an audit.
            </p>
            <ol>
              <li>
                Verify checksum → owner deployment → step 2 program and upgrade-authority check.
              </li>
              <li>
                Phantom on Devnet →{" "}
                <a
                  className="desk-link"
                  href="https://faucet.solana.com"
                  target="_blank"
                  rel="noreferrer"
                >
                  test SOL faucet
                </a>{" "}
                → 8a config → 8b pool → 8c reviewed buy.
              </li>
              <li>
                Local CLI alternative: <code>bash scripts/e2e-hook-dbc-devnet.sh --help</code>.
                Defaults to read-only; execution requires a local signer and approval for each
                transaction.
              </li>
            </ol>
            <details>
              <summary>Troubleshooting</summary>
              <ul>
                <li>
                  Wallet mismatch: enable Phantom Testnet mode and select Solana Devnet. RPC genesis
                  must match.
                </li>
                <li>
                  Insufficient SOL: use the devnet faucet; rent and fee figures are estimates.
                </li>
                <li>
                  Hook not executed or missing metas: verify mint extension, policy and
                  ExtraAccountMetaList. Never substitute another program.
                </li>
                <li>
                  1232-byte limit or token badge rejection: stop at simulation and inspect exact
                  SDK/accounts.
                </li>
                <li>
                  DAMM migration may omit hook accounts.{" "}
                  <a
                    className="desk-link"
                    href="https://github.com/QuantumQLi/QLi/issues/17"
                    target="_blank"
                    rel="noreferrer"
                  >
                    Issue #17
                  </a>{" "}
                  remains unverified; never disable the hook to manufacture proof.
                </li>
              </ul>
            </details>
          </div>
        </Panel>
        <div className="cs-banner" role="note">
          <b>Research, not audited, devnet only.</b> A transfer hook runs only on Token-2022
          transfers. It is not a swap callback and cannot enforce fee or liquidity settings. Mainnet
          is refused.
        </div>

        {step(
          1,
          "Network and wallet",
          isDevnet && genesis === "ok" && !!wallet
            ? true
            : !isDevnet || genesis === "bad"
              ? false
              : null,
          <>
            <p>
              Network: <b>{c.network}</b> · RPC genesis:{" "}
              <b>{!isDevnet ? "not checked (switch to devnet)" : genesis}</b>
            </p>
            {!isDevnet ? (
              <Button onClick={() => c.setNetwork("devnet")}>Switch to devnet</Button>
            ) : null}
            <p>
              Wallet: <b>{wallet ?? "not connected"}</b>
              {wallet ? null : (
                <>
                  {" "}
                  <Button variant="outline" onClick={openWallet}>
                    Connect wallet
                  </Button>
                </>
              )}
            </p>
            <p>
              Devnet balance:{" "}
              <b>{balance === null ? "—" : `${(balance / LAMPORTS_PER_SOL).toFixed(4)} SOL`}</b>
              {balance !== null && balance < 0.05 * LAMPORTS_PER_SOL ? (
                <span className="hd-warn">
                  {" "}
                  Under 0.05 SOL. Use faucet.solana.com (devnet) for test SOL.
                </span>
              ) : null}
            </p>
            <p className="micro">
              In your wallet, select Solana Devnet too (Phantom: Settings → Developer settings →
              Testnet mode).
            </p>
          </>,
        )}

        {step(
          2,
          "Hook program on devnet",
          prog ? progOk : null,
          <>
            <Field
              label="Your deployed hook program id"
              hint="Deploy with scripts/deploy-transfer-hook-devnet.sh on your own computer."
            >
              <input
                value={hook}
                onChange={(e) => {
                  setHook(e.target.value);
                  setProg(null);
                  setMintS(null);
                }}
              />
            </Field>
            <Field
              label="Your reviewed build fingerprint (optional)"
              hint="Printed by scripts/build-transfer-hook-sbf.sh as 'code fingerprint'. Required unless the program matches a listed QLi build."
            >
              <input value={fp} onChange={(e) => setFp(e.target.value)} spellCheck={false} />
            </Field>
            <Button
              disabled={!isDevnet || !isAddress(hook.trim()) || !!busy}
              onClick={checkProgram}
            >
              {busy === "program" ? "Checking…" : "Check program"}
            </Button>
            {prog ? (
              <>
                <Checks list={prog.checks} />
                <a
                  className="desk-link"
                  href={explorerAddress(hook.trim())}
                  target="_blank"
                  rel="noreferrer"
                >
                  Explorer
                </a>
              </>
            ) : null}
            {prog ? (
              <p className={provenance === "unknown-third-party" ? "hd-warn" : "micro"}>
                Provenance:{" "}
                <b>
                  {provenance === "known-qli-build"
                    ? "Listed QLi build"
                    : provenance === "owner-reviewed-build"
                      ? "Matches your reviewed build"
                      : "UNKNOWN THIRD-PARTY code"}
                </b>
                {provenance === "unknown-third-party"
                  ? " — new mints and pools stay disabled. Enter the fingerprint of the build you reviewed and deployed."
                  : null}
              </p>
            ) : null}
            {prog && !prog.executable ? (
              <p className="hd-warn">
                Program deployment required. Mint creation stays disabled until the program is
                executable.
              </p>
            ) : null}
          </>,
        )}

        {step(
          3,
          "Policy",
          policyErr ? false : null,
          <>
            <label className="hd-row">
              <input
                type="checkbox"
                checked={policy.paused}
                onChange={(e) => editPolicy({ paused: e.target.checked })}
              />{" "}
              Paused (refuse every transfer)
            </label>
            <label className="hd-row">
              <input
                type="checkbox"
                checked={policy.allowlist}
                onChange={(e) => editPolicy({ allowlist: e.target.checked })}
              />{" "}
              Receiver allowlist
            </label>
            {policy.allowlist ? (
              <Field
                label="Allowed receiver wallets (1–8)"
                hint="Pool and vault accounts owned by programs would be refused. Keep allowlist off for DBC/DAMM tests."
              >
                <textarea
                  rows={3}
                  value={allowText}
                  onChange={(e) => {
                    setAllowText(e.target.value);
                    editPolicy({}, e.target.value);
                  }}
                />
              </Field>
            ) : null}
            {policyErr ? <p className="hd-warn">{policyErr}</p> : null}
          </>,
        )}

        {step(
          4,
          "Create Token-2022 mint bound to the hook",
          mintOk ? true : null,
          <>
            <p>
              One transaction: new mint with TransferHook → your program, policy and
              ExtraAccountMetaList initialization, your token account and 1,000 test tokens (6
              decimals). The one-time mint key exists only in this tab's memory and signs before
              your wallet; it is never stored.
            </p>
            <Button
              disabled={!progOk || !wallet || !!policyErr || genesis !== "ok" || !!busy}
              onClick={() => build("create-mint")}
            >
              {busy === "create-mint" ? "Building…" : "Build and simulate"}
            </Button>
          </>,
        )}

        {step(
          5,
          "Verify mint, metas and policy",
          mintS ? mintOk : null,
          <>
            <Field label="Token-2022 mint">
              <input
                value={mint}
                onChange={(e) => {
                  setMint(e.target.value);
                  setMintS(null);
                }}
              />
            </Field>
            <Button
              disabled={!isDevnet || !isAddress(mint.trim()) || !isAddress(hook.trim()) || !!busy}
              onClick={checkMint}
            >
              {busy === "mint" ? "Reading…" : "Read on-chain state"}
            </Button>
            {mintS ? <Checks list={mintS.checks} /> : null}
          </>,
        )}

        {step(
          6,
          "Set policy (pause / unpause)",
          mintS?.config ? isAuthority : null,
          <>
            {mintS?.config && !isAuthority ? (
              <p className="hd-warn">
                Connected wallet is not the policy authority ({mintS.config.authority}).
              </p>
            ) : null}
            <Button
              disabled={!mintOk || !isAuthority || !!policyErr || !!busy}
              onClick={() => build("set-policy")}
            >
              {busy === "set-policy" ? "Building…" : `Build: paused=${policy.paused}`}
            </Button>
          </>,
        )}

        {step(
          7,
          "Transfer test",
          null,
          <>
            <Field label="Recipient wallet">
              <input value={recipient} onChange={(e) => setRecipient(e.target.value)} />
            </Field>
            <Field label="Amount (atomic units)">
              <input
                inputMode="numeric"
                value={amount}
                onChange={(e) => setAmount(e.target.value.replace(/\D/g, ""))}
              />
            </Field>
            <Button
              disabled={!mintOk || !wallet || !isAddress(recipient.trim()) || !amount || !!busy}
              onClick={() => build("transfer")}
            >
              {busy === "transfer" ? "Building…" : "Build and simulate transfer"}
            </Button>
            <p className="micro">
              Walkthrough: set paused=true → simulate transfer (expect hook 0x5100) → set
              paused=false → send transfer → read state.
            </p>
          </>,
        )}

        {built ? (
          <Panel title="Review" tag={built.kind.toUpperCase()}>
            <div className="instrument-body">
              <ul>
                {built.summary.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
              <p>
                Estimated cost: {(built.estimatedLamports / LAMPORTS_PER_SOL).toFixed(6)} SOL (fee +
                rent, estimate).
              </p>
              {sim ? (
                <div className={`hd-sim ${sim.outcome}`} role="status">
                  <b>
                    {sim.outcome === "allowed"
                      ? "Simulation succeeded"
                      : sim.outcome === "hook-denied"
                        ? "Hook refused (simulation only)"
                        : "Simulation failed"}
                  </b>{" "}
                  — {sim.note} Slot {sim.slot}.
                  <details>
                    <summary>Logs</summary>
                    <pre>{sim.logs.join("\n")}</pre>
                  </details>
                </div>
              ) : null}
              {sim?.outcome === "allowed" ? (
                <>
                  <label className="hd-row">
                    <input
                      type="checkbox"
                      checked={ack}
                      onChange={(e) => setAck(e.target.checked)}
                    />{" "}
                    I reviewed this devnet transaction.
                  </label>
                  <Button disabled={!ack || !!busy} onClick={signAndSend}>
                    {busy === "send" ? "Waiting for wallet…" : "Sign in wallet and send once"}
                  </Button>
                </>
              ) : (
                <p className="micro">
                  Not sendable: this console never broadcasts transactions that fail simulation. A
                  simulated refusal is not on-chain proof.
                </p>
              )}
            </div>
          </Panel>
        ) : null}

        {msg ? (
          <div className="cs-banner hd-warn" role="alert">
            {msg}
          </div>
        ) : null}

        {step(
          8,
          "Meteora DBC TransferHookPool and swap",
          poolS ? poolS.ok : null,
          <>
            <ul className="micro">
              {DBC_HOOK_NOTES.map((b, i) => (
                <li key={i}>{b}</li>
              ))}
            </ul>
            <p>
              <b>8a. Config.</b> Token-2022 base, SOL quote, fixed fee, DAMM v2 migration, no first
              buy.
            </p>
            <Field label="Name">
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </Field>
            <Field label="Symbol">
              <input
                value={form.symbol}
                onChange={(e) => setForm({ ...form, symbol: e.target.value.toUpperCase() })}
              />
            </Field>
            <Field
              label="Metadata URI (https)"
              hint="Stored as text; this console never fetches it. Host your own JSON."
            >
              <input value={form.uri} onChange={(e) => setForm({ ...form, uri: e.target.value })} />
            </Field>
            <Field label="Initial / migration market cap (SOL)">
              <span className="hd-row">
                <input
                  inputMode="decimal"
                  aria-label="Initial market cap"
                  value={form.initialMarketCap}
                  onChange={(e) => setForm({ ...form, initialMarketCap: Number(e.target.value) })}
                />
                <input
                  inputMode="decimal"
                  aria-label="Migration market cap"
                  value={form.migrationMarketCap}
                  onChange={(e) => setForm({ ...form, migrationMarketCap: Number(e.target.value) })}
                />
              </span>
            </Field>
            <Field label="Trading fee (bps)">
              <input
                inputMode="numeric"
                value={form.feeBps}
                onChange={(e) => setForm({ ...form, feeBps: Number(e.target.value) })}
              />
            </Field>
            {formErrs.length ? <p className="hd-warn">{formErrs[0]}</p> : null}
            <Button
              disabled={!progOk || !wallet || formErrs.length > 0 || genesis !== "ok" || !!busy}
              onClick={() => build("dbc-config")}
            >
              {busy === "dbc-config" ? "Building…" : "Build and simulate config"}
            </Button>
            <p>
              <b>8b. Pool + QLi policy.</b> One transaction: SDK createPoolWithTransferHook, then
              qlihk:db right after it, co-signed by the one-time mint key.
            </p>
            <Field label="DBC config address">
              <input
                value={dbcConfig}
                onChange={(e) => {
                  setDbcConfig(e.target.value);
                  setCfgS(null);
                }}
              />
            </Field>
            <Button
              variant="outline"
              disabled={!isAddress(dbcConfig.trim()) || !isAddress(hook.trim()) || !!busy}
              onClick={checkDbcConfig}
            >
              {busy === "dbc-cfg-read" ? "Reading…" : "Read config"}
            </Button>
            {cfgS ? <Checks list={cfgS.checks} /> : null}
            <Button
              disabled={!progOk || !wallet || !cfgS?.ok || formErrs.length > 0 || !!busy}
              onClick={() => build("dbc-pool")}
            >
              {busy === "dbc-pool" ? "Building…" : "Build and simulate pool"}
            </Button>
            <p>
              <b>8c. Verify pool and buy a tiny amount.</b>
            </p>
            <Field label="DBC TransferHookPool address">
              <input
                value={dbcPool}
                onChange={(e) => {
                  setDbcPool(e.target.value);
                  setPoolS(null);
                }}
              />
            </Field>
            <Button
              variant="outline"
              disabled={!isAddress(dbcPool.trim()) || !isAddress(hook.trim()) || !!busy}
              onClick={checkDbcPool}
            >
              {busy === "dbc-pool-read" ? "Reading…" : "Read pool"}
            </Button>
            {poolS ? <Checks list={poolS.checks} /> : null}
            <Field label="Buy amount (lamports) / slippage (bps)">
              <span className="hd-row">
                <input
                  inputMode="numeric"
                  aria-label="Buy lamports"
                  value={swapLamports}
                  onChange={(e) => setSwapLamports(e.target.value.replace(/\D/g, ""))}
                />
                <input
                  inputMode="numeric"
                  aria-label="Slippage bps"
                  value={slippage}
                  onChange={(e) => setSlippage(e.target.value.replace(/\D/g, ""))}
                />
              </span>
            </Field>
            <Button
              disabled={!poolS?.ok || !wallet || !swapLamports || !!busy}
              onClick={() => build("dbc-swap")}
            >
              {busy === "dbc-swap" ? "Building…" : "Build and simulate swap"}
            </Button>
          </>,
        )}
        {step(
          9,
          "DAMM v2 graduation readiness",
          poolS ? (poolS.isMigrated ? null : readiness?.ready ? true : false) : null,
          <>
            {readiness ? (
              readiness.ready ? (
                <p>
                  Ready per on-chain state at slot {readiness.slot}. DAMM v2 config{" "}
                  {readiness.dammConfig}.
                </p>
              ) : (
                <ul className="hd-checks">
                  {readiness.reasons.map((r, i) => (
                    <li key={i}>
                      <Badge ok={false} /> {r}
                    </li>
                  ))}
                </ul>
              )
            ) : (
              <p>Read the pool in step 8c first.</p>
            )}
            <Button
              disabled={!readiness?.ready || !wallet || !!busy}
              onClick={() => build("dbc-migrate")}
            >
              {busy === "dbc-migrate" ? "Building…" : "Build and simulate migration"}
            </Button>
            <p className="micro">
              Verify any confirmed migration and post-graduation transfers on{" "}
              <Link to="/hook-proofs" className="desk-link">
                Hook Proofs
              </Link>
              ; the migrated flag alone never counts.
            </p>
          </>,
        )}

        <Panel title="Confirmed receipts (this tab)" tag={`${receipts.length}`}>
          <div className="instrument-body">
            {receipts.length === 0 ? (
              <p>No confirmed transactions yet. Receipts are kept for this browser tab only.</p>
            ) : (
              <ul className="hd-checks">
                {receipts.map((r) => (
                  <li key={r.signature}>
                    <b>{r.kind}</b> · slot {r.slot ?? "?"} ·{" "}
                    <a
                      className="desk-link"
                      href={explorerTx(r.signature)}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {r.signature.slice(0, 16)}…
                    </a>
                  </li>
                ))}
              </ul>
            )}
            <p className="micro">
              Paste these signatures into Hook Proofs for server verification.
            </p>
          </div>
        </Panel>
      </div>
    </div>
  );
}
