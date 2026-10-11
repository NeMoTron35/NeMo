// Network Test Center core: read-only diagnostics. Never builds, signs or sends a transaction.
import { PublicKey, type Connection } from "@solana/web3.js";
import type { Wallet, WalletAccount } from "@wallet-standard/base";
import { SolanaSignTransaction } from "@solana/wallet-standard-features";
import { GENESIS, ALLOWED_PROGRAMS } from "./dbc-launch";
import { DBC_PROGRAM_ID } from "./dbc";
import type { HookDeployment } from "./hook-launch-plan";
import type { ProofResult } from "./launch-proof";
import { KNOWN_HOOK_BUILDS } from "./hook-devnet-core";
import type { ProgramStatus } from "./hook-devnet";
const BPF_UPGRADEABLE_LOADER = "BPFLoaderUpgradeab1e11111111111111111111111";
import { accountSupportsChain } from "./wallet-accounts";

export type TestNetwork = "devnet" | "mainnet-beta";
export type Readiness =
  "unconfigured" | "can-simulate" | "requires-owner-signature" | "confirmed-by-chain" | "blocked";

export const READINESS_LABEL: Record<Readiness, string> = {
  unconfigured: "Unconfigured",
  "can-simulate": "Can simulate",
  "requires-owner-signature": "Requires owner signature",
  "confirmed-by-chain": "Confirmed by chain",
  blocked: "Blocked",
};

export const PUBLIC_RPC: Record<TestNetwork, string> = {
  devnet: "https://api.devnet.solana.com",
  "mainnet-beta": "https://api.mainnet-beta.solana.com",
};
export const FAUCET_URL = "https://faucet.solana.com";
export const CHAIN: Record<TestNetwork, `solana:${string}`> = {
  devnet: "solana:devnet",
  "mainnet-beta": "solana:mainnet",
};

/** Reviewed public program IDs. Shown for review; executability is checked live. */
export const REVIEWED_PROGRAMS: { id: string; label: string; networks: TestNetwork[] }[] = [
  { id: DBC_PROGRAM_ID, label: "Meteora DBC", networks: ["devnet", "mainnet-beta"] },
  {
    id: "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb",
    label: "SPL Token-2022",
    networks: ["devnet", "mainnet-beta"],
  },
  {
    id: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
    label: "SPL Token",
    networks: ["devnet", "mainnet-beta"],
  },
  {
    id: "metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s",
    label: "Metaplex Token Metadata",
    networks: ["devnet", "mainnet-beta"],
  },
];

export type RpcErrorKind = "forbidden" | "rate-limited" | "unreachable" | "wrong-genesis";
export type RpcProbe =
  { ok: true; genesis: string; slot: number } | { ok: false; kind: RpcErrorKind; message: string };

/** Classifies RPC failures into allowlisted categories; never returns raw payloads or URLs. */
export function classifyRpcError(error: unknown): RpcErrorKind {
  const text = error instanceof Error ? error.message : String(error);
  if (/\b403\b|forbidden/i.test(text)) return "forbidden";
  if (/\b429\b|too many|rate/i.test(text)) return "rate-limited";
  return "unreachable";
}
const RPC_MESSAGE: Record<RpcErrorKind, string> = {
  forbidden: "RPC refused the request (403). Use a different RPC endpoint in System.",
  "rate-limited": "RPC is rate-limiting (429). Wait and retry, or use a dedicated RPC.",
  unreachable: "RPC could not be reached.",
  "wrong-genesis": "RPC genesis does not match the selected network. All writes refused.",
};

type ReadConn = Pick<Connection, "getGenesisHash" | "getSlot">;
export async function probeRpc(conn: ReadConn, network: TestNetwork): Promise<RpcProbe> {
  try {
    const genesis = await conn.getGenesisHash();
    if (genesis !== GENESIS[network])
      return { ok: false, kind: "wrong-genesis", message: RPC_MESSAGE["wrong-genesis"] };
    const slot = await conn.getSlot("confirmed");
    return { ok: true, genesis, slot };
  } catch (e) {
    const kind = classifyRpcError(e);
    return { ok: false, kind, message: RPC_MESSAGE[kind] };
  }
}

