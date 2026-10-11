// Creator Studio RPCs. All owner operations require a wallet-signed session token.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { packContentSchema, personaSchema, questionSchema, PACK_STATUSES } from "./creator-studio";

const token = z.string().regex(/^[0-9a-f]{64}$/);
const id = z.string().uuid();
const srv = () => import("./creator-studio.server");

export const csState = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ token }).parse(d))
  .handler(async ({ data }) => (await srv()).state(data.token));
export const csSavePersona = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ token, id: id.nullable(), persona: personaSchema }).parse(d))
  .handler(async ({ data }) => (await srv()).savePersona(data.token, data.id, data.persona));
export const csArchivePersona = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ token, id, archived: z.boolean() }).parse(d))
  .handler(async ({ data }) => {
    await (await srv()).archivePersona(data.token, data.id, data.archived);
    return { ok: true };
  });
export const csDeletePersona = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ token, id }).parse(d))
  .handler(async ({ data }) => {
    await (await srv()).deletePersona(data.token, data.id);
    return { ok: true };
  });
export const csRunWorkflow = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z.object({ token, personaId: id, kind: z.enum(["launch-pack", "weekly-update"]) }).parse(d),
  )
  .handler(async ({ data }) => (await srv()).runWorkflow(data.token, data.personaId, data.kind));
export const csUpdatePack = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ token, id, content: packContentSchema }).parse(d))
  .handler(async ({ data }) => {
    await (await srv()).updatePack(data.token, data.id, data.content);
    return { ok: true };
  });
export const csPackStatus = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ token, id, status: z.enum(PACK_STATUSES) }).parse(d))
  .handler(async ({ data }) => {
    await (await srv()).setPackStatus(data.token, data.id, data.status);
    return { ok: true };
  });
export const csDeletePack = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ token, id }).parse(d))
  .handler(async ({ data }) => {
    await (await srv()).deletePack(data.token, data.id);
    return { ok: true };
  });
export const csAsk = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ token, personaId: id, question: questionSchema }).parse(d))
  .handler(async ({ data }) => {
    await (await srv()).askQuestion(data.token, data.personaId, data.question);
    return { ok: true };
  });
export const csModerate = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ token, id, status: z.enum(["approved", "rejected"]) }).parse(d))
  .handler(async ({ data }) => {
    await (await srv()).moderate(data.token, data.id, data.status);
    return { ok: true };
  });