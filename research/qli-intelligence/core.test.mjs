import test from "node:test";
import assert from "node:assert/strict";
import {
  canonical,
  sha256Domain,
  simulateConstantProduct,
  stressTestConstantProduct,
  makeProofReceipt,
  verifyProofReceipt,
  analyzePublicRelationshipGraph,
} from "./core.mjs";
import { normalizeModelEvidence, callHuggingFace, hfConfigurationStatus } from "./huggingface.mjs";

const ZERO = "0".repeat(64);
const ONE = "1".repeat(64);
const CREATED = "2026-10-11T12:00:00.000Z";
const EXPIRY = "2026-10-12T12:00:00.000Z";
function proof(overrides = {}) {
  return makeProofReceipt({
    chain: { cluster: "devnet", genesis: "devnet-genesis-v1", slot: 1234 },
    snapshot: { sha256: ZERO, provenance: "rpc-verified" },
    evidence: [{ id: "obs_1", sha256: ONE, provenance: "rpc-verified" }],
    model: { provider: "none" },
    simulation: { engine: "constant-product-hypothetical-v1", configHash: ZERO },
    policy: { version: "p1", verdict: "review", reason: "Owner signature required" },
    createdAt: CREATED,
    expiresAt: EXPIRY,
    ...overrides,
  });
}

