import { readFileSync } from "node:fs";

// Public package names/versions only; no credentials or app data leave this process.
const versions: Record<string, Set<string>> = {};
const lock = readFileSync("bun.lock", "utf8");
for (const match of lock.matchAll(/^\s+"[^"\n]+": \["((?:@[^/"\n]+\/)?[^@"\n]+)@([^"\n]+)"/gm)) {
  const name = match[1];
  const version = match[2];
  if (name && version) (versions[name] ??= new Set()).add(version);
}
if (!Object.keys(versions).length) throw new Error("No locked package versions found.");
const response = await fetch("https://registry.npmjs.org/-/npm/v1/security/advisories/bulk", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(
    Object.fromEntries(Object.entries(versions).map(([name, values]) => [name, [...values]])),
  ),
  signal: AbortSignal.timeout(30000),
});
if (!response.ok) throw new Error(`Public dependency audit failed: HTTP ${response.status}`);
type Advisory = { severity: string; title: string; url: string; vulnerable_versions: string };
const advisories = (await response.json()) as Record<string, Advisory[]>;
let blocking = 0;
for (const [name, findings] of Object.entries(advisories)) {
  for (const finding of findings) {
    console.log(
      `${name}: ${finding.severity} — ${finding.title} (${finding.vulnerable_versions}) ${finding.url}`,
    );
    if (["high", "critical"].includes(finding.severity)) blocking++;
  }
}
console.log(
  `Checked ${Object.keys(versions).length} package names; ${blocking} high/critical advisories.`,
);
if (blocking) process.exitCode = 1;