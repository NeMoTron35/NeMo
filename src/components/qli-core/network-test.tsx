import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Connection, PublicKey } from "@solana/web3.js";
import { Button } from "@/components/ui/button";
import { Panel, CopyValue } from "@/components/qli-core/controls";
import { useConsole } from "@/lib/qli-core/context";
import { walletEnvironment, phantomBrowseLink } from "@/lib/qli-core/wallet-accounts";
import { explorerTx, GENESIS } from "@/lib/qli-core/dbc-launch";
import { capability, type Capability } from "@/lib/qli-core/capabilities";
import { getLaunchProof } from "@/lib/qli-core/launch-proof.functions";
import { HOOK_DEVNET_DEPLOYMENT } from "@/lib/qli-core/hook-launch-plan";
import {
  FAUCET_URL,
  LANE_LABEL,
  PUBLIC_RPC,
  READINESS_LABEL,
  REVIEWED_PROGRAMS,
  acceptCompletion,
  dbcProofFromResult,
  evidenceKey,
  laneState,
  minimumLaunchLamports,
  probePrograms,
  probeRpc,
  readiness,
  signatureStatus,
  verifyHookDeployment,
  walletDiagnostics,
  type DbcLaunchProof,
  type HookCheck,
  type ProgramProbe,
  type RpcProbe,
  type SignatureStatus,
  type TestNetwork,
} from "@/lib/qli-core/network-test";

type Result = {
  rpc: RpcProbe;
  programs: ProgramProbe[];
  balance: number | null;
  minLamports: number | null;
  blockHeight: number | null;
  hook: HookCheck | undefined;
  /** Wallet + account + System network + RPC that produced these results. */
  key: string;
};

const CAPS: [Capability, string][] = [
  ["standard-dbc-launch", "Standard DBC launch"],
  ["hook-program-deploy", "Hook program deploy"],
  ["hook-dbc-launch", "Hook DBC launch / swap"],
  ["hook-migration", "Hook DAMM v2 migration"],
  ["quantum-vault-deposit", "Quantum Vault deposit"],
];

const sol = (l: number | null | undefined) => (l == null ? "—" : `${(l / 1e9).toFixed(4)} SOL`);

