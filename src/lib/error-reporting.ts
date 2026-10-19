/** Local-only allowlisted diagnostics; never serialize thrown data, URLs or stacks. */
export function reportRuntimeError(error: unknown): void {
  const status = error instanceof Response ? error.status : undefined;
  console.error("[NEMOTRON3.5] Page rendering failed", {
    category: error instanceof Response ? "response" : "render",
    ...(status !== undefined ? { status } : {}),
  });
}
