import { ml_dsa65 } from "@noble/post-quantum/ml-dsa.js";
import { slh_dsa_sha2_128s } from "@noble/post-quantum/slh-dsa.js";
import { ml_kem768 } from "@noble/post-quantum/ml-kem.js";
import { sha256 } from "@noble/hashes/sha256";
export const algorithms = [
  {
    id: "ML-DSA-65",
    standard: "FIPS 204",
    type: "signature",
    description: "Lattice-based signatures for authenticating messages.",
    publicBytes: 1952,
    signatureBytes: 3309,
  },
  {
    id: "SLH-DSA-SHA2-128s",
    standard: "FIPS 205",
    type: "signature",
    description: "Stateless hash-based signatures with a conservative hash-only foundation.",
    publicBytes: 32,
    signatureBytes: 7856,
  },
  {
    id: "ML-KEM-768",
    standard: "FIPS 203",
    type: "kem",
    description: "Key encapsulation for establishing a shared secret.",
    publicBytes: 1184,
    signatureBytes: 1088,
  },
] as const;
export type Algorithm = (typeof algorithms)[number]["id"];
export function b64(b: Uint8Array) {
  let s = "";
  for (const n of b) s += String.fromCharCode(n);
  return btoa(s);
}
export function fromB64(s: string) {
  if (!s || s.length > 60000 || s.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(s))
    throw new Error("VALIDATION_ERROR: expected canonical base64.");
  const out = Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
  if (b64(out) !== s) throw new Error("VALIDATION_ERROR: non-canonical base64.");
  return out;
}
export function fingerprint(b: Uint8Array) {
  return Array.from(sha256(b), (n) => n.toString(16).padStart(2, "0")).join("");
}
export function signer(a: Algorithm) {
  if (a === "ML-KEM-768") throw new Error("Select a signature algorithm.");
  return a === "ML-DSA-65" ? ml_dsa65 : slh_dsa_sha2_128s;
}
export function verifySignature(
  a: Algorithm,
  message: Uint8Array,
  signature: Uint8Array,
  publicKey: Uint8Array,
) {
  const s = signer(a);
  if (publicKey.length !== s.lengths.publicKey || signature.length !== s.lengths.signature)
    throw new Error("VALIDATION_ERROR: incorrect public key or signature length.");
  return s.verify(signature, message, publicKey);
}
export function encapsulate(publicKey: Uint8Array) {
  if (publicKey.length !== 1184)
    throw new Error("INVALID_PUBLIC_KEY: ML-KEM-768 requires 1184 bytes.");
  const r = ml_kem768.encapsulate(publicKey);
  const result = {
    cipherText: b64(r.cipherText),
    sharedSecretFingerprint: fingerprint(r.sharedSecret),
  };
  r.sharedSecret.fill(0);
  return result;
}
export async function runLocal(a: Algorithm, message: string, tamper = false) {
  const start = performance.now();
  const m = new TextEncoder().encode(message);
  if (a === "ML-KEM-768") {
    const keys = ml_kem768.keygen();
    try {
      const enc = ml_kem768.encapsulate(keys.publicKey);
      const ciphertext = enc.cipherText.slice();
      if (tamper) ciphertext[0] = (ciphertext[0] ?? 0) ^ 1;
      const recovered = ml_kem768.decapsulate(ciphertext, keys.secretKey);
      const valid = fingerprint(recovered) === fingerprint(enc.sharedSecret);
      const result = {
        algorithm: a,
        valid,
        ms: Math.round(performance.now() - start),
        publicKey: b64(keys.publicKey),
        cipherText: b64(ciphertext),
        sharedSecretFingerprint: fingerprint(enc.sharedSecret),
        bytes: { publicKey: keys.publicKey.length, cipherText: ciphertext.length },
      };
      enc.sharedSecret.fill(0);
      recovered.fill(0);
      return result;
    } finally {
      keys.secretKey.fill(0);
    }
  }
  const s = signer(a);
  const keys = s.keygen();
  try {
    const signature = s.sign(m, keys.secretKey);
    const valid = s.verify(
      signature,
      tamper ? new TextEncoder().encode(message + " [changed]") : m,
      keys.publicKey,
    );
    return {
      algorithm: a,
      valid,
      ms: Math.round(performance.now() - start),
      publicKey: b64(keys.publicKey),
      signature: b64(signature),
      message: b64(tamper ? new TextEncoder().encode(message + " [changed]") : m),
      bytes: { publicKey: keys.publicKey.length, signature: signature.length },
    };
  } finally {
    keys.secretKey.fill(0);
  }
}
export { ml_dsa65, ml_kem768 };