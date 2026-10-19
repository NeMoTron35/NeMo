import {
  algorithms,
  fromB64,
  verifySignature,
  encapsulate,
  runLocal,
  type Algorithm,
} from "./crypto";
const healthHistory: { at: string; ok: boolean; ms: number }[] = [];
const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Cache-Control": "no-store",
};
export async function cryptoApi(request: Request, operation: string) {
  const requestId = crypto.randomUUID();
  const start = performance.now();
  const respond = (data: object, status = 200) =>
    Response.json(
      { ...data, requestId, ms: Math.round(performance.now() - start) },
      { status, headers: { ...headers, "x-request-id": requestId } },
    );
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });
  try {
    if (operation === "algorithms" && request.method === "GET")
      return respond({
        algorithms: algorithms.map((a) => ({
          ...a,
          operations:
            a.type === "signature"
              ? { verify: "available", sign: "unavailable — no server key storage" }
              : { encapsulate: "available", decapsulate: "unavailable — no server key storage" },
        })),
      });
    if (operation === "health" && request.method === "GET") {
      const [d, k] = await Promise.all([
        runLocal("ML-DSA-65", "NEMOTRON3.5 self-test"),
        runLocal("ML-KEM-768", ""),
      ]);
      const ok = d.valid && k.valid;
      healthHistory.push({
        at: new Date().toISOString(),
        ok,
        ms: Math.round(performance.now() - start),
      });
      if (healthHistory.length > 1000) healthHistory.shift();
      return respond(
        { status: ok ? "ok" : "failed", library: "@noble/post-quantum 0.7.1" },
        ok ? 200 : 503,
      );
    }
    if (operation === "health/history" && request.method === "GET")
      return respond({
        checks: healthHistory,
        status: "Observed checks only · volatile worker memory · not continuous uptime",
      });
    if (operation === "usage" && request.method === "GET")
      return respond({ error: "OPERATION_UNAVAILABLE" }, 501);
    if (
      ![
        "keys",
        "signatures/sign",
        "kem/decapsulate",
        "signatures/verify",
        "kem/encapsulate",
      ].includes(operation)
    )
      return respond({ error: "NOT_FOUND" }, 404);
    if (request.method !== "POST") return respond({ error: "METHOD_NOT_ALLOWED" }, 405);
    if (!["signatures/verify", "kem/encapsulate"].includes(operation))
      return respond(
        {
          error: "OPERATION_UNAVAILABLE",
          detail:
            "No custodial keys, signing, decapsulation or project usage service is configured.",
        },
        501,
      );
    if (!request.headers.get("content-type")?.includes("application/json"))
      return respond({ error: "INVALID_BODY" }, 400);
    const reader = request.body?.getReader();
    if (!reader) return respond({ error: "INVALID_BODY" }, 400);
    let length = 0;
    const chunks: Uint8Array[] = [];
    while (true) {
      const r = await reader.read();
      if (r.done) break;
      length += r.value.length;
      if (length > 65536) {
        await reader.cancel();
        return respond({ error: "INVALID_BODY", detail: "64 KB body limit" }, 400);
      }
      chunks.push(r.value);
    }
    const bytes = new Uint8Array(length);
    let offset = 0;
    for (const c of chunks) {
      bytes.set(c, offset);
      offset += c.length;
    }
    let body: unknown;
    try {
      body = JSON.parse(new TextDecoder().decode(bytes));
    } catch {
      return respond({ error: "INVALID_BODY" }, 400);
    }
    if (!body || typeof body !== "object" || Array.isArray(body))
      throw new Error("VALIDATION_ERROR");
    const b = body as Record<string, unknown>;
    if (
      typeof b["algorithm"] !== "string" ||
      !algorithms.some((a) => a.id === b["algorithm"]) ||
      typeof b["publicKey"] !== "string"
    )
      throw new Error("VALIDATION_ERROR");
    if (operation === "kem/encapsulate") {
      if (b["algorithm"] !== "ML-KEM-768") throw new Error("VALIDATION_ERROR");
      return respond(encapsulate(fromB64(b["publicKey"])));
    }
    if (
      b["algorithm"] === "ML-KEM-768" ||
      typeof b["message"] !== "string" ||
      typeof b["signature"] !== "string"
    )
      throw new Error("VALIDATION_ERROR");
    const message = b["message"] === "" ? new Uint8Array() : fromB64(b["message"]);
    return respond({
      valid: verifySignature(
        b["algorithm"] as Algorithm,
        message,
        fromB64(b["signature"]),
        fromB64(b["publicKey"]),
      ),
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "VALIDATION_ERROR";
    return respond(
      {
        error: message.startsWith("INVALID_PUBLIC_KEY") ? "INVALID_PUBLIC_KEY" : "VALIDATION_ERROR",
        detail: message,
      },
      400,
    );
  }
}
