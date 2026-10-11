import source from "../../../docs/whitepaper/index.md?raw";
import { headingId } from "./documentation";
export const WHITEPAPER_VERSION = "0.1 — October 2026";
export const whitepaperSections = source
  .split(/^## /m)
  .slice(1)
  .map((part) => {
    const newline = part.indexOf("\n");
    const title = part.slice(0, newline).trim();
    return { id: headingId(title), title, body: part.slice(newline).trim() };
  });
export function whitepaperSearch(search: Record<string, unknown>): { section?: string } {
  return typeof search["section"] === "string" ? { section: search["section"] } : {};
}