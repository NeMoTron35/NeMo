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
import type { Plan } from "@/components/qli-core/controls";
import {
  ConsoleContext as Context,
  defaultSettings,
  type ConsoleState,
  type SessionSettings,
} from "./context";

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
    setPlan(null);
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
              ? "EtWTRABZaYq6iMfeYKouRu166VU2xqa1"
              : "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp";
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
        setAccount(accounts[0]);
        setPlan(null);
      }
    });
  }, [wallet]);
  async function connect(w: Wallet) {
    setWalletBusy(true);
    setWalletError("");
    try {
      const feature = w.features[StandardConnect] as
        StandardConnectFeature[typeof StandardConnect] | undefined;
      if (!feature) throw new Error("Wallet does not support standard connection.");
      const result = await feature.connect();
      const connected = result.accounts.find((a) =>
        a.chains.includes(network === "devnet" ? "solana:devnet" : "solana:mainnet"),
      );
      if (!connected) throw new Error("No wallet account supports the selected network.");
      setWallet(w);
      setAccount(connected);
      setPlan(null);
      return true;
    } catch (e) {
      setWalletError(e instanceof Error ? e.message : "Wallet connection rejected.");
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
      setWalletBusy(false);
    }
  }
  function log(title: string, type = "Agent", pool = "—") {
    setEvents((e) => [
      {
        id: crypto.randomUUID(),
        time: new Date().toISOString().slice(11, 19),
        type,
        severity: "info",
        pool,
        title,
        detail: "Local simulation · No on-chain write",
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
      }}
    >
      {children}
    </Context.Provider>
  );
}