function Lane({ network }: { network: TestNetwork }) {
  const c = useConsole();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [proof, setProof] = useState<(DbcLaunchProof & { key: string }) | null>(null);
  const [status, setStatus] = useState<(SignatureStatus & { key: string }) | null>(null);
  const [sig, setSig] = useState("");
  const [sigMsg, setSigMsg] = useState("");
  // Session RPC only when it targets this lane; URLs are never displayed.
  const usesCustom = c.network === network;
  const conn = useMemo(
    () => new Connection(usesCustom ? c.rpc : PUBLIC_RPC[network], "confirmed"),
    [usesCustom, c.rpc, network],
  );
  const diag = walletDiagnostics(c.wallet, c.account, network);
  const key = evidenceKey({
    walletName: c.wallet?.name ?? null,
    address: diag.address,
    sessionNetwork: c.network,
    lane: network,
    rpc: usesCustom ? c.rpc : "public",
  });
  const keyRef = useRef(key);
  keyRef.current = key;
  useEffect(() => {
    setResult(null);
    setProof(null);
    setStatus(null);
    setSigMsg("");
  }, [key]);
  // Evidence is only shown for the exact wallet/account/System network/RPC that produced it.
  const r = result && result.key === key ? result : null;
  const liveProof = proof && proof.key === key ? proof : null;
  const liveStatus = status && status.key === key ? status : null;

  const facts = {
    rpc: r?.rpc ?? null,
    wallet: diag,
    balance: r?.balance ?? null,
    minLamports: r?.minLamports ?? null,
    programsOk: !!r && r.programs.length > 0 && r.programs.every((p) => p.executable === true),
    sessionMatches: c.network === network,
    ...(r?.hook ? { hook: r.hook } : {}),
    launchProof: liveProof,
  };
  const items = readiness(network, facts);
  const lane = laneState(facts);
  const name = network === "devnet" ? "Devnet" : "Mainnet";

  async function run() {
    const start = key;
    setBusy(true);
    try {
      const rpc = await probeRpc(conn, network);
      const out: Result = {
        rpc,
        programs: [],
        balance: null,
        minLamports: null,
        blockHeight: null,
        hook: undefined,
        key: start,
      };
      if (rpc.ok) {
        out.programs = await probePrograms(conn, network);
        out.minLamports = await minimumLaunchLamports(conn).catch(() => null);
        out.blockHeight = await conn.getBlockHeight("confirmed").catch(() => null);
        if (diag.address)
          out.balance = await conn
            .getBalance(new PublicKey(diag.address), "confirmed")
            .catch(() => null);
        if (network === "devnet") {
          const dep = HOOK_DEVNET_DEPLOYMENT;
          let liveProgram = null;
          if (dep) {
            const { inspectProgram } = await import("@/lib/qli-core/hook-devnet");
            liveProgram = await inspectProgram(conn, new PublicKey(dep.programId)).catch(
              () => null,
            );
          }
          out.hook = verifyHookDeployment(dep, liveProgram);
        }
      }
      // Drop responses that finished after the wallet, account, network or RPC changed.
      const accepted = acceptCompletion(out, keyRef.current);
      if (accepted) setResult(accepted);
    } finally {
      setBusy(false);
    }
  }

  async function checkSig() {
    const start = key;
    const signature = sig.trim();
    setSigMsg("Checking…");
    const [st, res] = await Promise.all([
      signatureStatus(conn, network, signature).catch(() => null),
      getLaunchProof({ data: { network, signature } }).catch(() => null),
    ]);
    if (keyRef.current !== start) return;
    setStatus(st ? { ...st, key: start } : null);
    const p = res ? dbcProofFromResult(res, network, diag.address) : null;
    setProof(p ? { ...p, key: start } : null);
    setSigMsg(
      p
        ? `Launch Proof Engine verified Meteora DBC pool ${p.pool}, created by the connected wallet, at slot ${p.slot}.`
        : res?.ok
          ? "Verified DBC launch, but its creator is not the connected wallet. Not counted as your owner test."
          : `Transaction confirmed only if shown below; launch unverified${res && !res.ok ? `: ${res.message}` : "."} Readiness unchanged.`,
    );
  }

  return (
    <section className="network-lane" aria-label={`${name} lane`} data-lane={network}>
      <Panel title={`${name} lane`} tag={LANE_LABEL[lane]}>
        <p className="micro" data-testid={`lane-${network}`}>
          Status: <strong>{LANE_LABEL[lane]}</strong>
        </p>
        {network === "mainnet-beta" ? (
          <p role="alert" className="micro">
            Real SOL, irreversible. A standard launch costs network fees plus account rent. Launch
            Forge refuses a build whose preflight estimate exceeds 0.1 SOL — a heuristic threshold,
            not an on-chain spending cap; your wallet approval is the only real limit. Do micro
            tests only after Devnet passes. No mainnet transaction has been tested by Quantum QLi.
          </p>
        ) : (
          <p className="micro">
            Free test SOL:{" "}
            <a className="desk-link" href={FAUCET_URL} target="_blank" rel="noreferrer">
              faucet.solana.com
            </a>{" "}
            (rate-limited; retry later if refused). Then press Refresh.
          </p>
        )}
        {!facts.sessionMatches && (
          <p role="alert" className="micro">
            System network is {c.network}. Set System to {network} before any owner-signature step.
          </p>
        )}
        <ul className="micro">
          <li>
            Expected genesis: <code style={{ wordBreak: "break-all" }}>{GENESIS[network]}</code>
          </li>
          <li>RPC: {usesCustom ? "session RPC (System)" : "public cluster RPC"}</li>
          <li>Observed genesis: {r ? (r.rpc.ok ? "match" : r.rpc.message) : "not checked"}</li>
          <li>Block height: {r?.blockHeight ?? "—"}</li>
          <li>
            Account advertises {name} chain:{" "}
            {diag.connected ? (diag.supportsChain ? "yes" : "no") : "—"} (wallet capability, not
            proof of Phantom&apos;s active network; RPC genesis and signing checks decide)
          </li>
          <li>
            Balance: {sol(r?.balance)}; estimated minimum {sol(r?.minLamports)}
          </li>
        </ul>
        <Button onClick={() => void run()} disabled={busy}>
          {busy ? "Checking…" : r ? `Refresh ${name}` : `Run ${name} checks`}
        </Button>
        <div style={{ overflowX: "auto" }}>
          <table className="desk-table">
            <thead>
              <tr>
                <th>Test</th>
                <th>Status</th>
                <th>Detail</th>
              </tr>
            </thead>
            <tbody>
              {items.map((i) => (
                <tr key={i.id} data-status={i.status} data-test={i.id}>
                  <td>
                    {i.href ? (
                      <Link to={i.href} className="desk-link">
                        {i.title}
                      </Link>
                    ) : (
                      i.title
                    )}
                  </td>
                  <td>
                    <strong>{READINESS_LABEL[i.status]}</strong>
                  </td>
                  <td>{i.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <h3 className="micro">Capability policy</h3>
        <ul className="micro">
          {CAPS.map(([cap, label]) => {
            const g = capability(cap, network);
            return (
              <li key={cap} data-cap={cap} data-allowed={g.allowed}>
                {label}: <strong>{g.allowed ? "Allowed (reviewed flow)" : "Disabled"}</strong> —{" "}
                {g.reason}
              </li>
            );
          })}
        </ul>
        <h3 className="micro">Reviewed programs</h3>
        <ul className="micro">
          {REVIEWED_PROGRAMS.filter((p) => p.networks.includes(network)).map((p) => {
            const probe = r?.programs.find((x) => x.id === p.id);
            return (
              <li key={p.id}>
                {p.label}: <CopyValue value={p.id} /> —{" "}
                {probe
                  ? probe.executable
                    ? "executable"
                    : probe.executable === null
                      ? "unknown"
                      : "not executable"
                  : "not checked"}
              </li>
            );
          })}
        </ul>
        <h3 className="micro">Launch proof (Launch Proof Engine only)</h3>
        <p className="micro">
          A confirmed signature alone is not a launch. Only a transaction the Launch Proof Engine
          verifies as creating a DBC-owned pool, with the connected wallet as signing creator,
          counts. Full semantic report:{" "}
          <Link to="/launch-proofs" className="desk-link">
            Launch Proofs
          </Link>
          .
        </p>
        <input
          aria-label={`${name} transaction signature`}
          value={sig}
          onChange={(e) => setSig(e.target.value)}
        />
        <Button onClick={() => void checkSig()} disabled={!sig.trim()}>
          Verify
        </Button>
        {sigMsg && <p role="status">{sigMsg}</p>}
        {liveStatus && (
          <p className="micro">
            Generic signature status (transaction confirmation only; launch unverified):{" "}
            {liveStatus.state}
            {liveStatus.slot ? ` @ slot ${liveStatus.slot}` : ""}
          </p>
        )}
        {liveProof && (
          <a
            className="desk-link"
            target="_blank"
            rel="noreferrer"
            href={explorerTx(liveProof.signature, network)}
          >
            View on Solana Explorer
          </a>
        )}
        <h3 className="micro">Owner steps</h3>
        {network === "devnet" ? (
          <ol className="micro">
            <li>Phantom → Settings → Developer Settings → Testnet Mode on → Solana Devnet.</li>
            <li>System → network devnet. Fund from the faucet, then Refresh.</li>
            <li>
              Standard test:{" "}
              <Link to="/launch" className="desk-link">
                Launch Forge
              </Link>{" "}
              → build → simulate → approve once.
            </li>
            <li>
              Hook test (owner computer): verify artifact checksum, deploy with Solana CLI, verify
              fingerprint, then{" "}
              <Link to="/hook-devnet" className="desk-link">
                Hook Devnet
              </Link>{" "}
              steps 2–9. Phantom alone cannot deploy programs.
            </li>
            <li>
              Evidence:{" "}
              <Link to="/hook-proofs" className="desk-link">
                Hook Proofs
              </Link>
              ,{" "}
              <Link to="/launch-proofs" className="desk-link">
                Launch Proofs
              </Link>
              .
            </li>
          </ol>
        ) : (
          <ol className="micro">
            <li>
              Phantom → Testnet Mode off (Mainnet). System → network mainnet-beta and a dedicated
              RPC (public RPC often returns 403).
            </li>
            <li>Refresh; confirm genesis match, balance and rent estimate.</li>
            <li>
              <Link to="/launch" className="desk-link">
                Launch Forge
              </Link>{" "}
              Standard: review costs/authorities, tick both acknowledgements, approve once. No
              retries.
            </li>
            <li>
              Paste the signature above; check{" "}
              <Link to="/launch-proofs" className="desk-link">
                Launch Proofs
              </Link>
              .
            </li>
          </ol>
        )}
      </Panel>
    </section>
  );
}

export function NetworkTestCenter() {
  const c = useConsole();
  const [env, setEnv] = useState("ok");
  useEffect(() => setEnv(walletEnvironment(window, c.wallets.length)), [c.wallets.length]);
  return (
    <div className="network-test">
      <Panel title="Wallet" tag={c.account ? "connected" : "not connected"}>
        <ul className="micro">
          <li>
            Detected Wallet Standard wallets:{" "}
            {c.wallets.length ? c.wallets.map((w) => w.name).join(", ") : "none"}
          </li>
          <li>Connected: {c.account ? `${c.wallet?.name} ${c.account.address}` : "no"}</li>
          <li>Session network (System): {c.network}</li>
        </ul>
        {!c.account &&
          c.wallets.map((w) => (
            <Button key={w.name} onClick={() => void c.connect(w)} disabled={c.walletBusy}>
              Connect {w.name}
            </Button>
          ))}
        {c.account && <Button onClick={() => void c.disconnect()}>Disconnect</Button>}
        {env === "framed" && (
          <p className="micro">
            Wallets cannot connect inside an embedded preview. Open this page in its own tab.
          </p>
        )}
        {env === "desktop-no-wallet" && (
          <p className="micro">No wallet detected. Install the Phantom extension, then reload.</p>
        )}
        {env === "mobile-no-wallet" && (
          <p className="micro">
            <a className="desk-link" href={phantomBrowseLink(window.location.href)}>
              Open in Phantom browser
            </a>
          </p>
        )}
        <p className="micro">
          The app cannot read or switch Phantom&apos;s active network. A wallet listing a chain only
          means it supports that chain. Change the network in Phantom yourself; signing still
          refuses any RPC genesis or chain mismatch. Read-only: this page never signs or sends.
        </p>
        {c.walletError && <p role="alert">{c.walletError}</p>}
      </Panel>
      <div className="network-lanes">
        <Lane network="devnet" />
        <Lane network="mainnet-beta" />
      </div>
    </div>
  );
}