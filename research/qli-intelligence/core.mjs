// NEMOTRON3.5 Intelligence reference: pure, deterministic and non-custodial.
// NO RPC, model inference, signer, contract deployment, wallet secrets or transactions.
import { createHash, timingSafeEqual } from "node:crypto";

const MAX_SAFE_DEPTH = 24;
const MAX_UINT64 = (1n << 64n) - 1n;
const SHA256 = /^[0-9a-f]{64}$/;
const CLUSTERS = new Set(["devnet", "mainnet-beta"]);

export function canonical(value) {
  function serialize(v, depth) {
    if (depth > MAX_SAFE_DEPTH) throw new RangeError("Canonical payload too deeply nested");
    if (typeof v === "bigint") return '{"$bigint":' + JSON.stringify(v.toString()) + "}";
    if (typeof v === "string" || typeof v === "boolean" || v === null) return JSON.stringify(v);
    if (typeof v === "number") {
      if (!Number.isFinite(v) || !Number.isSafeInteger(v))
        throw new TypeError("Only safe integer JSON numbers");
      return JSON.stringify(v);
    }
    if (Array.isArray(v)) {
      if (v.length > 2048) throw new RangeError("Canonical array too long");
      return "[" + v.map((x) => serialize(x, depth + 1)).join(",") + "]";
    }
    if (typeof v === "object" && v) {
      if (Object.getPrototypeOf(v) !== Object.prototype && Object.getPrototypeOf(v) !== null)
        throw new TypeError("Canonical record must be a plain object");
      const keys = Object.keys(v).sort();
      if (keys.length > 1024) throw new RangeError("Canonical record has too many fields");
      if (keys.some((k) => ["__proto__", "constructor", "prototype"].includes(k)))
        throw new TypeError("Reserved canonical key");
      return (
        "{" + keys.map((k) => JSON.stringify(k) + ":" + serialize(v[k], depth + 1)).join(",") + "}"
      );
    }
    throw new TypeError("Unsupported canonical value");
  }
  const s = serialize(value, 0);
  if (Buffer.byteLength(s, "utf8") > 1024 * 128)
    throw new RangeError("Canonical payload too large");
  return s;
}

export function sha256Domain(domain, payload) {
  if (!/^[A-Z][A-Z0-9-]{2,60}-v[1-9][0-9]*$/.test(domain))
    throw new TypeError("Invalid hash domain");
  return createHash("sha256")
    .update(domain + "\0", "utf8")
    .update(canonical(payload), "utf8")
    .digest("hex");
}

function uint64(value, label, allowZero = false) {
  if (typeof value !== "string" || !/^(0|[1-9][0-9]*)$/.test(value))
    throw new TypeError(label + " must be a decimal unsigned integer string");
  const n = BigInt(value);
  if (n > MAX_UINT64 || (!allowZero && n === 0n))
    throw new RangeError(label + " outside u64 range");
  return n;
}

export function simulateConstantProduct({ reserveIn, reserveOut, amountIn, feeBps = 30 } = {}) {
  const x = uint64(reserveIn, "reserveIn");
  const y = uint64(reserveOut, "reserveOut");
  const a = uint64(amountIn, "amountIn");
  if (!Number.isInteger(feeBps) || feeBps < 0 || feeBps > 1000)
    throw new RangeError("feeBps must be between 0 and 1000");
  // This is a deliberately stated constant-product hypothetical.
  // NOT a Meteora DBC swap quotation, not an actual reserve measurement or a forecast.
  const afterFee = (a * BigInt(10_000 - feeBps)) / 10_000n;
  const fee = a - afterFee;
  const out = (afterFee * y) / (x + afterFee);
  const spotNoFee = (a * y) / x;
  const impactBps =
    spotNoFee === 0n ? 0n : ((spotNoFee > out ? spotNoFee - out : 0n) * 10_000n) / spotNoFee;
  const before = x * y;
  const after = (x + a) * (y - out);
  if (out >= y || after < before) throw new Error("Invariant failure");
  return Object.freeze({
    engine: "constant-product-hypothetical-v1",
    evidenceStatus: "synthetic-assumption",
    amountIn: a.toString(),
    amountAfterFee: afterFee.toString(),
    feeAmount: fee.toString(),
    amountOut: out.toString(),
    reserveInAfter: (x + a).toString(),
    reserveOutAfter: (y - out).toString(),
    impactBps: Number(impactBps),
    feeBps,
    invariantNondecreasing: true,
  });
}