export type ProgramProbe = { id: string; label: string; executable: boolean | null };
export async function probePrograms(
  conn: Pick<Connection, "getAccountInfo">,
  network: TestNetwork,
): Promise<ProgramProbe[]> {
  const list = REVIEWED_PROGRAMS.filter((p) => p.networks.includes(network));
  return Promise.all(
    list.map(async (p) => {
      try {
        const info = await conn.getAccountInfo(new PublicKey(p.id), "confirmed");
        return { id: p.id, label: p.label, executable: info ? info.executable : false };
      } catch {
        return { id: p.id, label: p.label, executable: null };
      }
    }),
  );
}

/** Standard DBC launch rough minimum: fees + mint/pool/config/vault/metadata rent. Estimate only. */
export const STANDARD_LAUNCH_ACCOUNT_BYTES = [82, 424, 1200, 165, 165, 679];
export async function minimumLaunchLamports(
  conn: Pick<Connection, "getMinimumBalanceForRentExemption">,
) {
  const rents = await Promise.all(
    STANDARD_LAUNCH_ACCOUNT_BYTES.map((b) => conn.getMinimumBalanceForRentExemption(b)),
  );
  return rents.reduce((a, b) => a + b, 0) + 50_000; // + fee/priority headroom
}

export type WalletDiag = {
  connected: boolean;
  supportsChain: boolean;
  canSignTransaction: boolean;
  address: string | null;
};
export function walletDiagnostics(
  wallet: Wallet | undefined,
  account: WalletAccount | undefined,
  network: TestNetwork,
): WalletDiag {
  if (!wallet || !account)
    return { connected: false, supportsChain: false, canSignTransaction: false, address: null };
  return {
    connected: wallet.accounts.some((a) => a.address === account.address),
    supportsChain: accountSupportsChain(wallet, account, CHAIN[network]),
    canSignTransaction: SolanaSignTransaction in wallet.features,
    address: account.address,
  };
}

/** Generic signature status. Informational only: it NEVER upgrades any readiness status. */
export type SignatureStatus = {
  state: "confirmed" | "finalized" | "pending" | "failed" | "not-found";
  slot: number | null;
};
const SIG = /^[1-9A-HJ-NP-Za-km-z]{64,88}$/;
export async function signatureStatus(
  conn: Pick<Connection, "getGenesisHash" | "getSignatureStatuses">,
  network: TestNetwork,
  signature: string,
): Promise<SignatureStatus | null> {
  if (!SIG.test(signature)) return null;
  if ((await conn.getGenesisHash()) !== GENESIS[network]) return null;
  const s = (await conn.getSignatureStatuses([signature], { searchTransactionHistory: true }))
    .value[0];
  if (!s) return { state: "not-found", slot: null };
  if (s.err) return { state: "failed", slot: s.slot };
  if (s.confirmationStatus === "confirmed" || s.confirmationStatus === "finalized")
    return { state: s.confirmationStatus, slot: s.slot };
  return { state: "pending", slot: s.slot };
}

/** DBC launch proof: only a verified Launch Proof Engine receipt (DBC-owned pool/config created in-tx). */
export type DbcLaunchProof = {
  source: "launch-proof-engine";
  signature: string;
  slot: number;
  pool: string;
  baseMint: string;
  creator: string;
};
/** Evidence key: results are valid only for this wallet + account + System network + lane RPC. */
export function evidenceKey(k: {
  walletName: string | null;
  address: string | null;
  sessionNetwork: string;
  lane: TestNetwork;
  rpc: string;
}) {
  return JSON.stringify([k.walletName, k.address, k.sessionNetwork, k.lane, k.rpc]);
}
/** An async completion may only be applied if the key is unchanged since it started. */
export function acceptCompletion<T extends { key: string }>(
  value: T,
  currentKey: string,
): T | null {
  return value.key === currentKey ? value : null;
}

/** Owner launch proof: verified DBC receipt AND creator equals the connected wallet (signer). */
export function dbcProofFromResult(
  r: ProofResult,
  network: TestNetwork,
  connectedWallet: string | null,
): DbcLaunchProof | null {
  if (!r.ok || !connectedWallet) return null;
  if (r.receipt.facts.creator !== connectedWallet || !r.receipt.facts.creatorSigned) return null;
  const rc = r.receipt;
  if (rc.network !== network || rc.genesis !== GENESIS[network] || rc.status !== "verified")
    return null;
  if (rc.facts.poolOwner !== DBC_PROGRAM_ID || !rc.facts.poolCreatedInTx) return null;
  return {
    source: "launch-proof-engine",
    signature: rc.signature,
    slot: Number(rc.slot),
    pool: rc.facts.pool,
    baseMint: rc.facts.baseMint,
    creator: rc.facts.creator,
  };
}

