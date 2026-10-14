import { readFileSync } from "node:fs";
import semver from "semver";

// Public package names/versions only; no credentials or app data leave this process.
// Every advisory is matched against each exact locked version; nothing is ignored.
const versions: Record<string, Set<string>> = {};
const lock = readFileSync("bun.lock", "utf8");
for (const match of lock.matchAll(/^\s+"[^"\n]+": \["((?:@[^/"\n]+\/)?[^@"\n]+)@([^"\n]+)"/gm)) {
  const name = match[1];
  const version = match[2];
  if (name && version && semver.valid(version)) (versions[name] ??= new Set()).add(version);
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
const counts: Record<string, number> = {};
for (const [name, findings] of Object.entries(advisories)) {
  for (const finding of findings) {
    const affected = [...(versions[name] ?? [])].filter((v) =>
      semver.satisfies(v, finding.vulnerable_versions, { includePrerelease: true }),
    );
    if (!affected.length) continue;
    counts[finding.severity] = (counts[finding.severity] ?? 0) + 1;
    console.log(
      `${name}@${affected.join(",")}: ${finding.severity} — ${finding.title} (${finding.vulnerable_versions}) ${finding.url}`,
    );
  }
}
const blocking = (counts.high ?? 0) + (counts.critical ?? 0);
console.log(
  `Checked ${Object.keys(versions).length} package names; ${JSON.stringify(counts)}; ${blocking} high/critical.`,
);
if (blocking) process.exitCode = 1;
