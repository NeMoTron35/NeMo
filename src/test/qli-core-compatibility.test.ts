// @vitest-environment node
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  auditBrand,
  approvedLines,
  brandViolations,
  retiredName,
  lineHash,
} from "../../scripts/brand-audit";
import {
  DOMAINS,
  WOTS_PROOF_KIND,
  LEAF_LEDGER_PREFIX,
  IDENTITY_MEMO_PREFIX,
  POSSESSION_MESSAGE_PREFIX,
  REGISTRATION_MESSAGE_PREFIX,
} from "@/lib/qli-core/compatibility";
import {
  publicDemoKeys,
  signLeaf,
  qtkAddress,
  createLeafLedger,
  derivationMessage,
  anchorMemo,
  challengeMessage,
  registrationMessage,
} from "@/lib/qli-core/identity";
import { H, hex, utf8, messageDigest, verifyWotsProof, type WotsProof } from "@/lib/qli-core/pq";
import { vaultChain, withdrawalCommitment } from "@/lib/qli-core/quantum-wallet";
import vector from "./qli-core-v1-vector.json";

describe("QLi core frozen v1 compatibility", () => {
  it("verifies the original pre-refactor proof and reproduces every serialized byte", async () => {
    const original: WotsProof = {
      kind: WOTS_PROOF_KIND,
      domain: DOMAINS.proof,
      label: "public-demo",
      message: "hello",
      leaf: 3,
      publicSeed: vector.publicSeed,
      root: vector.root,
      signature: vector.signature,
      authPath: vector.authPath,
    };
    expect(verifyWotsProof(original).valid).toBe(true);
    const keys = await publicDemoKeys();
    const proof = await signLeaf(keys, 3, DOMAINS.proof, "hello", "public-demo");
    expect(proof).toEqual(original);
    expect(hex(H(utf8(JSON.stringify(proof))))).toBe(vector.proofHash);
    expect(hex(messageDigest(DOMAINS.proof, "hello"))).toBe(vector.digest);
    expect(qtkAddress(new Uint8Array(Buffer.from(vector.root, "hex")), keys.publicSeed)).toBe(
      vector.address,
    );
  }, 60000);
  it("preserves existing consumed-leaf lookup keys and rejects reuse", () => {
    const raw = JSON.stringify({
      root: vector.root,
      used: [0, 7],
      purposes: { 0: "register", 7: "prove" },
    });
    const store = new Map([[LEAF_LEDGER_PREFIX + vector.root, raw]]);
    const ledger = createLeafLedger(vector.root, {
      getItem: (key) => store.get(key) ?? null,
      setItem: (key, value) => {
        store.set(key, value);
      },
    });
    expect(ledger.state.used).toEqual([0, 7]);
    expect(() => ledger.reserve(7, "again")).toThrow(/never be reused/);
    ledger.reserve(1, "next");
    expect([...store.keys()]).toEqual([LEAF_LEDGER_PREFIX + vector.root]);
  });
  it("keeps derivation message and all signed message/commitment namespaces frozen", () => {
    const id = {
      address: vector.address,
      root: vector.root,
      publicSeed: vector.publicSeed,
      height: 8 as const,
      leaves: 256 as const,
      label: "reference" as const,
      wallet: null,
    };
    expect(hex(H(utf8(derivationMessage("wallet", "devnet"))))).toBe(
      "83275da8a01183a517cd2e3fb0e5577a1be87b0dcfdb175f991ae350870c6b2c",
    );
    expect(anchorMemo(id)).toBe(`${IDENTITY_MEMO_PREFIX}${id.address}:${id.root}`);
    expect(challengeMessage(id, "00", 7)).toBe(
      `${POSSESSION_MESSAGE_PREFIX}${id.address}:${id.root}:leaf=7:nonce=00`,
    );
    expect(registrationMessage(id)).toBe(
      `${REGISTRATION_MESSAGE_PREFIX}${id.address}:${id.root}:${id.publicSeed}:wallet=none`,
    );
    expect(
      withdrawalCommitment(
        { recipient: "r", mint: "m", amount: 1.5, vaultIndex: 0 },
        vaultChain("demo-root", 3),
      ).digest,
    ).toBe(vector.withdrawalDigest);
  });
  it("rejects retired names outside exact reviewed protocol lines", () => {
    expect(auditBrand()).toEqual([]);
    expect(brandViolations(`src/lib/${retiredName}/other.ts`, "")).toHaveLength(1);
    expect(brandViolations("src/new.ts", `// ${retiredName}`)).toHaveLength(1);
    for (const [path, hashes] of Object.entries(approvedLines)) {
      const lines = readFileSync(path, "utf8")
        .split(/\r?\n/)
        .filter((line) => line.toLowerCase().includes(retiredName));
      expect(lines.map(lineHash)).toEqual(hashes);
      for (const line of lines) expect(brandViolations(path, line + " changed")).toHaveLength(1);
    }
  });
});
