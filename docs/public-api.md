---
id: public-api
title: Public API reference
group: Developers
summary: Bounded public signature verification and ML-KEM encapsulation.
---

# Public API reference

## Endpoints

All paths use `/api/public/v1/`.

| Method | Suffix                                       | Result                                                          |
| ------ | -------------------------------------------- | --------------------------------------------------------------- |
| GET    | `algorithms`                                 | Algorithms, sizes and available/unavailable operations          |
| GET    | `health`                                     | Real ML-DSA and ML-KEM self-tests; status and library           |
| GET    | `health/history`                             | Observed checks held in volatile worker memory, capped at 1,000 |
| POST   | `signatures/verify`                          | Public signature verification, `valid` boolean                  |
| POST   | `kem/encapsulate`                            | Ciphertext and shared-secret fingerprint, not the shared secret |
| POST   | `keys`, `signatures/sign`, `kem/decapsulate` | 501 unavailable                                                 |
| GET    | `usage`                                      | 501 unavailable                                                 |

## Signature request

JSON requires `algorithm` (ML-DSA-65 or SLH-DSA-SHA2-128s), `message`, `signature`, `publicKey`. Binary fields use canonical base64; the empty message may be an empty string. Public key/signature lengths must match the selected algorithm. Invalid signatures return a valid HTTP response with `valid: false`; malformed material produces validation errors.

```js
// Use public test material exported from Cryptography Workbench.
const response = await fetch("/api/public/v1/signatures/verify", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ algorithm: "ML-DSA-65", message, signature, publicKey }),
});
const result = await response.json();
```

## Encapsulation request

Requires `algorithm: "ML-KEM-768"` and `publicKey` containing 1,184 decoded bytes. Response fields are `cipherText` and `sharedSecretFingerprint`. The shared secret is zeroed and not returned. Encapsulation is not an encrypted storage or custody service.

## Working read example

```sh
curl http://localhost:8080/api/public/v1/algorithms
```

Use the origin actually reported by your local dev server if its port differs. The existing `/api-docs` page also has cURL/JavaScript/Python examples.

## Errors and headers

JSON bodies require `application/json` and are capped at 65,536 bytes. Errors include 400 `INVALID_BODY`, `VALIDATION_ERROR` or `INVALID_PUBLIC_KEY`; 404 `NOT_FOUND`; 405 `METHOD_NOT_ALLOWED` on recognized POST-only operations; and 501 `OPERATION_UNAVAILABLE`. Failed self-test results can return 503. Unexpected exceptions in the handler currently become 400 validation responses rather than a separate internal-error class.

JSON responses carry `requestId`, elapsed `ms` and `x-request-id`; cache is disabled and public CORS permits GET/POST/OPTIONS. OPTIONS returns 204 without JSON or request-id fields. Health history is not uptime. Server key storage, signing, decapsulation, HSM and per-project usage are absent.