export function stressTestConstantProduct(base) {
  const x = uint64(base?.reserveIn, "reserveIn");
  const y = uint64(base?.reserveOut, "reserveOut");
  const a = uint64(base?.amountIn, "amountIn");
  const feeBps = base.feeBps ?? 30;
  const stresses = [
    { label: "baseline", xBps: 10_000, yBps: 10_000 },
    { label: "reduced-output-liquidity", xBps: 10_000, yBps: 5_000 },
    { label: "increased-output-liquidity", xBps: 10_000, yBps: 15_000 },
    { label: "input-side-shock", xBps: 15_000, yBps: 10_000 },
    { label: "output-side-shock", xBps: 5_000, yBps: 10_000 },
  ];
  const scenarios = stresses.map(({ label, xBps, yBps }) => {
    const reserveIn = (x * BigInt(xBps)) / 10_000n;
    const reserveOut = (y * BigInt(yBps)) / 10_000n;
    // A high input amount may exceed reserves in the hypothetical shocked state;
    // the output is still bounded by the (shocked) output reserve.
    return {
      label,
      reserveIn: reserveIn.toString(),
      reserveOut: reserveOut.toString(),
      ...simulateConstantProduct({
        reserveIn: reserveIn.toString(),
        reserveOut: reserveOut.toString(),
        amountIn: a.toString(),
        feeBps,
      }),
    };
  });
  const outputs = scenarios.map((s) => BigInt(s.amountOut));
  return Object.freeze({
    engine: "shadow-constant-product-v1",
    calibrated: false,
    marketPrediction: false,
    warning: "Hypothetical curve scenarios; not a Meteora DBC quote or forward-price prediction.",
    scenarios,
    worstOutput: outputs.reduce((a, b) => (a < b ? a : b)).toString(),
    bestOutput: outputs.reduce((a, b) => (a > b ? a : b)).toString(),
  });
}

export function makeProofReceipt({
  chain,
  snapshot,
  evidence,
  model,
  simulation,
  policy,
  createdAt,
  expiresAt,
} = {}) {
  if (
    !chain ||
    !CLUSTERS.has(chain.cluster) ||
    !chain.genesis ||
    !Number.isSafeInteger(chain.slot) ||
    chain.slot < 1
  )
    throw new TypeError("Valid network, genesis and observed slot required");
  if (
    !snapshot ||
    !SHA256.test(snapshot.sha256) ||
    !["rpc-verified", "synthetic", "unverified"].includes(snapshot.provenance)
  )
    throw new TypeError("Snapshot requires evidence hash and honest provenance");
  if (
    !Array.isArray(evidence) ||
    evidence.length > 64 ||
    !evidence.every(
      (e) =>
        e &&
        /^[a-zA-Z0-9:_-]{1,64}$/.test(e.id) &&
        SHA256.test(e.sha256) &&
        ["rpc-verified", "synthetic", "unverified"].includes(e.provenance),
    )
  )
    throw new TypeError("Bounded evidence IDs, digests and provenance required");
  if (new Set(evidence.map((e) => e.id)).size !== evidence.length)
    throw new TypeError("Evidence IDs must be unique");
  if (!model || !["none", "huggingface", "deterministic"].includes(model.provider))
    throw new TypeError("Model provider must be specified");
  if (!simulation || !SHA256.test(simulation.configHash))
    throw new TypeError("Simulation config hash required");
  if (!policy || !["pass", "block", "review"].includes(policy.verdict))
    throw new TypeError("Explicit deterministic policy verdict required");
  if (
    !Number.isFinite(Date.parse(createdAt)) ||
    !Number.isFinite(Date.parse(expiresAt)) ||
    Date.parse(expiresAt) <= Date.parse(createdAt)
  )
    throw new TypeError("Valid creation and expiration timestamps required");
  const record = {
    version: "QLI-PROOF-1",
    type: "offchain-evidence-hash",
    execution: "none",
    chain: { cluster: chain.cluster, genesis: chain.genesis, slot: chain.slot },
    snapshot: { sha256: snapshot.sha256, provenance: snapshot.provenance },
    evidence: evidence
      .map((e) => ({ id: e.id, sha256: e.sha256, provenance: e.provenance }))
      .sort((a, b) => a.id.localeCompare(b.id)),
    model: {
      provider: model.provider,
      id: model.id ?? "none",
      version: model.version ?? "unavailable",
      responseHash: model.responseHash ?? null,
    },
    simulation: { engine: simulation.engine, configHash: simulation.configHash },
    policy: { version: policy.version, verdict: policy.verdict, reason: policy.reason },
    createdAt,
    expiresAt,
  };
  return Object.freeze({ record, sha256: sha256Domain("QLI-PROOF-v1", record) });
}

