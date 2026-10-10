import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  ArrowLeft,
  ArrowRight,
  Code2,
  Rocket,
  ShieldCheck,
  Search,
  LoaderCircle,
  Fingerprint,
  Upload,
  Stamp,
} from "lucide-react";
import { Connection } from "@solana/web3.js";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { PageHeading, Panel, Field, InfoTip, CopyValue } from "./controls";
import {
  launchSchema,
  STEP_FIELDS,
  SIGNATURE_SCHEMES,
  DAMM_V2_FEE_OPTIONS,
  resolveQuoteMint,
  type LaunchDraft,
} from "@/lib/qli-core/validation";
import { useConsole } from "@/lib/qli-core/context";
import {
  DBC_PROGRAM_ID,
  PERMISSIONLESS_QUOTES,
  sdkMethodPlan,
  tokenBadgeState,
} from "@/lib/qli-core/dbc";
import {
  RWA_PRESETS,
  RWA_REGISTRY_LABEL,
  RWA_ELIGIBILITY,
  ONDO_NOTE,
  searchRwa,
  findRwa,
  verifyMintOnRpc,
  type MintCheck,
} from "@/lib/qli-core/rwa";
import { DOMAINS, hex, messageDigest, proofBytes, type WotsProof } from "@/lib/qli-core/pq";
import { signLeaf } from "@/lib/qli-core/identity";
import { initialLaunch, launchDigest } from "@/lib/qli-core/launch-draft";

const STEPS = ["Asset", "Curve", "Fees", "Migration", "Quote Market", "First Buy", "Review"];
function CurvePreview({ d }: { d: LaunchDraft }) {
  const pts = Array.from({ length: 41 }, (_, i) => {
    const t = i / 40;
    let y: number;
    switch (d.builder) {
      case "Two Segments":
        y = t < 0.5 ? t * 0.6 : 0.3 + (t - 0.5) * 1.4;
        break;
      case "Liquidity Weights":
        y = Math.pow(t, 1.6);
        break;
      case "Custom":
        y = t;
        break;
      default:
        y = Math.pow(t, 2.2);
    }
    return [t * 300, 140 - y * 125] as const;
  });
  const path = pts.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(" ");
  const mx = 300 * (d.supplyMigration / 100);
  return (
    <div
      className="curve-preview span-2"
      aria-label={`${d.builder} curve preview from ${d.initialCap} to ${d.migrationCap} USD market cap`}
      role="img"
    >
      <div className="flex justify-between micro mb-2">
        <span>PRICE / SUPPLY · {d.builder.toUpperCase()}</span>
        <span>ILLUSTRATIVE · SDK DERIVES FINAL SEGMENTS</span>
      </div>
      <svg viewBox="0 0 300 150" preserveAspectRatio="none">
        <g stroke="currentColor" strokeOpacity=".12">
          {[30, 60, 90, 120].map((y) => (
            <line key={y} x1="0" x2="300" y1={y} y2={y} />
          ))}
        </g>
        <path d={path} fill="none" stroke="currentColor" strokeWidth="1.2" />
        <line
          x1={mx}
          x2={mx}
          y1="0"
          y2="150"
          stroke="currentColor"
          strokeDasharray="3 4"
          strokeOpacity=".6"
        />
        <text x={Math.min(mx + 4, 220)} y="12" fontSize="7" fill="currentColor" opacity=".7">
          MIGRATION · {d.supplyMigration}% SUPPLY
        </text>
      </svg>
      <div className="flex justify-between micro mt-2">
        <span>${d.initialCap.toLocaleString()}</span>
        <span>
          {d.quoteThreshold}{" "}
          {d.quoteKind === "tokenized" ? (findRwa(d.tokenizedMint)?.symbol ?? "quote") : d.quote} →
          DAMM v2
        </span>
        <span>${d.migrationCap.toLocaleString()}</span>
      </div>
    </div>
  );
}

