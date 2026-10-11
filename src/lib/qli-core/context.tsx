import { DOMAINS } from "./compatibility";
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
import type { AuthorizationPolicy, AuthorizationRecord } from "./authorization";
export type SessionSettings = {
  commitment: Commitment;
  priority: number;
  slippage: number;
  domain: string;
  version: string;
};
export const defaultSettings: SessionSettings = {
  commitment: "confirmed",
  priority: 1000,
  slippage: 50,
  domain: DOMAINS.identity,
  version: "1",
};
export type ConsoleState = {
  network: "mainnet-beta" | "devnet";
  setNetwork: (v: "mainnet-beta" | "devnet") => void;
  rpc: string;
  setRpc: (v: string) => void;
  rpcHealth: string;
  wallets: readonly Wallet[];
  account: WalletAccount | undefined;
  wallet: Wallet | undefined;
  connect: (w: Wallet) => Promise<boolean>;
  disconnect: () => Promise<void>;
  walletError: string;
  walletBusy: boolean;
  events: AuditEvent[];
  log: (title: string, type?: string, pool?: string, detail?: string) => void;
  mode: string;
  setMode: (v: string) => void;
  plan: Plan | null;
  setPlan: (p: Plan | null) => void;
  settings: SessionSettings;
  setSettings: (v: SessionSettings) => void;
  strategyRepository: StrategyRepository;
  targetPool: string;
  setTargetPool: (v: string) => void;
  reset: () => void;
  identity: PublicIdentity | null;
  ledger: LeafLedger | null;
  openIdentity: (tree: IdentityTree, label: PublicIdentity["label"], wallet: string | null) => void;
  closeIdentity: () => void;
  getTree: () => IdentityTree | null;
  reserveLeaf: (leaf: number, purpose: string) => number;
  nextLeaf: () => number;
  anchor: { signature: string | null; status: "none" | "prepared" | "signed" };
  setAnchor: (a: { signature: string | null; status: "none" | "prepared" | "signed" }) => void;
  authzPolicy: AuthorizationPolicy;
  authzPolicyReady: boolean;
  authzPolicyError: string | null;
  saveAuthzPolicy: (p: AuthorizationPolicy) => void;
  authorizations: AuthorizationRecord[];
  upsertAuthorization: (r: AuthorizationRecord) => void;
  markAuthorization: (
    id: string,
    patch: Partial<Pick<AuthorizationRecord, "status" | "reason" | "signature">>,
  ) => void;
  usedNonces: ReadonlySet<string>;
  consumeNonce: (nonce: string) => void;
  /** In-memory, untrusted QLi Agent suggestion; Flywheel re-validates and rebuilds. */
  agentHandoff: unknown;
  setAgentHandoff: (p: unknown) => void;
};
export const ConsoleContext = createContext<ConsoleState | undefined>(undefined);
export function useConsole() {
  const c = useContext(ConsoleContext);
  if (!c) throw new Error("Console provider missing");
  return c;
}