export type HookCheck =
  | { status: "none"; detail: string }
  | { status: "unverified"; detail: string }
  | { status: "verified"; detail: string; programId: string; slot: number };
/** Live verification of the recorded deployment; constants alone never count. */
export function verifyHookDeployment(
  dep: HookDeployment | null,
  live: Pick<
    ProgramStatus,
    "executable" | "loader" | "upgradeAuthority" | "codeFingerprint" | "slot"
  > | null,
): HookCheck {
  if (!dep) return { status: "none", detail: "No reviewed hook deployment recorded." };
  if (!live) return { status: "unverified", detail: "Live program check not run or RPC failed." };
  const known = KNOWN_HOOK_BUILDS.some((k) => k.fingerprint === live.codeFingerprint);
  const problems = [
    !live.executable && "not executable",
    live.loader !== BPF_UPGRADEABLE_LOADER && "unexpected loader",
    live.codeFingerprint !== dep.codeFingerprint && "code fingerprint differs from record",
    !known && "fingerprint is not a reviewed QLi build",
    live.upgradeAuthority !== dep.upgradeAuthority && "upgrade authority differs from record",
  ].filter(Boolean);
  if (problems.length) return { status: "unverified", detail: `Refused: ${problems.join(", ")}.` };
  return {
    status: "verified",
    detail: `Executable, fingerprint ${live.codeFingerprint!.slice(0, 12)}…, authority matches (slot ${live.slot}).`,
    programId: dep.programId,
    slot: live.slot,
  };
}

export type Facts = {
  rpc: RpcProbe | null;
  wallet: WalletDiag;
  balance: number | null;
  minLamports: number | null;
  programsOk: boolean;
  /** System (session) network equals this lane; required before any owner-signature status. */
  sessionMatches: boolean;
  hook?: HookCheck;
  launchProof?: DbcLaunchProof | null;
};
export type TestItem = {
  id: string;
  title: string;
  status: Readiness;
  reason: string;
  href?: string;
};

