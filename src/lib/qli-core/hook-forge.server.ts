// Server-only Token-2022 TransferHook inspector. Server-trusted RPC allowlist only (no user URLs),
// genesis check, bounded fixed account reads. Never signs or sends. Never fetches program code.
import { Connection, PublicKey } from "@solana/web3.js";
import {
  ExtensionType,
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  getExtensionTypes,
  getExtraAccountMetaAddress,
  getPermanentDelegate,
  getTransferFeeConfig,
  getTransferHook,
  unpackMint,
} from "@solana/spl-token";
import { resolveServerRpc } from "./agent-v2-core";
import { PROOF_GENESIS, DBC_PROGRAM } from "./launch-proof";
import {
  MESSAGE,
  deriveRisks,
  type HookInspection,
  type InspectCode,
  type Permission,
} from "./hook-forge";

export const UPGRADEABLE_LOADER = "BPFLoaderUpgradeab1e11111111111111111111111";
type Net = "mainnet-beta" | "devnet";
export type RawAccount = {
  owner: string;
  executable: boolean;
  data: Uint8Array;
  lamports: number;
} | null;
export type InspectRpc = {
  genesis(): Promise<string>;
  accounts(addrs: string[]): Promise<{ slot: number; values: RawAccount[] }>;
};

const TIMEOUT = 10_000;
const timed = <T>(p: Promise<T>) =>
  Promise.race([
    p,
    new Promise<T>((_, r) => setTimeout(() => r(new Error("rpc timeout")), TIMEOUT)),
  ]);

export function inspectRpc(network: Net): InspectRpc {
  const env =
    network === "devnet" ? process.env["QLI_DEVNET_RPC_URL"] : process.env["QLI_MAINNET_RPC_URL"];
  const conn = new Connection(resolveServerRpc(network, env).url, "confirmed");
  return {
    genesis: () => timed(conn.getGenesisHash()),
    async accounts(addrs) {
      const r = await timed(
        conn.getMultipleAccountsInfoAndContext(
          addrs.map((a) => new PublicKey(a)),
          "confirmed",
        ),
      );
      return {
        slot: r.context.slot,
        values: r.value.map((a) =>
          a
            ? {
                owner: a.owner.toBase58(),
                executable: a.executable,
                data: new Uint8Array(a.data),
                lamports: a.lamports,
              }
            : null,
        ),
      };
    },
  };
}

const EXT_NAMES: Partial<Record<number, string>> = Object.fromEntries(
  Object.entries(ExtensionType)
    .filter(([, v]) => typeof v === "number")
    .map(([k, v]) => [v as number, k]),
);

function fail(
  network: Net,
  code: InspectCode,
  mint: string | null = null,
  slot: number | null = null,
): HookInspection {
  return {
    ok: false,
    code,
    message: MESSAGE[code],
    network,
    mint,
    observedSlot: slot,
    tokenProgram: null,
    extensions: [],
    transferHook: null,
    permissions: [],
    risks: [],
    compatibility: {
      dbcSdkPath: "n/a",
      launchForge: "n/a",
      dammV2Migration: "n/a",
      verdict: "not-applicable",
    },
  };
}

/** Read programdata upgrade authority from a BPF Upgradeable Loader program + programdata pair. */
export function parseUpgradeable(program: RawAccount): string | null {
  if (!program || program.owner !== UPGRADEABLE_LOADER || program.data.length < 36) return null;
  const tag = new DataView(program.data.buffer, program.data.byteOffset).getUint32(0, true);
  if (tag !== 2) return null;
  return new PublicKey(program.data.slice(4, 36)).toBase58();
}
export function parseProgramDataAuthority(
  pd: RawAccount,
): { upgradeable: boolean; authority: string | null } | null {
  if (!pd || pd.owner !== UPGRADEABLE_LOADER || pd.data.length < 13) return null;
  const tag = new DataView(pd.data.buffer, pd.data.byteOffset).getUint32(0, true);
  if (tag !== 3) return null;
  if (pd.data[12] === 0) return { upgradeable: false, authority: null };
  if (pd.data.length < 45) return null;
  return { upgradeable: true, authority: new PublicKey(pd.data.slice(13, 45)).toBase58() };
}

