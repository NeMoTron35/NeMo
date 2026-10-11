import { createContext, useContext, useState, useEffect, useRef, type ReactNode } from "react";
import {
  createLeafLedger,
  publicIdentity,
  type IdentityTree,
  type PublicIdentity,
  type LeafLedger,
  type LeafLedgerApi,
} from "./identity";
import { getWallets } from "@wallet-standard/app";
import {
  StandardConnect,
  StandardDisconnect,
  StandardEvents,
  type StandardConnectFeature,
  type StandardDisconnectFeature,
  type StandardEventsFeature,
} from "@wallet-standard/features";
import type { Wallet, WalletAccount } from "@wallet-standard/base";
import { Connection, type Commitment } from "@solana/web3.js";
import { initialEvents, type AuditEvent } from "./data";
import { createSessionStrategyRepository, type StrategyRepository } from "./repository";
import { rpcSchema } from "./validation";
import {
  POLICY_STORAGE_KEY,
  defaultPolicy,
  loadPolicy,
  parsePolicy,
  type AuthorizationPolicy,
  type AuthorizationRecord,
} from "./authorization";
import { pickAccount } from "./wallet-accounts";
import type { Plan } from "@/components/qli-core/controls";
import {
  ConsoleContext as Context,
  defaultSettings,
  type ConsoleState,
  type SessionSettings,
} from "./context";