test("canonical hashes are independent of input key insertion order", () => {
  assert.equal(canonical({ b: 3, a: { y: 1, x: 0 } }), canonical({ a: { x: 0, y: 1 }, b: 3 }));
  assert.equal(sha256Domain("QLI-PROOF-v1", { x: 3n }), sha256Domain("QLI-PROOF-v1", { x: 3n }));
});
test("canonical rejects numeric ambiguity, bad prototypes, unsafe nesting and non-finite values", () => {
  assert.throws(() => canonical({ x: NaN }));
  assert.throws(() => canonical({ x: Infinity }));
  assert.throws(() => canonical({ x: Number.MAX_SAFE_INTEGER + 1 }));
  assert.throws(() => canonical({ x: undefined }));
  assert.throws(() => canonical(JSON.parse('{"__proto__":{"admin":true}}')));
  assert.throws(() => canonical({ date: new Date() }));
  let deep = null;
  for (let i = 0; i < 30; i++) deep = { next: deep };
  assert.throws(() => canonical(deep));
});
test("domain separation changes hash while preserving payload", () => {
  assert.notEqual(sha256Domain("QLI-PROOF-v1", { x: 1 }), sha256Domain("QLI-ALT-v1", { x: 1 }));
  assert.throws(() => sha256Domain("not-a-domain", { x: 1 }));
});
test("constant-product swap enforces output bounds, fee and nondecreasing invariant", () => {
  const s = simulateConstantProduct({ reserveIn: "1000", reserveOut: "1000", amountIn: "100" });
  assert.equal(s.amountOut, "90");
  assert.equal(s.feeAmount, "1");
  assert.equal(s.invariantNondecreasing, true);
  assert.equal(s.evidenceStatus, "synthetic-assumption");
});
test("zero-fee swap obeys k invariant and bounds", () => {
  const s = simulateConstantProduct({
    reserveIn: "1000",
    reserveOut: "1000",
    amountIn: "100",
    feeBps: 0,
  });
  assert.equal(s.amountOut, "90");
  assert.equal(s.feeAmount, "0");
});
test("input validation rejects zero, negative, decimal, scientific and u64 overflow", () => {
  for (const amountIn of ["0", "-1", "1.0", "1e6", "18446744073709551616", " 1", 3]) {
    assert.throws(() => simulateConstantProduct({ reserveIn: "100", reserveOut: "100", amountIn }));
  }
  assert.throws(() =>
    simulateConstantProduct({ reserveIn: "0", reserveOut: "100", amountIn: "1" }),
  );
  assert.throws(() =>
    simulateConstantProduct({ reserveIn: "100", reserveOut: "100", amountIn: "1", feeBps: 10001 }),
  );
});
test("near-u64-reserve inputs remain exact without floating-point overflow", () => {
  const a = "18446744073709551615";
  const s = simulateConstantProduct({ reserveIn: a, reserveOut: a, amountIn: a });
  assert.ok(BigInt(s.amountOut) < BigInt(a));
  assert.ok(BigInt(s.amountOut) > 0n);
  assert.equal(s.invariantNondecreasing, true);
});
test("stress grid is deterministic, reports assumptions, and worst <= baseline <= best", () => {
  const data = { reserveIn: "100000", reserveOut: "200000", amountIn: "1000", feeBps: 30 };
  const a = stressTestConstantProduct(data),
    b = stressTestConstantProduct(data);
  assert.deepEqual(a, b);
  assert.equal(a.scenarios.length, 5);
  assert.equal(a.calibrated, false);
  assert.equal(a.marketPrediction, false);
  const baseline = BigInt(a.scenarios[0].amountOut);
  assert.ok(BigInt(a.worstOutput) <= baseline && baseline <= BigInt(a.bestOutput));
});
test("proof receipts canonicalize evidence order, and permit no execution authorization", () => {
  const a = proof({
    evidence: [
      { id: "z", sha256: ZERO, provenance: "synthetic" },
      { id: "a", sha256: ONE, provenance: "rpc-verified" },
    ],
  });
  const b = proof({ evidence: [...a.record.evidence].reverse() });
  assert.equal(a.sha256, b.sha256);
  assert.equal(a.record.execution, "none");
  assert.equal(a.record.type, "offchain-evidence-hash");
  assert.deepEqual(verifyProofReceipt(a, Date.parse(CREATED)), {
    valid: true,
    reason: "hash-matches-not-signed",
  });
});
test("tampering with evidence, chain, simulation, policy or model invalidates the proof", () => {
  const receipt = proof();
  const fields = [
    (r) => {
      r.chain.slot++;
    },
    (r) => {
      r.snapshot.sha256 = ONE;
    },
    (r) => {
      r.evidence[0].sha256 = ZERO;
    },
    (r) => {
      r.model.id = "forged";
    },
    (r) => {
      r.policy.verdict = "pass";
    },
    (r) => {
      r.simulation.configHash = ONE;
    },
    (r) => {
      r.execution = "broadcast";
    },
  ];
  for (const mutate of fields) {
    const record = structuredClone(receipt.record);
    mutate(record);
    assert.equal(
      verifyProofReceipt({ record, sha256: receipt.sha256 }, Date.parse(CREATED)).valid,
      false,
    );
  }
});
test("proof receipt expires and cannot be interpreted as an on-chain signature", () => {
  const r = proof();
  assert.deepEqual(verifyProofReceipt(r, Date.parse(EXPIRY)), { valid: false, reason: "expired" });
  assert.equal(r.record.execution, "none");
  assert.equal("signature" in r, false);
});
test("receipt requires real provenance labeling, safe evidence IDs and a verdict", () => {
  assert.throws(() =>
    proof({ evidence: [{ id: "bad\n", sha256: ONE, provenance: "rpc-verified" }] }),
  );
  assert.throws(() =>
    proof({
      evidence: [
        { id: "obs_1", sha256: ONE, provenance: "rpc-verified" },
        { id: "obs_1", sha256: ONE, provenance: "rpc-verified" },
      ],
    }),
  );
  assert.throws(() => proof({ snapshot: { sha256: ONE, provenance: "blockchain-signature" } }));
  assert.throws(() => proof({ policy: { verdict: "automatic-transfer" } }));
  assert.throws(() => proof({ chain: { cluster: "testnet", genesis: "x", slot: 1 } }));
});
test("Threat Graph accepts only verified public edges and deduplicates", () => {
  const nodes = "12345"
    .split("")
    .map((c, i) => ({ id: c.repeat(32), kind: i ? "pool" : "wallet" }));
  const edges = nodes.slice(1).map((n, i) => ({
    from: nodes[0].id,
    to: n.id,
    kind: "owner-of",
    slot: i + 10,
    evidenceHash: ONE,
    provenance: "rpc-verified",
  }));
  const graph = analyzePublicRelationshipGraph({
    chain: { cluster: "devnet" },
    nodes,
    edges: [...edges, { ...edges[0] }],
  });
  assert.equal(graph.edges.length, 4);
  assert.equal(graph.signals.length, 1);
  assert.equal(graph.signals[0].severity, "informational");
  assert.equal(graph.signals[0].attribution, "none");
  assert.equal(graph.policy, "signals-only-no-automated-blocking");
});
test("Threat Graph rejects unverified, cross-node, missing-provenance or forged relations", () => {
  const nodes = ["1", "2"].map((c) => ({ id: c.repeat(32), kind: "wallet" }));
  const edge = {
    from: nodes[0].id,
    to: nodes[1].id,
    kind: "owner-of",
    slot: 12,
    evidenceHash: ZERO,
    provenance: "rpc-verified",
  };
  const args = { chain: { cluster: "mainnet-beta" }, nodes, edges: [edge] };
  assert.throws(() =>
    analyzePublicRelationshipGraph({ ...args, edges: [{ ...edge, provenance: "unverified" }] }),
  );
  assert.throws(() =>
    analyzePublicRelationshipGraph({ ...args, edges: [{ ...edge, kind: "scammer" }] }),
  );
  assert.throws(() =>
    analyzePublicRelationshipGraph({ ...args, edges: [{ ...edge, to: "3".repeat(32) }] }),
  );
  assert.throws(() => analyzePublicRelationshipGraph({ ...args, edges: [{ ...edge, slot: 0 }] }));
});
const metrics = [{ id: "slot_1", metric: "slot", value: 123456, slot: 123456 }];
test("HF bridge fails closed for unauthenticated request and arbitrary data", async () => {
  await assert.rejects(() =>
    callHuggingFace({ task: "explain-liquidity-change", evidence: metrics, token: "" }),
  );
  assert.throws(() => normalizeModelEvidence([{ id: "x", metric: "wallet", value: 1, slot: 1 }]));
  assert.throws(() => normalizeModelEvidence([{ id: "x", metric: "slot", value: NaN, slot: 1 }]));
  assert.throws(() => normalizeModelEvidence([...metrics, ...metrics]));
});
test("HF bridge reports unconfigured as deterministic and does not call fetch", async () => {
  let calls = 0;
  const result = await callHuggingFace({
    authBound: true,
    task: "explain-liquidity-change",
    evidence: metrics,
    token: "",
    fetchFn: () => {
      calls++;
      throw Error("should not run");
    },
  });
  assert.equal(result.status, "not-configured");
  assert.equal(result.isAI, false);
  assert.equal(calls, 0);
  assert.equal(hfConfigurationStatus({}).enabled, false);
});
test("HF bridge sends only allowlisted numbers and validates supporting evidence", async () => {
  let url, body, auth;
  const response = await callHuggingFace({
    authBound: true,
    task: "explain-liquidity-change",
    evidence: metrics,
    token: "hf_test-only",
    fetchFn: async (u, args) => {
      url = u;
      body = JSON.parse(args.body);
      auth = args.headers.Authorization;
      return {
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  summary: "The slot was observed.",
                  risk: "info",
                  evidenceIds: ["slot_1"],
                  recommendation: "Review the on-chain observation.",
                }),
              },
            },
          ],
        }),
      };
    },
  });
  assert.equal(url, "https://router.huggingface.co/v1/chat/completions");
  assert.equal(auth, "Bearer hf_test-only");
  assert.equal(body.max_tokens, 300);
  assert.ok(!JSON.stringify(body).includes("hf_test-only"));
  assert.equal(response.status, "ok");
  assert.equal(response.isAI, true);
  assert.deepEqual(response.evidenceIds, ["slot_1"]);
});
test("HF bridge rejects model hallucinated evidence and returns honest fallback", async () => {
  const result = await callHuggingFace({
    authBound: true,
    task: "explain-liquidity-change",
    evidence: metrics,
    token: "hf_dummy",
    fetchFn: async () => ({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                summary: "All safe",
                risk: "info",
                recommendation: "Review",
                evidenceIds: ["fabricated"],
              }),
            },
          },
        ],
      }),
    }),
  });
  assert.equal(result.status, "provider-unavailable");
  assert.equal(result.isAI, false);
});
test("HF bridge rejects arbitrary model, task and caller-provided endpoint", async () => {
  await assert.rejects(() =>
    callHuggingFace({ authBound: true, task: "send funds", evidence: metrics, token: "test" }),
  );
  await assert.rejects(() =>
    callHuggingFace({
      authBound: true,
      task: "explain-liquidity-change",
      evidence: metrics,
      token: "test",
      model: "attacker/arbitrary-model",
    }),
  );
});
