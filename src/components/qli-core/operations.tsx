import { Link } from "@tanstack/react-router";
import { useState } from "react";
import {
  Download,
  Search,
  ArrowUpRight,
  Activity,
  ShieldCheck,
  Trash2,
  Save,
  Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { PageHeading, Panel, Field, CopyValue } from "./controls";
import { useConsole } from "@/lib/qli-core/context";
import { DBC_PROGRAM_ID } from "@/lib/qli-core/dbc";
import { rpcSchema } from "@/lib/qli-core/validation";
import { z } from "zod";
export function ActivityPage() {
  const c = useConsole();
  const [severity, setSeverity] = useState("All severity");
  const [type, setType] = useState("All events");
  const [pool, setPool] = useState("All pools");
  const [query, setQuery] = useState("");
  const events = c.events.filter(
    (e) =>
      (severity === "All severity" || e.severity === severity) &&
      (type === "All events" || e.type === type) &&
      (pool === "All pools" || e.pool === pool) &&
      `${e.title} ${e.detail}`.toLowerCase().includes(query.toLowerCase()),
  );
  function download() {
    const url = URL.createObjectURL(
      new Blob(
        [JSON.stringify({ environment: "simulation", network: c.network, events }, null, 2)],
        { type: "application/json" },
      ),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "quantum-qli-audit-demo.json";
    a.click();
    URL.revokeObjectURL(url);
  }
  return (
    <>
      <PageHeading
        eyebrow="AUDIT / EXECUTION JOURNAL"
        title="Event Log"
        description="An explicit record of plans, requested checkpoints and simulated events. No hidden execution."
        action={
          <Button variant="outline" onClick={download}>
            <Download />
            Export JSON
          </Button>
        }
      />
      <div className="toolbar">
        <div className="search-field">
          <Search />
          <input
            aria-label="Search activity"
            maxLength={100}
            placeholder="Search the audit trail…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <select
          aria-label="Severity"
          value={severity}
          onChange={(e) => setSeverity(e.target.value)}
        >
          {["All severity", "info", "warning"].map((x) => (
            <option key={x}>{x}</option>
          ))}
        </select>
        <select aria-label="Event type" value={type} onChange={(e) => setType(e.target.value)}>
          {["All events", ...new Set(c.events.map((e) => e.type))].map((x) => (
            <option key={x}>{x}</option>
          ))}
        </select>
        <select aria-label="Activity pool" value={pool} onChange={(e) => setPool(e.target.value)}>
          {["All pools", "ARC", "NXS", "VEC"].map((x) => (
            <option key={x}>{x}</option>
          ))}
        </select>
      </div>
      <Panel title="Audit trail" tag={`${events.length} EVENTS / DEMO`}>
        {events.map((e) => (
          <div className="activity-row" key={e.id}>
            <span className="activity-time">{e.time}</span>
            <div className="activity-icon">
              <Activity />
            </div>
            <div className="activity-description">
              <strong>{e.title}</strong>
              <p>{e.detail}</p>
            </div>
            <span className="micro">{e.pool}</span>
            <span className="status-tag">{e.severity.toUpperCase()}</span>
          </div>
        ))}
        {!events.length && (
          <div className="empty-state">
            <Search size={26} />
            No matching audit events.
          </div>
        )}
      </Panel>
    </>
  );
}
const settingsSchema = z.object({
  priority: z.coerce.number().int().min(0).max(10000000),
  slippage: z.coerce.number().int().min(1).max(500),
  domain: z
    .string()
    .trim()
    .min(1)
    .max(100)
    .regex(/^[a-zA-Z0-9._/-]+$/),
  version: z.string().trim().min(1).max(20),
});
export function SettingsPage() {
  const c = useConsole();
  const [url, setUrl] = useState(c.rpc);
  const [network, setNetwork] = useState(c.network);
  const [commitment, setCommitment] = useState(c.settings.commitment);
  const [priority, setPriority] = useState(c.settings.priority);
  const [slippage, setSlippage] = useState(c.settings.slippage);
  const [domain, setDomain] = useState(c.settings.domain);
  const [version, setVersion] = useState(c.settings.version);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [reset, setReset] = useState(false);
  function save() {
    const r = rpcSchema.safeParse(url);
    const s = settingsSchema.safeParse({ priority, slippage, domain, version });
    if (!r.success) {
      setError(r.error.issues[0]?.message ?? "Invalid RPC URL.");
      return;
    }
    if (!s.success) {
      setError(s.error.issues[0]?.message ?? "Invalid settings.");
      return;
    }
    setError("");
    c.setNetwork(network);
    c.setRpc(r.data);
    c.setSettings({ ...s.data, commitment });
    c.log("Session settings updated", "Settings");
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  }
  return (
    <>
      <PageHeading
        eyebrow="SYSTEM / ENVIRONMENT"
        title="System"
        description="Network, execution policy and provenance parameters. No private keys, ever."
        action={
          <span>
            <Link to="/network-lab" className="desk-link">
              Network Test Centre
            </Link>{" "}
            <Button onClick={save}>
              {saved ? <Check /> : <Save />}
              {saved ? "Saved this session" : "Apply settings"}
            </Button>
          </span>
        }
      />
      <div className="settings-stack">
        <Panel title="Solana connection" tag={c.rpcHealth.toUpperCase()}>
          <div className="instrument-body form-grid">
            <Field label="Network">
              <select
                value={network}
                onChange={(e) => {
                  const n = e.target.value === "devnet" ? "devnet" : "mainnet-beta";
                  setNetwork(n);
                  setUrl(
                    n === "devnet"
                      ? "https://api.devnet.solana.com"
                      : "https://api.mainnet-beta.solana.com",
                  );
                }}
              >
                <option value="mainnet-beta">Mainnet</option>
                <option value="devnet">Devnet</option>
              </select>
            </Field>
            <Field label="Commitment">
              <select
                value={commitment}
                onChange={(e) =>
                  setCommitment(
                    e.target.value === "processed"
                      ? "processed"
                      : e.target.value === "finalized"
                        ? "finalized"
                        : "confirmed",
                  )
                }
              >
                {["processed", "confirmed", "finalized"].map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </select>
            </Field>
            <div className="sm:col-span-2">
              <Field
                label="RPC URL"
                hint="Use a public HTTPS endpoint. Do not put private credentials into a URL."
              >
                <input
                  type="url"
                  maxLength={2048}
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                />
              </Field>
            </div>
          </div>
        </Panel>
        <Panel title="Transaction policy">
          <div className="instrument-body form-grid">
            <Field label="Priority fee (micro-lamports / CU)">
              <input
                type="number"
                min={0}
                max={10000000}
                value={priority}
                onChange={(e) => setPriority(e.target.valueAsNumber)}
              />
            </Field>
            <Field label="Default max slippage (bps)">
              <input
                type="number"
                min={1}
                max={500}
                value={slippage}
                onChange={(e) => setSlippage(e.target.valueAsNumber)}
              />
            </Field>
            <div className="sm:col-span-2 notice">
              Session preferences are preview-only. Execution plans display their own explicit
              limits; no automatic transaction submission.
            </div>
          </div>
        </Panel>
        <Panel title="Protocol / provenance">
          <div className="instrument-body">
            <Field label="Meteora DBC program ID (read-only)">
              <input readOnly value={DBC_PROGRAM_ID} className="font-mono text-xs" />
            </Field>
            <CopyValue value={DBC_PROGRAM_ID} />
            <div className="form-grid mt-5">
              <Field label="PQ domain">
                <input value={domain} maxLength={100} onChange={(e) => setDomain(e.target.value)} />
              </Field>
              <Field label="PQ version">
                <input
                  value={version}
                  maxLength={20}
                  onChange={(e) => setVersion(e.target.value)}
                />
              </Field>
            </div>
            <div className="detail-rows mt-4">
              <div>
                <span>Default migration</span>
                <strong>MET_DAMM_V2</strong>
              </div>
              <div>
                <span>Identity parameters</span>
                <strong>WOTS-16 / SHA-256 / h=8</strong>
              </div>
            </div>
          </div>
        </Panel>
        {error && (
          <div className="error-message mb-5" role="alert">
            {error}
          </div>
        )}
        <Panel title="Reset simulation" tag="DANGER ZONE">
          <div className="instrument-body">
            <p className="text-muted-foreground text-xs leading-7">
              Reset local audit events, saved strategies, session policies, agent mode and open
              execution plans. Does not affect your wallet or any on-chain account.
            </p>
            <Button variant="outline" className="mt-4" onClick={() => setReset(true)}>
              <Trash2 />
              Reset simulation state
            </Button>
          </div>
        </Panel>
      </div>
      <Dialog open={reset} onOpenChange={setReset}>
        <DialogContent>
          <DialogTitle>Reset simulation?</DialogTitle>
          <DialogDescription>
            This clears this session’s audit events, saved strategies, policies and agent mode. No
            on-chain assets are affected.
          </DialogDescription>
          <Button variant="outline" onClick={() => setReset(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => {
              c.reset();
              setReset(false);
            }}
          >
            <Trash2 />
            Reset local simulation
          </Button>
        </DialogContent>
      </Dialog>
    </>
  );
}
