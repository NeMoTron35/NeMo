import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * NEMOTRON3.5 class composer.
 *
 * We resolve conditional class tokens first, then let Tailwind's merge pass
 * collapse conflicting utilities. Keeping this tiny boundary in one place
 * makes component styling deterministic without coupling the UI layer to a
 * generator template.
 */
export function cn(...tokens: ClassValue[]) {
  const resolved = clsx(tokens);
  return twMerge(resolved);
}
