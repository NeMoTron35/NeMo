import { createMiddleware } from "@tanstack/react-start";
import { getBrowserAuthClient } from "./client";

/** Server functions retain explicit bearer authorization without cross-origin session brokering. */
export const attachSessionAuth = createMiddleware({ type: "function" }).client(async ({ next }) => {
  const { data } = await getBrowserAuthClient().auth.getSession();
  const token = data.session?.access_token;
  return next({ headers: token ? { Authorization: `Bearer ${token}` } : {} });
});