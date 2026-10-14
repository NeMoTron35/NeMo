// QLi Agent v2 RPCs. Inputs are validated here; handlers load server-only modules lazily.
import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";

const token = z.string().regex(/^[0-9a-f]{64}$/);
const address = z
  .string()
  .min(32)
  .max(44)
  .regex(/^[1-9A-HJ-NP-Za-km-z]+$/);
const network = z.enum(["mainnet-beta", "devnet"]);
function domain() {
  return new URL(getRequest().url).host;
}
const settings = z.object({
  minClaimSol: z.number().min(0).max(1000),
  buybackPct: z.number().int().min(0).max(100),
  maxProposalSol: z.number().gt(0).max(2),
  slippageBps: z.number().int().min(1).max(1000),
  minSolReserve: z.number().min(0).max(100),
  migrationAlertPct: z.number().min(1).max(100),
  proposeBurn: z.boolean(),
  cooldownHours: z.number().int().min(1).max(168),
});

export const v2Challenge = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ wallet: address, network }).parse(d))
  .handler(async ({ data }) => {
    const s = await import("./agent-v2.server");
    return s.createChallenge(data.wallet, data.network, domain());
  });
export const v2Verify = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z
      .object({
        wallet: address,
        nonce: z.string().regex(/^[0-9a-f]{32}$/),
        signature: z.string().max(200),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const s = await import("./agent-v2.server");
    return s.verifyChallenge(data.wallet, data.nonce, data.signature, domain());
  });
export const v2State = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ token }).parse(d))
  .handler(async ({ data }) => (await import("./agent-v2.server")).getState(data.token));
export const v2SaveProfile = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z
      .object({
        token,
        name: z.string().trim().min(1).max(40),
        active: z.boolean(),
        identityRoot: z
          .string()
          .regex(/^[0-9a-f]{64}$/)
          .nullable(),
        settings,
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { token: t, ...rest } = data;
    await (await import("./agent-v2.server")).saveProfile(t, rest);
    return { ok: true };
  });
export const v2RegisterPool = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ token, pool: address }).parse(d))
  .handler(async ({ data }) => {
    await (await import("./agent-v2.server")).registerPool(data.token, data.pool);
    return { ok: true };
  });
export const v2RemovePool = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ token, poolId: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    await (await import("./agent-v2.server")).removePool(data.token, data.poolId);
    return { ok: true };
  });
export const v2ProposalStatus = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z.object({ token, id: z.string().uuid(), status: z.enum(["denied", "handed-off"]) }).parse(d),
  )
  .handler(async ({ data }) => {
    await (await import("./agent-v2.server")).setProposalStatus(data.token, data.id, data.status);
    return { ok: true };
  });
export const v2DeleteProfile = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ token }).parse(d))
  .handler(async ({ data }) => {
    await (await import("./agent-v2.server")).deleteProfile(data.token);
    return { ok: true };
  });
export const v2SignOut = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ token }).parse(d))
  .handler(async ({ data }) => {
    await (await import("./agent-v2.server")).signOut(data.token);
    return { ok: true };
  });

const vaultAddr = address;
export const v2HostedConsent = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ token, enabled: z.boolean() }).strict().parse(d))
  .handler(async ({ data }) => {
    await (await import("./agent-v2.server")).setHostedConsent(data.token, data.enabled);
    return { ok: true };
  });
export const v2VaultState = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ token }).parse(d))
  .handler(async ({ data }) =>
    (await import("./vault-monitor.server")).vaultMonitorState(data.token),
  );
export const v2RegisterVault = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ token, vault: vaultAddr }).parse(d))
  .handler(async ({ data }) => {
    await (await import("./vault-monitor.server")).registerVault(data.token, data.vault);
    return { ok: true };
  });
export const v2RemoveVault = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ token, id: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    await (await import("./vault-monitor.server")).removeVault(data.token, data.id);
    return { ok: true };
  });
