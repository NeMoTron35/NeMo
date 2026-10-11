import { describe, it, expect, vi } from "vitest";
import {
  fetchNeuralStatus,
  hfLabel,
  isRoutable,
  parseNeuralStatus,
  OPERATOR_HELP,
} from "@/lib/qli-core/neural/status-client";

const res = (body: unknown, status = 200) =>
  ({ ok: status < 300, status, json: async () => body }) as Response;

describe("neural status bootstrap", () => {
  it("not-configured", async () => {
    const s = await fetchNeuralStatus(vi.fn(async () => res({ hf: "not-configured", models: [] })));
    expect(s.ok && s.hf).toBe("not-configured");
    expect(isRoutable(s)).toBe(false);
    expect(hfLabel(s)).toMatch(/not configured/);
  });
  it("rejected fetch → unavailable", async () => {
    const s = await fetchNeuralStatus(vi.fn(async () => Promise.reject(new Error("x"))));
    expect(hfLabel(s)).toBe("Status unavailable — deterministic tools only");
    expect(isRoutable(s)).toBe(false);
  });
  it("http error and undefined body → unavailable/invalid", async () => {
    expect((await fetchNeuralStatus(vi.fn(async () => res({}, 503)))).ok).toBe(false);
    expect(parseNeuralStatus(undefined).ok).toBe(false);
    expect(hfLabel(parseNeuralStatus(null))).toMatch(/Status unavailable/);
    expect(hfLabel(null)).toMatch(/deterministic tools only/);
  });
  it("unsupported model ids drop routable state", () => {
    const s = parseNeuralStatus({ hf: "routable-unverified", models: ["https://evil/x", 7] });
    expect(isRoutable(s)).toBe(false);
    expect(parseNeuralStatus({ hf: "live-ai" }).ok).toBe(false);
  });
  it("routable allowlisted model enables hosted", () => {
    const s = parseNeuralStatus({
      hf: "routable-unverified",
      models: ["org/model-1"],
      arenaRequests: 3,
    });
    expect(isRoutable(s)).toBe(true);
  });
  it("never returns token-like fields", () => {
    const s = parseNeuralStatus({
      hf: "not-configured",
      models: [],
      token: "hf_secret",
      HF_TOKEN: "hf_x",
    });
    expect(JSON.stringify(s)).not.toMatch(/hf_secret|hf_x|token/i);
  });
  it("operator help text is exact", () => {
    expect(OPERATOR_HELP).toBe(
      "For optional hosted inference: configure HF_TOKEN and HF_MODEL_ALLOWLIST in Project Settings > Secrets",
    );
  });
});