const DEFAULT_RPC = {
  "mainnet-beta": "https://api.mainnet-beta.solana.com",
  devnet: "https://api.devnet.solana.com",
} as const;
export function ConsoleProvider({ children }: { children: ReactNode }) {
  const [network, setNetworkState] = useState<"mainnet-beta" | "devnet">("mainnet-beta");
  const [rpc, setRpcState] = useState("https://api.mainnet-beta.solana.com");
  const [settings, setSettings] = useState(defaultSettings);
  const [strategyRepository] = useState(createSessionStrategyRepository);
  const [targetPool, setTargetPool] = useState("arc");
  const [rpcHealth, setRpcHealth] = useState("Checking");
  const [wallets, setWallets] = useState<readonly Wallet[]>([]);
  const [wallet, setWallet] = useState<Wallet>();
  const [account, setAccount] = useState<WalletAccount>();
  const [walletError, setWalletError] = useState("");
  const [walletBusy, setWalletBusy] = useState(false);
  const [events, setEvents] = useState(initialEvents);
  const [mode, setMode] = useState("Observe");
  const [plan, setPlan] = useState<Plan | null>(null);
  const treeRef = useRef<IdentityTree | null>(null);
  const ledgerRef = useRef<LeafLedgerApi | null>(null);
  const [identity, setIdentity] = useState<PublicIdentity | null>(null);
  const [ledger, setLedger] = useState<LeafLedger | null>(null);
  const [anchor, setAnchor] = useState<{
    signature: string | null;
    status: "none" | "prepared" | "signed";
  }>({ signature: null, status: "none" });
  const [authzPolicy, setAuthzPolicy] = useState<AuthorizationPolicy>(defaultPolicy);
  const [authzPolicyReady, setAuthzPolicyReady] = useState(false);
  const [authzPolicyError, setAuthzPolicyError] = useState<string | null>(null);
  const [authorizations, setAuthorizations] = useState<AuthorizationRecord[]>([]);
  const [agentHandoff, setAgentHandoff] = useState<unknown>(null);
  const [usedNonces, setUsedNonces] = useState<ReadonlySet<string>>(() => new Set());
  useEffect(() => {
    let r: ReturnType<typeof loadPolicy>;
    try {
      r = loadPolicy(window.localStorage);
    } catch {
      r = {
        policy: { ...defaultPolicy, enabled: true },
        error: "Browser storage unavailable; proofs required.",
      };
    }
    setAuthzPolicy(r.policy);
    setAuthzPolicyError(r.error);
    setAuthzPolicyReady(true);
  }, []);
  function saveAuthzPolicy(p: AuthorizationPolicy) {
    const valid = parsePolicy(p);
    setAuthzPolicy(valid);
    setAuthzPolicyError(null);
    try {
      window.localStorage.setItem(POLICY_STORAGE_KEY, JSON.stringify(valid));
    } catch {
      setAuthzPolicyError("Saved for this tab only; browser storage refused the write.");
    }
  }
  function upsertAuthorization(r: AuthorizationRecord) {
    setAuthorizations((l) => [r, ...l.filter((x) => x.id !== r.id)].slice(0, 100));
  }
  function markAuthorization(
    id: string,
    patch: Partial<Pick<AuthorizationRecord, "status" | "reason" | "signature">>,
  ) {
    setAuthorizations((l) =>
      l.map((x) => (x.id !== id || x.status === "executed-on-chain" ? x : { ...x, ...patch })),
    );
  }
  function consumeNonce(n: string) {
    setUsedNonces((s) => new Set([...s, n]));
  }
  function openIdentity(tree: IdentityTree, label: PublicIdentity["label"], wallet: string | null) {
    const pub = publicIdentity(tree, label, wallet);
    treeRef.current = tree;
    const api = createLeafLedger(
      pub.root,
      label === "reference" && typeof window !== "undefined" ? window.localStorage : undefined,
    );
    ledgerRef.current = api;
    setLedger(api.state);
    setIdentity(pub);
    setAnchor({ signature: null, status: "none" });
  }
  function closeIdentity() {
    treeRef.current = null;
    ledgerRef.current = null;
    setIdentity(null);
    setLedger(null);
    setAnchor({ signature: null, status: "none" });
  }
  function reserveLeaf(leaf: number, purpose: string) {
    const api = ledgerRef.current;
    if (!api) throw new Error("No identity open.");
    const r = api.reserve(leaf, purpose);
    setLedger(api.state);
    return r;
  }
  function nextLeaf() {
    return ledgerRef.current?.next() ?? -1;
  }
  function setNetwork(v: "mainnet-beta" | "devnet") {
    setNetworkState(v);
    setRpcState((current) =>
      (Object.values(DEFAULT_RPC) as string[]).includes(current) ? DEFAULT_RPC[v] : current,
    );
    setPlan(null);
    setAgentHandoff(null);
    if (wallet) {
      const next = pickAccount(
        wallet,
        wallet.accounts,
        v === "devnet" ? "solana:devnet" : "solana:mainnet",
      );
      setAccount(next);
      setWalletError(
        next
          ? ""
          : "Connected wallet has no account for the selected network. Reconnect on that network.",
      );
    }
  }
  function setRpc(v: string) {
    const result = rpcSchema.safeParse(v);
    if (!result.success) return;
    setRpcState(result.data);
    setPlan(null);
  }
  useEffect(() => {
    const registry = getWallets();
    const update = () =>
      setWallets(
        registry.get().filter((w) => w.chains.some((chain) => chain.startsWith("solana:"))),
      );
    update();
    const offRegister = registry.on("register", update);
    const offUnregister = registry.on("unregister", update);
    return () => {
      offRegister();
      offUnregister();
    };
  }, []);
  useEffect(() => {
    let live = true;
    setRpcHealth("Checking");
    const timeout = setTimeout(() => {
      if (live) setRpcHealth("Unavailable");
    }, 8000);
    try {
      const connection = new Connection(rpc, {
        commitment: settings.commitment,
        disableRetryOnRateLimit: true,
      });
      connection
        .getGenesisHash()
        .then((hash) => {
          if (!live) return;
          clearTimeout(timeout);
          const expected =
            network === "devnet"
              ? "EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG"
              : "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d";
          setRpcHealth(hash === expected ? "Healthy" : "Network mismatch");
        })
        .catch(() => {
          if (live) {
            clearTimeout(timeout);
            setRpcHealth("Unavailable");
          }
        });
    } catch {
      setRpcHealth("Unavailable");
    }
    return () => {
      live = false;
      clearTimeout(timeout);
    };
  }, [rpc, network, settings.commitment]);
  useEffect(() => {
    if (!wallet) return;
    const feature = wallet.features[StandardEvents] as
      StandardEventsFeature[typeof StandardEvents] | undefined;
    return feature?.on("change", ({ accounts }) => {
      if (accounts) {
        setAccount(
          pickAccount(wallet, accounts, network === "devnet" ? "solana:devnet" : "solana:mainnet"),
        );
        setPlan(null);
        setAgentHandoff(null);
      }
    });
  }, [wallet, network]);
  async function connect(w: Wallet) {
    setWalletBusy(true);
    setWalletError("");
    try {
      const feature = w.features[StandardConnect] as
        StandardConnectFeature[typeof StandardConnect] | undefined;
      if (!feature) throw new Error("Wallet does not support standard connection.");
      const result = await feature.connect();
      const accounts = result.accounts.length ? result.accounts : w.accounts;
      if (!accounts.length) throw new Error("Wallet returned no account. Unlock it and retry.");
      const connected = pickAccount(
        w,
        accounts,
        network === "devnet" ? "solana:devnet" : "solana:mainnet",
      );
      if (!connected) throw new Error(`${w.name} did not expose an account for Solana ${network}.`);
      setWallet(w);
      setAccount(connected);
      setPlan(null);
      setAgentHandoff(null);
      return true;
    } catch (e) {
      const m = e instanceof Error ? e.message : String(e);
      setWalletError(
        /reject|declin|cancel|4001/i.test(m)
          ? "You declined the connection in the wallet. Nothing was shared."
          : `Wallet error: ${m}`,
      );
      return false;
    } finally {
      setWalletBusy(false);
    }
  }
  async function disconnect() {
    setWalletBusy(true);
    try {
      const feature = wallet?.features[StandardDisconnect] as
        StandardDisconnectFeature[typeof StandardDisconnect] | undefined;
      await feature?.disconnect();
    } catch {
      setWalletError("Wallet disconnect request failed. Quantum QLi has cleared its connection.");
    } finally {
      setAccount(undefined);
      setWallet(undefined);
      setPlan(null);
      setAgentHandoff(null);
      setWalletBusy(false);
    }
  }
  function log(
    title: string,
    type = "Agent",
    pool = "—",
    detail = "Local simulation · No on-chain write",
  ) {
    setEvents((e) => [
      {
        id: crypto.randomUUID(),
        time: new Date().toISOString().slice(11, 19),
        type,
        severity: "info",
        pool,
        title,
        detail,
      },
      ...e,
    ]);
  }
  function reset() {
    strategyRepository.reset();
    setTargetPool("arc");
    setEvents(initialEvents);
    setMode("Observe");
    setPlan(null);
    setSettings(defaultSettings);
    closeIdentity();
  }
  return (
    <Context.Provider
      value={{
        network,
        setNetwork,
        rpc,
        setRpc,
        rpcHealth,
        wallets,
        wallet,
        account,
        connect,
        disconnect,
        walletError,
        walletBusy,
        events,
        log,
        mode,
        setMode,
        plan,
        setPlan,
        settings,
        setSettings,
        strategyRepository,
        targetPool,
        setTargetPool,
        reset,
        identity,
        ledger,
        openIdentity,
        closeIdentity,
        getTree: () => treeRef.current,
        reserveLeaf,
        nextLeaf,
        anchor,
        setAnchor,
        authzPolicy,
        authzPolicyReady,
        authzPolicyError,
        saveAuthzPolicy,
        authorizations,
        upsertAuthorization,
        markAuthorization,
        usedNonces,
        consumeNonce,
        agentHandoff,
        setAgentHandoff,
      }}
    >
      {children}
    </Context.Provider>
  );
}