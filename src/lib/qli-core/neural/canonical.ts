// Canonical, domain-separated JSON hashing (finite numbers use the spec-fixed shortest form) for the NEMOTRON3.5 Proof Engine.
// Tamper-evident ledger records only: NOT a blockchain attestation or on-chain proof.

export type Canon = null | boolean | number | string | Canon[] | { [k: string]: Canon };

/** Stable serialization: sorted keys, no whitespace, integers only, bigint rejected (encode as string). */
export function canonicalJson(v: unknown): string {
  if (v === null) return "null";
  switch (typeof v) {
    case "boolean":
      return v ? "true" : "false";
    case "number":
      if (!Number.isFinite(v)) throw new Error("Canonical JSON rejects non-finite numbers.");
      if (Number.isInteger(v) && !Number.isSafeInteger(v))
        throw new Error("Unsafe integer; encode as a decimal string.");
      // ECMAScript Number::toString is a spec-fixed shortest round-trip form; -0 normalizes to 0.
      if (Object.is(v, -0)) return "0";
      return String(v);
    case "string":
      return JSON.stringify(v);
    case "bigint":
      throw new Error("Encode bigint as a decimal string before hashing.");
    case "object": {
      if (Array.isArray(v)) return `[${v.map(canonicalJson).join(",")}]`;
      const o = v as Record<string, unknown>;
      const keys = Object.keys(o)
        .filter((k) => o[k] !== undefined)
        .sort();
      return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson(o[k])}`).join(",")}}`;
    }
    default:
      throw new Error(`Unsupported value in canonical JSON: ${typeof v}`);
  }
}

export async function sha256HexOf(text: string): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Domain-separated digest: sha256(domain || 0x0a || canonicalJson(value)). */
export async function domainHash(domain: string, value: unknown): Promise<string> {
  return sha256HexOf(`${domain}\n${canonicalJson(value)}`);
}
