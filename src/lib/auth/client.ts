import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

/** Browser-only lazy client; the SDK stores sessions on this origin, never in an ancestor frame. */
export function createBrowserAuthClient() {
  if (typeof window === "undefined") throw new Error("Browser auth requires a browser session.");
  const url = import.meta.env["VITE_SUPABASE_URL"];
  const key = import.meta.env["VITE_SUPABASE_PUBLISHABLE_KEY"];
  if (!url || !key)
    throw new Error("Configure browser authentication deployment variables before signing in.");
  if (key.startsWith("sb_secret_"))
    throw new Error("A private key cannot configure browser authentication.");
  return createClient<Database>(url, key, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    global: {
      fetch: (input, init) => {
        const headers = new Headers(input instanceof Request ? input.headers : undefined);
        new Headers(init?.headers).forEach((value, name) => headers.set(name, value));
        if (key.startsWith("sb_publishable_") && headers.get("Authorization") === `Bearer ${key}`)
          headers.delete("Authorization");
        headers.set("apikey", key);
        return fetch(input, { ...init, headers });
      },
    },
  });
}

let browserClient: ReturnType<typeof createBrowserAuthClient> | undefined;
export function getBrowserAuthClient() {
  browserClient ??= createBrowserAuthClient();
  return browserClient;
}