/** Pure readiness matrix. Fails closed: missing facts never upgrade a status. */
export function readiness(network: TestNetwork, f: Facts): TestItem[] {
  const rpcOk = f.rpc?.ok === true;
  const walletOk = f.wallet.connected && f.wallet.supportsChain && f.wallet.canSignTransaction;
  const funded = f.balance !== null && f.minLamports !== null && f.balance >= f.minLamports;
  const base = (id: string, title: string, href?: string): Omit<TestItem, "status" | "reason"> =>
    href ? { id, title, href } : { id, title };
  const items: TestItem[] = [
    {
      ...base("rpc", "RPC connectivity + genesis"),
      status: f.rpc === null ? "unconfigured" : rpcOk ? "can-simulate" : "blocked",
      reason:
        f.rpc === null
          ? "Run checks."
          : f.rpc.ok
            ? `Genesis matches; slot ${f.rpc.slot}.`
            : f.rpc.message,
    },
    {
      ...base("wallet", "Wallet on selected network"),
      status: !f.wallet.connected ? "unconfigured" : walletOk ? "can-simulate" : "blocked",
      reason: !f.wallet.connected
        ? "Connect Phantom or another Wallet Standard wallet."
        : !f.wallet.supportsChain
          ? "Wallet account does not advertise this chain. Turn Phantom Testnet Mode on/off and reconnect."
          : !f.wallet.canSignTransaction
            ? "Wallet lacks transaction signing."
            : "Connected; chain advertised (capability only — not proof of Phantom's active network; genesis + signing guards still apply).",
    },
    {
      ...base("balance", "Balance vs minimum rent preflight"),
      status: f.balance === null ? "unconfigured" : funded ? "can-simulate" : "blocked",
      reason:
        f.balance === null
          ? "Connect wallet and run checks."
          : `Balance ${(f.balance / 1e9).toFixed(4)} SOL; estimated minimum ${((f.minLamports ?? 0) / 1e9).toFixed(4)} SOL (estimate only).`,
    },
    {
      ...base("programs", "Reviewed program IDs executable"),
      status: f.rpc === null ? "unconfigured" : rpcOk && f.programsOk ? "can-simulate" : "blocked",
      reason:
        rpcOk && f.programsOk
          ? "All reviewed programs executable on this cluster."
          : "Not verified.",
    },
  ];
  const launchReady = rpcOk && walletOk && funded && f.programsOk && f.sessionMatches;
  const std = f.launchProof ?? null;
  items.push({
    ...base("standard-launch", "Standard Meteora DBC config + pool", "/launch"),
    status: std ? "confirmed-by-chain" : launchReady ? "requires-owner-signature" : "blocked",
    reason: std
      ? `Launch Proof Engine verified DBC pool ${std.pool} created by the connected wallet at slot ${std.slot}.`
      : launchReady
        ? network === "mainnet-beta"
          ? "Launch Forge: real SOL, 0.1 SOL preflight threshold (heuristic estimate, not an on-chain spending cap), simulation + mainnet acknowledgement + wallet approval."
          : "Launch Forge: simulate, then approve once in wallet."
        : !f.sessionMatches
          ? "Set System network to this lane first; builders use the System network."
          : "Complete RPC, wallet, balance and program checks first.",
  });
  if (network === "devnet") {
    const hook = f.hook ?? {
      status: "none" as const,
      detail: "No reviewed hook deployment recorded.",
    };
    const hv = hook.status === "verified";
    items.push(
      {
        ...base("hook-deploy", "Token-2022 hook program deployment (CLI)", "/hook-devnet"),
        status: hv
          ? "confirmed-by-chain"
          : hook.status === "unverified"
            ? "blocked"
            : "requires-owner-signature",
        reason:
          hook.status === "none"
            ? "Owner deploys the checksum-verified SBF artifact with Solana CLI. Phantom alone cannot deploy programs."
            : hook.detail,
      },
      {
        ...base("hook-dbc", "Hook DBC config → pool → tiny swap", "/hook-devnet"),
        status: hv && launchReady ? "requires-owner-signature" : "blocked",
        reason: hv
          ? "Hook Devnet steps 8–9; each transaction wallet-approved."
          : "Blocked until the hook program, ProgramData fingerprint and upgrade authority verify live on devnet.",
      },
      {
        ...base("hook-negative", "Paused-policy denial (0x5100)", "/hook-devnet"),
        status: hv && rpcOk ? "can-simulate" : "blocked",
        reason: "Simulation only; a simulated denial is never presented as on-chain evidence.",
      },
      {
        ...base("graduation", "DAMM v2 graduation with hook"),
        status: "blocked",
        reason: "Unverified (issue #17). Not assumed.",
      },
    );
  } else {
    for (const [id, title] of [
      ["mainnet-hook", "Custom Token-2022 TransferHook launch"],
      ["mainnet-vault", "Quantum Vault deposits"],
      ["mainnet-deploy", "Program deployment / arbitrary mint"],
    ] as const)
      items.push({
        ...base(id, title),
        status: "blocked",
        reason: "Disabled on mainnet: requires independent audit and real devnet evidence.",
      });
  }
  return items;
}

/** Ensures the Launch Forge allowlist still covers each reviewed program (regression guard). */
export function allowlistCovers() {
  return REVIEWED_PROGRAMS.every((p) => ALLOWED_PROGRAMS.has(p.id));
}

export type LaneState =
  | "not-connected"
  | "rpc-unavailable"
  | "wrong-network"
  | "unfunded"
  | "session-mismatch"
  | "ready-to-build"
  | "confirmed";
export const LANE_LABEL: Record<LaneState, string> = {
  "not-connected": "Not connected",
  "rpc-unavailable": "RPC unavailable",
  "wrong-network": "Wrong network",
  unfunded: "Below rent minimum",
  "session-mismatch": "System network differs",
  "ready-to-build": "Ready to build",
  confirmed: "Confirmed by chain",
};
/** Overall lane badge. Simulation/signing happen in Launch Forge; only chain proofs reach "confirmed". */
export function laneState(f: Facts): LaneState {
  if (f.launchProof) return "confirmed";
  if (f.rpc && !f.rpc.ok)
    return f.rpc.kind === "wrong-genesis" ? "wrong-network" : "rpc-unavailable";
  if (!f.wallet.connected) return "not-connected";
  if (!f.wallet.supportsChain) return "wrong-network";
  if (!f.rpc) return "not-connected";
  if (f.balance === null || f.minLamports === null || f.balance < f.minLamports) return "unfunded";
  if (!f.programsOk) return "rpc-unavailable";
  return f.sessionMatches ? "ready-to-build" : "session-mismatch";
}