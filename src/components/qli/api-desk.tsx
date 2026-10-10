import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowUpRight, RotateCw, LoaderCircle, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DeskWindow } from "./window";
import { algorithms, runLocal, type Algorithm } from "@/lib/qli/crypto";
import { QuantumHero } from "./hero";
import { CopyValue, PageHeading } from "@/components/quantek/controls";
export function Playground() {
  const [a, setA] = useState<Algorithm>("ML-DSA-65");
  const [message, setMessage] = useState("hello quantum");
  const [tamper, setTamper] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Awaited<ReturnType<typeof runLocal>> | null>(null);
  const [error, setError] = useState("");
  async function run() {
    setBusy(true);
    setError("");
    setResult(null);
    await new Promise((r) => setTimeout(r, 30));
    try {
      setResult(await runLocal(a, message, tamper));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Cryptographic operation failed.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <DeskWindow title="Cryptography Workbench">
      <p className="test-warning">TEST ENVIRONMENT · KEYS GENERATED IN THIS TAB · NEVER STORED</p>
      <div className="desk-tabs" role="group" aria-label="Playground algorithm">
        {algorithms.map((x) => (
          <Button
            key={x.id}
            variant={a === x.id ? "default" : "outline"}
            disabled={busy}
            aria-pressed={a === x.id}
            onClick={() => {
              setA(x.id);
              setResult(null);
            }}
          >
            {x.id}
          </Button>
        ))}
      </div>
      <input
        aria-label="Test message"
        maxLength={4096}
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        disabled={busy || a === "ML-KEM-768"}
      />
      <label className="checkbox-label">
        <input
          type="checkbox"
          checked={tamper}
          disabled={busy}
          onChange={(e) => setTamper(e.target.checked)}
        />
        {a === "ML-KEM-768"
          ? "Modify ciphertext before decapsulation (should mismatch)"
          : "Modify message before verification (should fail)"}
      </label>
      <div className="desk-actions">
        <Button disabled={busy} onClick={run}>
          {busy ? <LoaderCircle className="animate-spin" /> : <Play />}
          {busy
            ? "Running…"
            : a === "ML-KEM-768"
              ? "Keygen → encapsulate → decapsulate"
              : "Keygen → sign → verify"}
        </Button>
        <Button
          variant="outline"
          disabled={busy}
          onClick={() => {
            setResult(null);
            setError("");
            setMessage("hello quantum");
            setTamper(false);
          }}
        >
          <RotateCw />
          Reset
        </Button>
      </div>
      {error && (
        <p role="alert" className="error-message">
          {error}
        </p>
      )}
      {result && (
        <div className="crypto-result" role="status">
          <strong className={result.valid ? "success-text" : "warning-text"}>
            {result.valid ? "PASS" : "EXPECTED MISMATCH"} · {result.algorithm} · {result.ms} ms
          </strong>
          <p>
            {result.valid
              ? "Cryptographic operation verified."
              : tamper
                ? "Tampering was detected."
                : "Verification failed."}{" "}
            Not a wallet-security or audit certification.
          </p>
          <pre className="code-block">
            {JSON.stringify(
              {
                algorithm: result.algorithm,
                valid: result.valid,
                bytes: result.bytes,
                ...("sharedSecretFingerprint" in result
                  ? { sharedSecretFingerprint: result.sharedSecretFingerprint }
                  : {}),
              },
              null,
              2,
            )}
          </pre>
          <details>
            <summary>Public test material</summary>
            <CopyValue value={JSON.stringify(result)} />
            <pre className="code-block">{JSON.stringify(result, null, 2)}</pre>
          </details>
        </div>
      )}
    </DeskWindow>
  );
}
export function ApiDesk() {
  const [health, setHealth] = useState<{ status: string; ms: number } | null>(null);
  const [checks, setChecks] = useState<number[]>([]);
  useEffect(() => {
    let live = true;
    fetch("/api/public/v1/health")
      .then((r) => {
        if (!r.ok) throw new Error();
        return r.json();
      })
      .then((d) => {
        if (live) {
          setHealth(d);
          setChecks([d.ms]);
          fetch("/api/public/v1/health/history")
            .then((r) => r.json())
            .then((h) => {
              if (live && Array.isArray(h.checks) && h.checks.length)
                setChecks(h.checks.map((x: { ms: number }) => x.ms));
            })
            .catch(() => {});
        }
      })
      .catch(() => {
        if (live) setHealth({ status: "Unavailable", ms: 0 });
      });
    return () => {
      live = false;
    };
  }, []);
  return (
    <>
      <QuantumHero />
      <div className="desk-section-heading">
        <div>
          <p className="eyebrow">CRYPTOGRAPHIC INSTRUMENTS</p>
          <h2>Proof, not promises.</h2>
        </div>
        <Button asChild variant="outline">
          <Link to="/overview">
            Open operations
            <ArrowUpRight />
          </Link>
        </Button>
      </div>
      <div className="desk-stats">
        <div>
          <small>SERVICE HEALTH</small>
          <strong className={health?.status === "ok" ? "success-text" : ""}>
            {health?.status ?? "Checking…"}
          </strong>
        </div>
        <div>
          <small>SELF-TEST TIME</small>
          <strong>{health ? `${health.ms} ms` : "—"}</strong>
        </div>
        <div>
          <small>LIBRARY</small>
          <strong>@noble/post-quantum 0.7.1</strong>
        </div>
      </div>
      <DeskWindow title="Observed Service Checks">
        <div className="desk-stats four">
          <div>
            <small>UPTIME 24H</small>
            <strong>Not recorded</strong>
          </div>
          <div>
            <small>UPTIME 7D</small>
            <strong>Not recorded</strong>
          </div>
          <div>
            <small>AVG RESPONSE · OBSERVED</small>
            <strong>
              {checks.length
                ? `${Math.round(checks.reduce((a, b) => a + b, 0) / checks.length)} ms`
                : "—"}
            </strong>
          </div>
          <div>
            <small>RECORDED CHECKS</small>
            <strong>{checks.length}</strong>
          </div>
        </div>
        <p className="micro mb-3">LATEST OBSERVED CHECKS · NO CONTINUOUS UPTIME CLAIM</p>
        <div
          className="health-bars"
          role="img"
          aria-label="Latest 48 observed self-test slots, empty slots are not uptime"
        >
          {Array.from({ length: 48 }, (_, i) => (
            <i
              key={i}
              className={
                i >= 48 - Math.min(checks.length, 48) && health?.status === "ok" ? "measured" : ""
              }
            />
          ))}
        </div>
        <p className="micro mt-3">
          Grey = no recorded measurement. Observed checks reset with worker instances and
          deployments; gaps are not counted as uptime.
        </p>
      </DeskWindow>
      <DeskWindow title="Algorithm Registry">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Algorithm</th>
                <th>Standard</th>
                <th>Type</th>
                <th>Operations</th>
              </tr>
            </thead>
            <tbody>
              {algorithms.map((a) => (
                <tr key={a.id}>
                  <td>
                    <Link to="/markets" className="desk-link">
                      {a.id}
                    </Link>
                  </td>
                  <td>{a.standard}</td>
                  <td>{a.type}</td>
                  <td>
                    <span className="success-text">
                      {a.type === "signature" ? "verify" : "encapsulate"}: available
                    </span>
                    <br />
                    {a.type === "signature" ? "sign" : "decapsulate"}: unavailable — no custodial
                    key storage
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </DeskWindow>
      <div id="playground">
        <Playground />
      </div>
    </>
  );
}
export function Guide() {
  const [a, setA] = useState<Algorithm>("ML-DSA-65");
  const item = algorithms.find((x) => x.id === a) ?? algorithms[0];
  return (
    <>
      <PageHeading
        eyebrow="CRYPTOGRAPHY / ALGORITHM ATLAS"
        title="Algorithm Atlas"
        description="NIST-standard cryptography · signatures · key encapsulation"
      />
      <div className="algorithm-choices">
        {algorithms.map((x) => (
          <Button
            key={x.id}
            variant={a === x.id ? "default" : "outline"}
            aria-pressed={a === x.id}
            onClick={() => setA(x.id)}
          >
            <strong>{x.id}</strong>
            <small>
              {x.standard} ·{" "}
              {x.type === "signature" ? "Verify authenticity" : "Establish shared secrets"}
            </small>
          </Button>
        ))}
      </div>
      <DeskWindow title="Algorithm Inspector">
        <h2>{item.id}</h2>
        <p className="micro my-3">
          {item.standard} ·{" "}
          {item.type === "kem"
            ? "Lattice-based key encapsulation"
            : item.id === "ML-DSA-65"
              ? "Lattice-based signatures"
              : "Stateless hash-based signatures"}
        </p>
        <p>{item.description} Private signing and decapsulation keys remain in browser memory.</p>
        <div className="desk-stats">
          <div>
            <small>AVAILABLE API OPERATION</small>
            <strong>
              {item.type === "signature" ? "Signature verification" : "Key encapsulation"}
            </strong>
          </div>
          <div>
            <small>SECURITY BOUNDARY</small>
            <strong>No custodial keys</strong>
          </div>
          <div>
            <small>PUBLIC KEY SIZE</small>
            <strong>{item.publicBytes} bytes</strong>
          </div>
        </div>
        <div className="desk-actions">
          <Button asChild>
            <Link to="/">Open playground</Link>
          </Button>
          <Button asChild variant="outline">
            <Link to="/api-docs">API Reference</Link>
          </Button>
        </div>
      </DeskWindow>
      <div className="notice">
        <span>
          <strong>Post-quantum is not a safety guarantee.</strong>
          <br />
          Algorithm selection does not secure ordinary Solana accounts, contracts, your browser, or
          RPC infrastructure. No independent audit has been performed.
        </span>
      </div>
    </>
  );
}
const endpoints = [
  ["GET", "health", "Live ML-DSA signature and ML-KEM roundtrip self-test", "available"],
  ["GET", "algorithms", "Algorithms and operation availability", "available"],
  [
    "GET",
    "health/history",
    "Observed worker self-test checks (volatile; reset on deployment)",
    "available",
  ],
  [
    "POST",
    "signatures/verify",
    "algorithm, message, signature, publicKey (base64) → valid",
    "available",
  ],
  [
    "POST",
    "kem/encapsulate",
    "ML-KEM-768 publicKey → cipherText, sharedSecretFingerprint",
    "available",
  ],
  ["POST", "keys", "Server-held keys", "unavailable"],
  ["POST", "signatures/sign", "Custodial signing", "unavailable"],
  ["POST", "kem/decapsulate", "Custodial decapsulation", "unavailable"],
  ["GET", "usage", "Per-project usage", "unavailable"],
];
export function ApiDocs() {
  const [lang, setLang] = useState("cURL");
  const example =
    lang === "cURL"
      ? `curl -X POST "$APP_ORIGIN/api/public/v1/signatures/verify" \\\n  -H "Content-Type: application/json" \\\n  -d '{"algorithm":"ML-DSA-65","message":"aGVsbG8=","signature":"<base64 signature>","publicKey":"<base64 public key>"}'`
      : lang === "JavaScript"
        ? `const response = await fetch('/api/public/v1/signatures/verify', {\n  method: 'POST', headers: {'Content-Type': 'application/json'},\n  body: JSON.stringify({algorithm: 'ML-DSA-65', message, signature, publicKey})\n});\nconsole.log(await response.json());`
        : `import requests\nr = requests.get(APP_ORIGIN + '/api/public/v1/algorithms')\nprint(r.json())`;
  return (
    <>
      <PageHeading
        eyebrow="DEVELOPER / API REFERENCE"
        title="API Reference"
        description="Public-material operations. Private keys and shared secrets are never returned."
      />
      <DeskWindow title="Public API Endpoints">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Method</th>
                <th>Endpoint</th>
                <th>Contract</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {endpoints.map((e) => (
                <tr key={e[1]}>
                  {e.map((v, i) => (
                    <td key={i}>{i === 1 ? `/api/public/v1/${v}` : v}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </DeskWindow>
      <DeskWindow title="Errors & Limits">
        <p>400 INVALID_BODY — invalid JSON, incorrect content type or body over 64 KB.</p>
        <p>
          400 VALIDATION_ERROR — unknown algorithm, invalid base64 or incorrect key/signature size.
        </p>
        <p>400 INVALID_PUBLIC_KEY — ML-KEM-768 requires a 1,184-byte public key.</p>
        <p>503 — self-test failure. 501 — operation unavailable.</p>
        <p>
          Every response includes requestId and x-request-id. No keys are stored, no HSM is
          configured, and no independent audit is claimed.
        </p>
      </DeskWindow>
      <DeskWindow title={`example.${lang}`}>
        <div className="desk-tabs">
          {["cURL", "JavaScript", "Python"].map((l) => (
            <Button key={l} variant={lang === l ? "default" : "outline"} onClick={() => setLang(l)}>
              {l}
            </Button>
          ))}
        </div>
        <CopyValue value={example} />
        <pre className="code-block">{example}</pre>
      </DeskWindow>
      <Playground />
    </>
  );
}