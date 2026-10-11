import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { ml_dsa65, fingerprint } from "./crypto";
import { VaultContext as Context } from "./vault-context";
type KeyState = { publicKey: Uint8Array; secretKey: Uint8Array; seed: Uint8Array };
export function VaultProvider({ children }: { children: ReactNode }) {
  const key = useRef<KeyState | null>(null);
  const [fp, setFp] = useState<string | null>(null);
  function clear() {
    key.current?.secretKey.fill(0);
    key.current?.seed.fill(0);
    key.current = null;
    setFp(null);
  }
  function generate(input?: string) {
    if (input && !/^[a-fA-F0-9]{64}$/.test(input))
      throw new Error("Backup seed must contain exactly 64 hexadecimal characters.");
    const seed = input
      ? Uint8Array.from(input.match(/.{2}/g) ?? [], (x) => parseInt(x, 16))
      : crypto.getRandomValues(new Uint8Array(32));
    const keys = ml_dsa65.keygen(seed);
    clear();
    key.current = { ...keys, seed };
    setFp(fingerprint(keys.publicKey));
  }
  useEffect(
    () => () => {
      key.current?.secretKey.fill(0);
      key.current?.seed.fill(0);
    },
    [],
  );
  return (
    <Context.Provider
      value={{
        fingerprint: fp,
        generate,
        clear,
        backup: () => {
          const seed = key.current?.seed;
          if (!seed) throw new Error("Generate or restore a key first.");
          return Array.from(seed, (n) => n.toString(16).padStart(2, "0")).join("");
        },
        sign: (message) => {
          const k = key.current;
          if (!k) throw new Error("Generate a local ML-DSA key under My Vaults & Key first.");
          const m = new TextEncoder().encode(message);
          const signature = ml_dsa65.sign(m, k.secretKey);
          return { signature, valid: ml_dsa65.verify(signature, m, k.publicKey) };
        },
      }}
    >
      {children}
    </Context.Provider>
  );
}