export async function inspectMint(
  network: Net,
  mint: string,
  rpc: InspectRpc = inspectRpc(network),
): Promise<HookInspection> {
  try {
    if ((await rpc.genesis()) !== PROOF_GENESIS[network])
      return fail(network, "wrong-network", mint);
  } catch {
    return fail(network, "rpc-unavailable", mint);
  }
  let first;
  try {
    first = await rpc.accounts([mint]);
  } catch {
    return fail(network, "rpc-unavailable", mint);
  }
  const acc = first.values[0];
  const slot = first.slot;
  if (!acc) return fail(network, "not-found", mint, slot);
  const src = `${network} slot ${slot}, server-trusted RPC, genesis verified`;
  const is22 = acc.owner === TOKEN_2022_PROGRAM_ID.toBase58();
  const isSpl = acc.owner === TOKEN_PROGRAM_ID.toBase58();
  if (!is22 && !isSpl) return fail(network, "not-a-mint", mint, slot);
  let decoded;
  try {
    decoded = unpackMint(
      new PublicKey(mint),
      {
        owner: new PublicKey(acc.owner),
        executable: acc.executable,
        lamports: acc.lamports,
        data: Buffer.from(acc.data),
      },
      new PublicKey(acc.owner),
    );
  } catch {
    return fail(network, "not-a-mint", mint, slot);
  }
  const permissions: Permission[] = [
    {
      label: "Mint authority",
      value: decoded.mintAuthority?.toBase58() ?? null,
      status: decoded.mintAuthority ? "observed" : "none",
      source: src,
    },
    {
      label: "Freeze authority",
      value: decoded.freezeAuthority?.toBase58() ?? null,
      status: decoded.freezeAuthority ? "observed" : "none",
      source: src,
    },
  ];
  if (isSpl) {
    return {
      ok: true,
      code: "spl-token-mint",
      message: MESSAGE["spl-token-mint"],
      network,
      mint,
      observedSlot: slot,
      tokenProgram: "spl-token",
      extensions: [],
      transferHook: null,
      permissions,
      risks: deriveRisks({ transferHook: null, extensions: [], permissions }),
      compatibility: {
        dbcSdkPath: "Standard SPL VirtualPool path in the pinned SDK.",
        launchForge: "Launch Forge builds SPL launches.",
        dammV2Migration: "Standard path; not re-verified for this mint.",
        verdict: "not-applicable",
      },
    };
  }
  const extensions = getExtensionTypes(decoded.tlvData).map((t) => EXT_NAMES[t] ?? `Unknown(${t})`);
  const hook = getTransferHook(decoded);
  const pd = getPermanentDelegate(decoded);
  if (pd)
    permissions.push({
      label: "Permanent delegate",
      value: pd.delegate.toBase58(),
      status: pd.delegate.equals(PublicKey.default) ? "none" : "observed",
      source: src,
    });
  const tf = getTransferFeeConfig(decoded);
  if (tf)
    permissions.push({
      label: "Transfer fee config authority",
      value: tf.transferFeeConfigAuthority.toBase58(),
      status: tf.transferFeeConfigAuthority.equals(PublicKey.default) ? "none" : "observed",
      source: src,
    });
  let transferHook: HookInspection["transferHook"] = null;
  if (hook) {
    const disabled = hook.programId.equals(PublicKey.default);
    const authority = hook.authority.equals(PublicKey.default) ? null : hook.authority.toBase58();
    permissions.push({
      label: "Transfer hook authority",
      value: authority,
      status: authority ? "observed" : "none",
      source: src,
    });
    transferHook = {
      present: true,
      programId: disabled ? null : hook.programId.toBase58(),
      authority,
      disabled,
      programExecutable: null,
      programLoader: null,
      upgradeAuthority: null,
      upgradeable: null,
      extraMetaPda: null,
      extraMetaExists: null,
      programExists: null,
    };
    if (!disabled) {
      const meta = getExtraAccountMetaAddress(new PublicKey(mint), hook.programId).toBase58();
      transferHook.extraMetaPda = meta;
      try {
        const r = await rpc.accounts([hook.programId.toBase58(), meta]);
        const prog = r.values[0] ?? null;
        transferHook.programExists = !!prog;
        transferHook.programExecutable = prog ? prog.executable : false;
        transferHook.programLoader = prog?.owner ?? null;
        transferHook.extraMetaExists = r.values[1]
          ? r.values[1].owner === hook.programId.toBase58()
          : false;
        const pdAddr = parseUpgradeable(prog);
        if (pdAddr) {
          const p2 = await rpc.accounts([pdAddr]);
          const a = parseProgramDataAuthority(p2.values[0] ?? null);
          if (a) {
            transferHook.upgradeable = a.upgradeable;
            transferHook.upgradeAuthority = a.authority;
          }
        }
        permissions.push({
          label: "Hook program upgrade authority",
          value: transferHook.upgradeAuthority,
          status:
            transferHook.upgradeable === null
              ? "unknown"
              : transferHook.upgradeable
                ? "observed"
                : "none",
          source:
            transferHook.upgradeable === null
              ? "Not readable (non-upgradeable-loader or missing)"
              : src,
        });
      } catch {
        permissions.push({
          label: "Hook program upgrade authority",
          value: null,
          status: "unknown",
          source: "RPC unavailable for hook program read",
        });
        transferHook.readFailed = true;
      }
    }
  }
  const active = !!transferHook && !transferHook.disabled;
  const risks = deriveRisks({ transferHook, extensions, permissions });
  return {
    ok: true,
    code: "ok",
    message: MESSAGE.ok,
    network,
    mint,
    observedSlot: slot,
    tokenProgram: "token-2022",
    extensions,
    transferHook,
    permissions,
    risks,
    compatibility: {
      dbcSdkPath: active
        ? "The pinned SDK exposes a TransferHookPool path (createConfigWithTransferHook / swap2WithTransferHook). Whether this hook program is accepted is not verified."
        : "Token-2022 without an active transfer hook; SDK Token-2022 path exists.",
      launchForge: "Launch Forge builds SPL launches only. Blocked.",
      dammV2Migration: "Not verified by QLi for this mint and extension set.",
      verdict: active || risks.some((x) => x.level === "high") ? "blocked" : "not-verified",
    },
  };
}

/** Resolve a DBC pool to its base mint via the existing verified lifecycle snapshot, then inspect. */
export async function inspectAddress(
  network: Net,
  address: string,
  kind: "mint" | "pool",
): Promise<HookInspection> {
  if (kind === "mint") return inspectMint(network, address);
  const { intelligence } = await import("./lifecycle.server");
  const r = await intelligence(network, address);
  if (!r.ok)
    return {
      ...fail(
        network,
        r.code === "rpc-unavailable" || r.code === "wrong-network" ? r.code : "pool-unresolved",
      ),
      message: r.message,
    };
  if (r.snapshot.programId !== DBC_PROGRAM) return fail(network, "pool-unresolved");
  return inspectMint(network, r.snapshot.facts.baseMint);
}