export function verifyProofReceipt(receipt, now = Date.now()) {
  if (
    !receipt ||
    typeof receipt.sha256 !== "string" ||
    !SHA256.test(receipt.sha256) ||
    receipt.record?.version !== "QLI-PROOF-1" ||
    receipt.record?.type !== "offchain-evidence-hash" ||
    receipt.record?.execution !== "none"
  )
    return { valid: false, reason: "invalid-record" };
  if (
    !Number.isFinite(Date.parse(receipt.record.expiresAt)) ||
    Date.parse(receipt.record.expiresAt) <= now
  )
    return { valid: false, reason: "expired" };
  try {
    const actual = sha256Domain("QLI-PROOF-v1", receipt.record);
    return timingSafeEqual(Buffer.from(actual, "hex"), Buffer.from(receipt.sha256, "hex"))
      ? { valid: true, reason: "hash-matches-not-signed" }
      : { valid: false, reason: "tampered" };
  } catch {
    return { valid: false, reason: "invalid-payload" };
  }
}

export function analyzePublicRelationshipGraph({ chain, nodes, edges } = {}) {
  if (
    !CLUSTERS.has(chain?.cluster) ||
    !Array.isArray(nodes) ||
    !Array.isArray(edges) ||
    nodes.length > 256 ||
    edges.length > 1024
  )
    throw new TypeError("Invalid network or graph size");
  const idSet = new Set();
  for (const n of nodes) {
    if (
      !n ||
      typeof n.id !== "string" ||
      !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(n.id) ||
      !["wallet", "pool", "mint", "vault", "program"].includes(n.kind) ||
      idSet.has(n.id)
    )
      throw new TypeError("Unique verified public Solana nodes required");
    idSet.add(n.id);
  }
  const relation = new Set(["owner-of", "mint-of", "escrow-of", "authority-of", "pool-of"]);
  const edgesById = new Set();
  const out = [];
  for (const e of edges) {
    if (
      !idSet.has(e?.from) ||
      !idSet.has(e?.to) ||
      !relation.has(e.kind) ||
      !Number.isSafeInteger(e.slot) ||
      e.slot < 1 ||
      !SHA256.test(e.evidenceHash) ||
      e.provenance !== "rpc-verified"
    )
      throw new TypeError("Only chain-verified relationship evidence is accepted");
    const k = [e.from, e.to, e.kind, e.slot].join(":");
    if (!edgesById.has(k)) {
      edgesById.add(k);
      out.push({ ...e });
    }
  }
  const ownerDegree = new Map();
  for (const e of out.filter((x) => x.kind === "owner-of"))
    ownerDegree.set(e.from, (ownerDegree.get(e.from) ?? 0) + 1);
  const signals = [...ownerDegree.entries()]
    .filter(([, count]) => count >= 3)
    .map(([nodeId, count]) => ({
      kind: "concentration-pattern",
      nodeId,
      count,
      severity: "informational",
      attribution: "none",
      note: "Shared public owner across multiple registered accounts is not evidence of wrongdoing.",
    }));
  return {
    cluster: chain.cluster,
    provenance: "rpc-verified-edges",
    nodes: nodes.map((x) => ({ ...x })),
    edges: out,
    signals,
    policy: "signals-only-no-automated-blocking",
  };
}