export function LaunchPage() {
  const c = useConsole();
  const [step, setStep] = useState(0);
  const [d, setD] = useState(initialLaunch);
  const [error, setError] = useState("");
  const [json, setJson] = useState(false);
  const [q, setQ] = useState("");
  const [checks, setChecks] = useState<Record<string, MintCheck>>({});
  const [checking, setChecking] = useState(false);
  const [preview, setPreview] = useState("");
  const [seal, setSeal] = useState<WotsProof | null>(null);
  const [sealBusy, setSealBusy] = useState(false);
  const update = <K extends keyof LaunchDraft>(key: K, value: LaunchDraft[K]) => {
    setD((v) => ({ ...v, [key]: value }));
    setError("");
    if (key !== "firstBuyAmount") setSeal(null);
  };
  function num(key: keyof LaunchDraft, label: string, hint?: string, tip?: string) {
    return (
      <Field label={label} hint={hint}>
        <input
          type="number"
          step="any"
          inputMode="decimal"
          aria-label={label}
          value={String(d[key])}
          onChange={(e) =>
            update(key, (isNaN(e.target.valueAsNumber) ? 0 : e.target.valueAsNumber) as never)
          }
        />
        {tip ? <InfoTip text={tip} /> : null}
      </Field>
    );
  }
  function text(key: keyof LaunchDraft, label: string, hint?: string, placeholder?: string) {
    return (
      <Field label={label} hint={hint}>
        <input
          type="text"
          aria-label={label}
          maxLength={key === "description" ? 500 : 2048}
          placeholder={placeholder}
          value={String(d[key])}
          onChange={(e) =>
            update(key, (key === "symbol" ? e.target.value.toUpperCase() : e.target.value) as never)
          }
        />
      </Field>
    );
  }
  const quoteMint = resolveQuoteMint(d);
  const check = checks[quoteMint] ?? ({ status: "unverified" } as MintCheck);
  const known = PERMISSIONLESS_QUOTES[quoteMint];
  const rwa = findRwa(quoteMint);
  const badge = tokenBadgeState(quoteMint, check.status === "verified" ? check : undefined);
  const quoteSymbol =
    d.quoteKind === "tokenized"
      ? (rwa?.symbol ?? "Custom RWA")
      : d.quote === "Custom"
        ? "Custom"
        : d.quote;
  const plan = sdkMethodPlan({
    mode: d.mode,
    symbol: d.symbol,
    quoteMint,
    quoteDecimals: check.status === "verified" ? check.decimals : null,
    quoteVerified: check.status === "verified",
    firstBuy: d.firstBuy,
    firstBuyAmount: d.firstBuyAmount,
    badge,
  });
  const scheme = SIGNATURE_SCHEMES.find((s) => s.id === d.scheme) ?? SIGNATURE_SCHEMES[0];
  const { canonical, digest } = useMemo(() => launchDigest(d), [d]);
  const results = useMemo(() => searchRwa(q), [q]);
  async function verifyQuote() {
    setChecking(true);
    try {
      const r = await verifyMintOnRpc(
        new Connection(c.rpc, { commitment: c.settings.commitment, disableRetryOnRateLimit: true }),
        quoteMint,
      );
      setChecks((v) => ({ ...v, [quoteMint]: r }));
      c.log(
        `Quote mint ${r.status === "verified" ? "verified" : "check failed"} · ${quoteSymbol}`,
        "RPC",
      );
    } finally {
      setChecking(false);
    }
  }
  function next() {
    const parsed = launchSchema.safeParse(d);
    const keys = STEP_FIELDS[step] ?? [];
    const issue = !parsed.success
      ? parsed.error.issues.find((i) => keys.includes(String(i.path[0]) as keyof LaunchDraft))
      : undefined;
    if (issue) {
      setError(issue.message);
      return;
    }
    setError("");
    setStep((s) => Math.min(6, s + 1));
  }
  async function prepareSeal() {
    const tree = c.getTree();
    if (!tree || !c.identity) return;
    setSealBusy(true);
    try {
      const leaf = c.nextLeaf();
      if (leaf < 0) throw new Error("Leaf budget exhausted.");
      c.reserveLeaf(leaf, `launch:${d.symbol}`);
      const proof = await signLeaf(tree, leaf, DOMAINS.launch, canonical, c.identity.label);
      setSeal(proof);
      c.log(`Attestation Seal prepared locally · leaf #${leaf}`, "Proof", d.symbol);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Seal failed.");
    } finally {
      setSealBusy(false);
    }
  }
  function review() {
    const r = launchSchema.safeParse(d);
    if (!r.success) {
      setError(r.error.issues[0]?.message ?? "Invalid launch draft.");
      return;
    }
    if (d.mode === "quantum" && !c.identity) {
      setError("Quantum Launch requires an open Quantum QLi Identity.");
      return;
    }
    c.setPlan({
      title: `${d.symbol} · ${d.mode === "quantum" ? "Quantum" : "Standard"} Launch Plan`,
      steps: [
        ...plan.methods.map((m) => `SDK: ${m}`),
        `Quote ${quoteSymbol} · ${quoteMint} · badge ${badge}`,
        ...(plan.liveBlocked.length
          ? [`Live construction blocked: ${plan.liveBlocked.join("; ")}.`]
          : ["Quote checks passed; unsigned build still requires wallet + RPC."]),
        "Checkpoint 1: wallet signs config transaction after review + simulation.",
        "Checkpoint 2: wallet signs pool transaction after review + simulation.",
      ],
      accounts: [
        DBC_PROGRAM_ID,
        quoteMint,
        "Config keypair (not generated in preview)",
        "Base mint keypair (not generated in preview)",
        c.account?.address ?? "Creator wallet (not connected)",
      ],
      fee: "RPC estimate required + rent",
      signatures: plan.checkpoints,
    });
    c.log(`${d.symbol} ${d.mode} launch review generated`, "Launch", d.symbol);
  }
  const attestation = {
    [DOMAINS.launch]: {
      scheme: d.scheme,
      identity: c.identity?.address ?? null,
      root: c.identity?.root ?? null,
      publicSeed: c.identity?.publicSeed ?? null,
      launchDigest: digest,
      proof: seal ?? null,
      seal: seal ? { leaf: seal.leaf, bytes: proofBytes(seal), label: seal.label } : "not prepared",
    },
  };
  const summary = {
    mode: d.mode,
    draft: d,
    quoteMint,
    quoteDecimals: check.status === "verified" ? check.decimals : "unverified in this session",
    tokenBadge: badge,
    sdk: plan,
    status: "unsigned · not built",
    ...(d.mode === "quantum" ? { metadataExtensions: attestation } : {}),
  };
  return (
    <>
      <PageHeading
        eyebrow="LAUNCH / METEORA DBC"
        title="Launch Forge"
        description="Two launch modes, one review discipline. Every account, signer and SDK call is shown before a wallet is asked to sign."
      />
      <div className="mode-switch" role="group" aria-label="Launch mode">
        <button
          type="button"
          aria-pressed={d.mode === "standard"}
          onClick={() => update("mode", "standard")}
        >
          <span className="micro">MODE A</span>
          <strong>Standard Launch</strong>
          <span>
            DBC config + pool with Quantum QLi transaction review. No attestation required.
          </span>
        </button>
        <button
          type="button"
          aria-pressed={d.mode === "quantum"}
          onClick={() => update("mode", "quantum")}
        >
          <span className="micro">MODE B</span>
          <strong>Quantum Launch</strong>
          <span>
            Adds an Attestation Seal rooted in your Quantum QLi Identity Root, embedded in token
            metadata.
          </span>
        </button>
      </div>
      {d.mode === "quantum" && (
        <Panel
          title="Attestation Seal"
          tag={
            c.identity
              ? c.identity.label === "public-demo"
                ? "PUBLIC DEMO IDENTITY"
                : "REFERENCE IDENTITY"
              : "IDENTITY REQUIRED"
          }
        >
          <div className="instrument-body two-col">
            <div>
              <div className="eyebrow mb-3">SIGNATURE SCHEME</div>
              <div className="choice-list" role="group" aria-label="Signature scheme">
                {SIGNATURE_SCHEMES.map((s) => (
                  <button
                    type="button"
                    key={s.id}
                    className="choice"
                    aria-pressed={d.scheme === s.id}
                    onClick={() => update("scheme", s.id)}
                  >
                    <span>
                      {s.label}
                      <small>{s.note}</small>
                    </span>
                    <span className="status-tag">{s.status.toUpperCase()}</span>
                  </button>
                ))}
              </div>
            </div>
            <div>
              <div className="detail-rows">
                <div>
                  <span>Identity</span>
                  <strong>{c.identity ? `${c.identity.address.slice(0, 14)}…` : "Not open"}</strong>
                </div>
                <div>
                  <span>Leaf Budget</span>
                  <strong>{c.ledger ? `${256 - c.ledger.used.length} / 256` : "—"}</strong>
                </div>
                <div>
                  <span>Next leaf</span>
                  <strong>{c.identity ? `#${c.nextLeaf()}` : "—"}</strong>
                </div>
                <div>
                  <span>Root of trust</span>
                  <strong>WOTS-16 / Merkle h=8</strong>
                </div>
              </div>
              {!c.identity ? (
                <div className="notice mt-4">
                  <Fingerprint size={16} />
                  <span>
                    Open a Quantum QLi Identity first.{" "}
                    <Link to="/identity" className="underline">
                      Go to Identity →
                    </Link>
                  </span>
                </div>
              ) : (
                <div className="notice mt-4">
                  <ShieldCheck size={16} />
                  {d.scheme === "wots"
                    ? "Many-time schemes are certified by one WOTS leaf before use. WOTS root sealing is wired as a Quantum QLi reference implementation."
                    : "Production cryptographic implementation pending for this scheme. A seal cannot be produced with it yet."}
                </div>
              )}
            </div>
          </div>
        </Panel>
      )}
      <div className="notice mb-6">
        <ShieldCheck size={16} />
        Simulation draft. No config or pool is created here. A live build requires a connected
        wallet, a verified quote mint, an SDK-derived curve and your review of the unsigned bytes.
      </div>
      <div className="wizard-steps" style={{ gridTemplateColumns: "repeat(7,1fr)" }}>
        {STEPS.map((s, i) => (
          <Button
            key={s}
            variant="ghost"
            disabled={i > step}
            className={step === i ? "current" : ""}
            aria-current={step === i ? "step" : undefined}
            onClick={() => {
              setStep(i);
              setError("");
            }}
          >
            <span>{String(i + 1).padStart(2, "0")}</span>
            {s}
          </Button>
        ))}
      </div>
      <div className="wizard-layout">
        <section className="instrument">
          <div className="wizard-form">
            <h2>
              {String(step + 1).padStart(2, "0")} / {STEPS[step]}
            </h2>
            <div className="form-grid">
              {step === 0 && (
                <>
                  <Field
                    label="Image (local preview)"
                    hint="Preview stays in this browser. Pin the file to IPFS/HTTPS, then paste its URI."
                  >
                    <label
                      className="choice"
                      style={{ justifyContent: "flex-start", position: "relative" }}
                    >
                      <Upload size={14} />
                      {preview ? "Replace image" : "Choose image"}
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        className="sr-only"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (!f) return;
                          if (!["image/png", "image/jpeg", "image/webp"].includes(f.type)) {
                            setError("Choose a PNG, JPEG or WebP image.");
                            return;
                          }
                          if (f.size > 5_000_000) {
                            setError("Image must be under 5 MB.");
                            return;
                          }
                          if (preview) URL.revokeObjectURL(preview);
                          setPreview(URL.createObjectURL(f));
                        }}
                      />
                    </label>
                  </Field>
                  <div className="field">
                    {preview || d.image ? (
                      <img
                        src={preview || d.image}
                        alt="Token image preview"
                        style={{
                          width: 88,
                          height: 88,
                          objectFit: "cover",
                          border: "1px solid var(--border)",
                        }}
                      />
                    ) : (
                      <span className="micro">NO IMAGE</span>
                    )}
                  </div>
                  {text("image", "Image URI", "HTTPS or IPFS.", "ipfs://…")}
                  {text("name", "Token name")}
                  {text("symbol", "Ticker")}
                  {text("metadata", "Metadata URI", "HTTPS or IPFS JSON.")}
                  <div className="span-2">
                    {text("description", "Description", "Up to 500 characters.")}
                  </div>
                  {text("twitter", "X / Twitter", "@handle or x.com URL")}
                  {text("website", "Website", "https://…")}
                  {text("telegram", "Telegram", "https://t.me/…")}
                  <Field label="Vanity CA">
                    <Switch
                      aria-label="Vanity CA"
                      checked={d.vanity}
                      onCheckedChange={(v) => update("vanity", v)}
                    />
                  </Field>
                  {d.vanity && (
                    <>
                      <Field label="Vanity suffix (1–3 base58 characters)">
                        <input
                          aria-label="Vanity suffix"
                          maxLength={3}
                          value={d.vanitySuffix}
                          onChange={(e) => update("vanitySuffix", e.target.value)}
                        />
                      </Field>
                      <div className="notice span-2">
                        Suffix preference is included in your launch manifest. Live vanity
                        generation requires a bounded local key generator; no mint address is
                        fabricated.
                      </div>
                    </>
                  )}
                  {num("decimals", "Base decimals (6–9)")}
                  {num("supply", "Total supply")}
                  <Field label="Token standard">
                    <select
                      aria-label="Token standard"
                      value={d.tokenType}
                      onChange={(e) =>
                        update("tokenType", e.target.value as LaunchDraft["tokenType"])
                      }
                    >
                      <option>SPL</option>
                      <option>Token-2022</option>
                    </select>
                  </Field>
                </>
              )}
              {step === 1 && (
                <>
                  <Field label="Curve builder">
                    <select
                      aria-label="Curve builder"
                      value={d.builder}
                      onChange={(e) => update("builder", e.target.value as LaunchDraft["builder"])}
                    >
                      {["Market Cap", "Two Segments", "Liquidity Weights", "Custom"].map((x) => (
                        <option key={x}>{x}</option>
                      ))}
                    </select>
                  </Field>
                  {num("initialCap", "Initial market cap (USD)")}
                  {num("migrationCap", "Migration market cap (USD)")}
                  {num(
                    "quoteThreshold",
                    `Migration quote threshold (${quoteSymbol})`,
                    undefined,
                    "Quote reserve at which the pool migrates to DAMM v2.",
                  )}
                  {num("supplyMigration", "Supply at migration (%)")}
                  <CurvePreview d={d} />
                  {d.builder === "Custom" && (
                    <div className="notice span-2">
                      Custom curve points must be supplied and validated through the SDK before
                      deployment.
                    </div>
                  )}
                </>
              )}
              {step === 2 && (
                <>
                  {num("startingBps", "Starting fee (bps)")}
                  {num("endingBps", "Ending fee (bps)")}
                  <Field label="Fee behavior">
                    <select
                      aria-label="Fee behavior"
                      value={d.scheduler}
                      onChange={(e) =>
                        update("scheduler", e.target.value as LaunchDraft["scheduler"])
                      }
                    >
                      {["Linear", "Exponential", "Fixed"].map((x) => (
                        <option key={x}>{x}</option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Collect-fee mode">
                    <select
                      aria-label="Collect-fee mode"
                      value={d.collectMode}
                      onChange={(e) =>
                        update("collectMode", e.target.value as LaunchDraft["collectMode"])
                      }
                    >
                      <option>Quote only</option>
                      <option>Both tokens</option>
                    </select>
                  </Field>
                  {num("creatorFee", "Creator trading fee share (%)")}
                  {num("creationFee", "Pool creation fee (SOL)")}
                  <Field label="Migrated DAMM v2 pool fee">
                    <select
                      aria-label="Migrated DAMM v2 pool fee"
                      value={d.dammFee}
                      onChange={(e) => update("dammFee", Number(e.target.value))}
                    >
                      {DAMM_V2_FEE_OPTIONS.map((x) => (
                        <option key={x} value={x}>
                          {x} bps
                        </option>
                      ))}
                    </select>
                  </Field>
                  <div className="module-row">
                    <span>
                      Dynamic fee{" "}
                      <InfoTip text="Adds a volatility-based component on top of the base fee." />
                    </span>
                    <Switch
                      aria-label="Dynamic fee"
                      checked={d.dynamic}
                      onCheckedChange={(v) => update("dynamic", v)}
                    />
                  </div>
                </>
              )}
              {step === 3 && (
                <>
                  <Field label="Migration target">
                    <input
                      readOnly
                      aria-label="Migration target"
                      value="MET_DAMM_V2 · DAMM v2 only"
                    />
                  </Field>
                  <div />
                  {num("partnerLiquidity", "Partner liquidity (%)")}
                  {num("creatorLiquidity", "Creator liquidity (%)")}
                  {num("partnerLocked", "Partner permanent lock (%)")}
                  {num("creatorLocked", "Creator permanent lock (%)")}
                  {num("vesting", "Vesting duration (days)")}
                  {text(
                    "leftoverReceiver",
                    "Surplus / leftover receiver",
                    "Defaults to the config authority when empty.",
                  )}
                  <div className="notice span-2">
                    Shares {d.partnerLiquidity}% / {d.creatorLiquidity}% · locked {d.partnerLocked}%
                    + {d.creatorLocked}% · unlocked{" "}
                    {Math.max(0, 100 - d.partnerLocked - d.creatorLocked)}%. Surplus quote and
                    leftover base go to {d.leftoverReceiver || "the config authority"}. DAMM v1 is
                    not offered for new configs. Permanent locks cannot be undone.
                  </div>
                </>
              )}
              {step === 4 && (
                <>
                  <div
                    className="span-2 segmented"
                    style={{ margin: 0 }}
                    role="group"
                    aria-label="Quote market type"
                  >
                    <button
                      type="button"
                      className={d.quoteKind === "crypto" ? "selected" : ""}
                      aria-pressed={d.quoteKind === "crypto"}
                      onClick={() => update("quoteKind", "crypto")}
                    >
                      Crypto
                    </button>
                    <button
                      type="button"
                      className={d.quoteKind === "tokenized" ? "selected" : ""}
                      aria-pressed={d.quoteKind === "tokenized"}
                      onClick={() => update("quoteKind", "tokenized")}
                    >
                      Tokenized Markets
                    </button>
                  </div>
                  {d.quoteKind === "crypto" ? (
                    <>
                      <Field label="Quote token">
                        <select
                          aria-label="Quote token"
                          value={d.quote}
                          onChange={(e) => update("quote", e.target.value as LaunchDraft["quote"])}
                        >
                          {["SOL", "USDC", "Custom"].map((x) => (
                            <option key={x}>{x}</option>
                          ))}
                        </select>
                      </Field>
                      {d.quote === "Custom" ? (
                        text("customMint", "Custom quote mint")
                      ) : (
                        <Field label="Quote mint">
                          <input readOnly aria-label="Quote mint" value={quoteMint} />
                        </Field>
                      )}
                    </>
                  ) : (
                    <>
                      <div className="span-2">
                        <div className="flex justify-between items-center mb-2">
                          <span className="micro">
                            {RWA_PRESETS.length} PRESETS · {RWA_REGISTRY_LABEL.toUpperCase()}
                          </span>
                        </div>
                        <div className="search-field" style={{ maxWidth: "none" }}>
                          <Search />
                          <input
                            aria-label="Search tokenized markets"
                            placeholder="Search symbol, company, ETF or mint…"
                            value={q}
                            onChange={(e) => setQ(e.target.value)}
                          />
                        </div>
                      </div>
                      <div
                        className="span-2 rwa-list"
                        role="listbox"
                        aria-label="Tokenized market quote assets"
                      >
                        {results.length ? (
                          results.map((a) => (
                            <button
                              type="button"
                              role="option"
                              aria-selected={d.tokenizedMint === a.mint}
                              aria-pressed={d.tokenizedMint === a.mint}
                              key={a.mint}
                              className="rwa-row"
                              onClick={() => update("tokenizedMint", a.mint)}
                            >
                              <strong>{a.symbol}</strong>
                              <span>
                                {a.name}
                                <small className="micro block">
                                  {a.family} · {a.issuer} · {a.type}
                                </small>
                              </span>
                              <code>{a.mint}</code>
                            </button>
                          ))
                        ) : (
                          <div className="empty-state" role="status">
                            No preset matches. Use the additional mint field below.
                          </div>
                        )}
                      </div>
                      <div className="span-2">
                        {text(
                          "tokenizedMint",
                          "Additional tokenized market mint",
                          "Ondo Global Markets or other Solana RWA mint. Validate on RPC before use.",
                        )}
                      </div>
                      <div className="notice span-2">{ONDO_NOTE}</div>
                    </>
                  )}
                  <div className="span-2 detail-rows">
                    <div>
                      <span>Mint</span>
                      <strong>{quoteMint || "—"}</strong>
                    </div>
                    <div>
                      <span>Issuer / family</span>
                      <strong>
                        {known
                          ? "Native / Circle"
                          : rwa
                            ? `${rwa.issuer} · ${rwa.family}`
                            : "Unknown — verify issuer"}
                      </strong>
                    </div>
                    <div>
                      <span>Asset type</span>
                      <strong>
                        {known
                          ? "Crypto"
                          : rwa
                            ? rwa.type
                            : d.quoteKind === "tokenized"
                              ? "Tokenized market"
                              : "Custom"}
                      </strong>
                    </div>
                    <div>
                      <span>Verification</span>
                      <strong>
                        {check.status === "verified"
                          ? `Verified · ${check.program}`
                          : check.status === "failed"
                            ? `Failed · ${check.reason}`
                            : "Unverified in this session"}
                      </strong>
                    </div>
                    <div>
                      <span>Decimals</span>
                      <strong>
                        {check.status === "verified" ? check.decimals : "after RPC check"}
                      </strong>
                    </div>
                    <div>
                      <span>DBC token badge</span>
                      <strong>{badge}</strong>
                    </div>
                  </div>
                  <div className="span-2 flex gap-3 flex-wrap">
                    <Button
                      variant="outline"
                      disabled={checking || !quoteMint}
                      onClick={verifyQuote}
                    >
                      {checking ? <LoaderCircle className="animate-spin" /> : <Search />}Verify mint
                      on {c.network}
                    </Button>
                  </div>
                  <div className="notice span-2">
                    PoolConfig accepts an arbitrary quote mint with any decimals (SDK 1.5.13). Mints
                    outside the permissionless set may require a Meteora DBC token badge passed as a
                    remaining account. {d.quoteKind === "tokenized" && RWA_ELIGIBILITY}
                  </div>
                </>
              )}
              {step === 5 && (
                <>
                  {num("launchSlippage", "Launch slippage (%)")}
                  {num("prioritySol", "Launch priority fee (SOL)")}
                  <Field label="First buy">
                    <select
                      aria-label="First buy"
                      value={d.firstBuy}
                      onChange={(e) =>
                        update("firstBuy", e.target.value as LaunchDraft["firstBuy"])
                      }
                    >
                      <option value="none">No first buy</option>
                      <option value="creator">Creator first buy</option>
                      <option value="partner-and-creator">Partner + creator first buy</option>
                    </select>
                  </Field>
                  {d.firstBuy !== "none" ? (
                    num("firstBuyAmount", `Amount (${quoteSymbol})`)
                  ) : (
                    <div />
                  )}
                  <div className="notice span-2">
                    {d.firstBuy === "none"
                      ? "Pool is created without an initial swap."
                      : `Bundled into DBC pool initialization via ${d.firstBuy === "creator" ? "creator.createPoolWithFirstBuy" : "creator.createPoolWithPartnerAndCreatorFirstBuy"}. Executes at the first point of the curve; slippage and quote balance are checked during simulation.`}
                  </div>
                </>
              )}
              {step === 6 && (
                <>
                  <div className="span-2 detail-rows">
                    <div>
                      <span>Mode</span>
                      <strong>{d.mode === "quantum" ? "Quantum Launch" : "Standard Launch"}</strong>
                    </div>
                    <div>
                      <span>Token</span>
                      <strong>
                        {d.name} ({d.symbol}) · {d.tokenType}
                      </strong>
                    </div>
                    <div>
                      <span>Supply</span>
                      <strong>
                        {d.supply.toLocaleString()} · {d.decimals} decimals
                      </strong>
                    </div>
                    <div>
                      <span>Program</span>
                      <strong>{DBC_PROGRAM_ID}</strong>
                    </div>
                    <div>
                      <span>Quote mint</span>
                      <strong>
                        {quoteSymbol} · {quoteMint}
                      </strong>
                    </div>
                    <div>
                      <span>Token badge</span>
                      <strong>{badge}</strong>
                    </div>
                    <div>
                      <span>Migration</span>
                      <strong>
                        {d.quoteThreshold} {quoteSymbol} → DAMM v2 · {d.dammFee} bps
                      </strong>
                    </div>
                    <div>
                      <span>Fees</span>
                      <strong>
                        {d.startingBps} → {d.endingBps} bps · {d.scheduler}
                        {d.dynamic ? " · dynamic" : ""}
                      </strong>
                    </div>
                    <div>
                      <span>First buy</span>
                      <strong>
                        {d.firstBuy === "none"
                          ? "None"
                          : `${d.firstBuyAmount} ${quoteSymbol} · ${d.firstBuy}`}
                      </strong>
                    </div>
                    <div>
                      <span>Signers</span>
                      <strong>
                        {plan.signers.length} · {plan.checkpoints} wallet checkpoints
                      </strong>
                    </div>
                    <div>
                      <span>Unsigned transaction</span>
                      <strong>Not built</strong>
                    </div>
                    <div>
                      <span>Simulation</span>
                      <strong>Not run · requires build</strong>
                    </div>
                  </div>
                  <div className="span-2">
                    <div className="eyebrow mb-2">SDK METHOD PLAN</div>
                    <pre className="code-block">{plan.methods.join("\n")}</pre>
                    {plan.liveBlocked.length > 0 && (
                      <div className="notice mt-3">
                        Live construction blocked: {plan.liveBlocked.join(" · ")}.
                      </div>
                    )}
                  </div>
                  {d.mode === "quantum" && (
                    <div className="span-2">
                      <div className="eyebrow mb-2">QUANTUM ATTESTATION</div>
                      <div className="detail-rows">
                        <div>
                          <span>Identity</span>
                          <strong>{c.identity?.address ?? "Not open"}</strong>
                        </div>
                        <div>
                          <span>Root</span>
                          <strong>{c.identity?.root ?? "—"}</strong>
                        </div>
                        <div>
                          <span>Public seed</span>
                          <strong>{c.identity?.publicSeed ?? "—"}</strong>
                        </div>
                        <div>
                          <span>Scheme</span>
                          <strong>{scheme.label}</strong>
                        </div>
                        <div>
                          <span>Next leaf / budget</span>
                          <strong>
                            {c.identity
                              ? `#${c.nextLeaf()} · ${256 - (c.ledger?.used.length ?? 0)} left`
                              : "—"}
                          </strong>
                        </div>
                        <div>
                          <span>Launch digest</span>
                          <strong>{digest}</strong>
                        </div>
                        <div>
                          <span>Seal</span>
                          <strong>
                            {seal
                              ? `Attestation prepared locally · leaf #${seal.leaf} · ${proofBytes(seal)} B${seal.label === "public-demo" ? " · PUBLIC DEMO, not valid for a live launch" : ""}`
                              : d.scheme === "wots"
                                ? "Not prepared"
                                : "Production cryptographic implementation pending"}
                          </strong>
                        </div>
                      </div>
                      <div className="flex gap-3 mt-3 flex-wrap">
                        <Button
                          variant="outline"
                          disabled={!c.identity || d.scheme !== "wots" || !!seal || sealBusy}
                          onClick={prepareSeal}
                        >
                          {sealBusy ? <LoaderCircle className="animate-spin" /> : <Stamp />}Prepare
                          Attestation Seal (consumes 1 leaf)
                        </Button>
                        {seal && <CopyValue value={JSON.stringify(seal)} />}
                      </div>
                      <pre className="code-block mt-3">
                        {JSON.stringify({ extensions: attestation }, null, 2)}
                      </pre>
                    </div>
                  )}
                </>
              )}
            </div>
            {error && (
              <div className="error-message" role="alert">
                {error}
              </div>
            )}
            <div className="form-actions">
              <Button
                variant="outline"
                disabled={step === 0}
                onClick={() => {
                  setStep((s) => s - 1);
                  setError("");
                }}
              >
                <ArrowLeft />
                Back
              </Button>
              <span className="micro">{step + 1} OF 7</span>
              {step < 6 ? (
                <Button onClick={next}>
                  Continue
                  <ArrowRight />
                </Button>
              ) : (
                <Button onClick={review}>
                  <Rocket />
                  Review transaction plan
                </Button>
              )}
            </div>
            <Button
              className="json-toggle mt-4"
              variant="ghost"
              onClick={() => setJson((v) => !v)}
              aria-expanded={json}
            >
              <Code2 />
              {json ? "Hide" : "Show"} advanced JSON
            </Button>
            {json && <pre className="code-block">{JSON.stringify(summary, null, 2)}</pre>}
          </div>
        </section>
        <Panel
          title="Launch manifest"
          tag={d.mode === "quantum" ? "QUANTUM · DRAFT" : "STANDARD · DRAFT"}
          className="wizard-summary"
        >
          <div className="detail-rows">
            <div>
              <span>Token</span>
              <strong>{d.symbol || "Not defined"}</strong>
            </div>
            <div>
              <span>Standard</span>
              <strong>{d.tokenType}</strong>
            </div>
            <div>
              <span>Builder</span>
              <strong>{d.builder}</strong>
            </div>
            <div>
              <span>Quote</span>
              <strong>{quoteSymbol}</strong>
            </div>
            <div>
              <span>Quote check</span>
              <strong>{check.status}</strong>
            </div>
            <div>
              <span>Migration</span>
              <strong>DAMM v2</strong>
            </div>
            <div>
              <span>Network</span>
              <strong>{c.network}</strong>
            </div>
            <div>
              <span>Wallet</span>
              <strong>{c.account ? "Connected" : "Not connected"}</strong>
            </div>
            {d.mode === "quantum" && (
              <div>
                <span>Identity</span>
                <strong>{c.identity ? "Open" : "Required"}</strong>
              </div>
            )}
          </div>
          <div className="notice">
            No wallet signatures are requested during configuration. Live transactions are never
            fabricated.
          </div>
        </Panel>
      </div>
    </>
  );
}
