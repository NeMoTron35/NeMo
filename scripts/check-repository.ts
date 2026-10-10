import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join, relative } from "node:path";
import { execFileSync } from "node:child_process";

// Build the denied identifier from character codes so this check is itself neutral.
const denied = String.fromCharCode(108, 111, 118, 97, 98, 108, 101);
const failures = new Set<string>();
const root = process.cwd();
const excluded = new Set([".git", "node_modules", ".workspace", ".tanstack"]);
function inspect(path: string) {
  const name = relative(root, path);
  if (name.toLowerCase().includes(denied)) failures.add(`Non-neutral path: ${name}`);
  const bytes = readFileSync(path);
  if (bytes.toString("utf8").toLowerCase().includes(denied))
    failures.add(`Non-neutral content: ${name}`);
  if (bytes.includes(0)) return;
  const text = bytes.toString("utf8");
  if (/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(text))
    failures.add(`Private key material: ${name}`);
  if (
    /(?:sb_secret_[a-zA-Z0-9_-]{12,}|gh[pousr]_[a-zA-Z0-9]{20,}|https?:\/\/[^\s/]+:[^\s/]+@)/.test(
      text,
    )
  )
    failures.add(`Potential credential: ${name}`);
}
function ignored(path: string) {
  try {
    execFileSync("git", ["check-ignore", "-q", relative(root, path)]);
    return true;
  } catch {
    return false;
  }
}
function walk(dir: string) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory() && excluded.has(entry.name)) continue;
    const path = join(dir, entry.name);
    if (entry.isSymbolicLink()) continue;
    if (entry.isDirectory()) {
      if (relative(root, path).toLowerCase().includes(denied))
        failures.add(`Non-neutral directory: ${relative(root, path)}`);
      walk(path);
    } else if (entry.isFile()) {
      // A local, git-ignored environment file may exist in a developer checkout; it must never be
      // committable. Tracked environment files are rejected separately below.
      if (/^\.env(?:\.|$)/.test(entry.name) && entry.name !== ".env.example" && !ignored(path))
        failures.add(`Committable environment file is not allowed: ${relative(root, path)}`);
      inspect(path);
    }
  }
}
walk(root);
const tracked = execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" })
  .split("\0")
  .filter(Boolean);
for (const file of tracked) {
  if (!existsSync(file)) continue;
  inspect(join(root, file));
  if (/^\.env(?:\.|$)/.test(file) && file !== ".env.example")
    failures.add(`Tracked environment file is not allowed: ${file}`);
}
if (existsSync(".env.example")) {
  for (const line of readFileSync(".env.example", "utf8").split(/\r?\n/)) {
    if (line.trim() && !line.startsWith("#") && !/^[A-Z][A-Z0-9_]*=$/.test(line))
      failures.add("Environment example must contain names and empty values only");
  }
}
if (failures.size) {
  for (const failure of failures) console.error(failure);
  process.exitCode = 1;
} else {
  console.log(
    "Repository hygiene passed: ZERO non-neutral name/content matches; no detected credential material or populated environment files.",
  );
}
