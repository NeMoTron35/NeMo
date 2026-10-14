import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Panel } from "./controls";
import { v2RegisterVault, v2RemoveVault, v2VaultState } from "@/lib/qli-core/agent-v2.functions";

type VS = Awaited<ReturnType<typeof v2VaultState>>;

/** Persisted Vault Sentinel view. Shows only backend rows; never fabricates balances or alerts. */
export function VaultSentinelPanel({ token }: { token: string }) {
  const state = useServerFn(v2VaultState);
  const reg = useServerFn(v2RegisterVault);
  const rm = useServerFn(v2RemoveVault);
  const [vs, setVs] = useState<VS | null>(null);
  const [addr, setAddr] = useState("");
  const [err, setErr] = useState("");
  const load = () =>
    state({ data: { token } })
      .then(setVs)
      .catch(() => setErr("Could not load vault monitoring."));
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);
  const available = vs?.availability === "available";
  return (
    <Panel title="Vault Sentinel" tag={available ? "devnet · read-only" : "unavailable"}>
      {!vs ? (
        <p className="muted">Loading…</p>
      ) : !available ? (
        <p>{vs.availability} Ready for first devnet vault — no balances or alerts are shown.</p>
      ) : (
        <>
          <div className="button-row">
            <input
              value={addr}
              onChange={(e) => setAddr(e.target.value)}
              placeholder="Your verified devnet vault PDA"
            />
            <Button
              disabled={!addr.trim()}
              onClick={() =>
                reg({ data: { token, vault: addr.trim() } })
                  .then(load)
                  .catch((e: Error) => setErr(e.message))
              }
            >
              Register vault
            </Button>
          </div>
          {vs.vaults.map((v) => (
            <p key={v.id}>
              <code>{v.vault}</code> · slot {v.last_slot ?? "not yet read"} ·{" "}
              {v.last_error ? "read failing" : "ok"}{" "}
              <Button
                variant="outline"
                onClick={() => rm({ data: { token, id: v.id } }).then(load)}
              >
                Remove
              </Button>
            </p>
          ))}
          {vs.alerts.length === 0 ? (
            <p className="muted">No stored vault alerts.</p>
          ) : (
            <ul>
              {vs.alerts.map((a) => (
                <li key={a.id}>
                  [{a.level}] {a.detail} · slot {a.slot}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
      {err && <p role="alert">{err}</p>}
    </Panel>
  );
}
