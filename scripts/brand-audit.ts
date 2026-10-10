import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { relative, join } from "node:path";

// Check the retired identifier without making the audit itself a content match.
export const retiredName = String.fromCharCode(113, 117, 97, 110, 116, 101, 107);
export const lineHash = (line: string) => createHash("sha256").update(line).digest("hex");
// Exact line fingerprints: protocol bytes and verified external GitHub coordinates only.
export const approvedLines: Record<string, readonly string[]> = {
  "src/lib/qli-core/compatibility.ts": [
    "18fa95c258c8ad43f10daa66af162e893a594c07b2a9129bcc44c89d6520a620",
    "22d595aaea52a5bb5dce3e1987deb1357cd12d598293d5ca25cf4ad2bc732247",
    "c17c5dbd9232df40dcae75996139738e30dd9b033b2a1a4918bf68e2f961d8ab",
    "3985f221266c2a6a1431dbbaa8b062ae6895d8a763ffde5d465f8ec680450b90",
    "6b718df8ed60f9df65963486f41f10df22eb85548a931240db25daa0eaa8e671",
    "e7a5f55eae4485b74f28a3068a6c68358ac45baf7325c46a43274f7140a54bd6",
    "bd9758f224f74e8502cc4dd5c8151a87c5837a9f16f80b86c8ac220cf08b51d4",
    "efe35eff7453d07d5687e135acd2971cdc5dba7cb071c632a6bcd165c7d675a0",
    "17f75f1b875cfc3f73b28d750df671a59cd92f9dfd0463b59724fa2d99d5630c",
    "7ab5755b6ea12b8a01dfad2a6395301d753d3c900f35091c7bf1f42deb0bf0a1",
  ],
  "src/lib/qli-core/data.ts": ["4ee9acdad7b38f26bc5a4b8b42ba0202a8b0f94aaa9245cd9e0c851f80785c64"],
  "README.md": [
    "d48bd6c70ec82da818115df87d4d4ed3a892642650507199ab4340f3a80705de",
    "5d7dfebe18b181e59aa3a2003a2120c9656b6a518924687f0d3d487b1ae30b85",
  ],
  ".github/CODEOWNERS": ["81b25d70b5d54b3e806d5e32178a0f3dbe278d81ab6192eccb964efe44a33d0f"],
  ".github/ISSUE_TEMPLATE/config.yml": [
    "68a9ec1774325810ce09479a6e6045ddd29391d98d2209a31537103b064066ad",
  ],
  "docs/REPOSITORY.md": ["e49e1f5a2c7f160bda3757dba1de4aa7824714089a3d126145ba5f6c202b3267"],
};
export function brandViolations(path: string, text: string): string[] {
  const failures: string[] = [];
  if (path.toLowerCase().includes(retiredName)) failures.push(`Retired namespace path: ${path}`);
  for (const [index, line] of text.split(/\r?\n/).entries()) {
    if (!line.toLowerCase().includes(retiredName)) continue;
    if (!approvedLines[path]?.includes(lineHash(line)))
      failures.push(`Unapproved retired identifier: ${path}:${index + 1}`);
  }
  return failures;
}
export function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if ([".git", "node_modules", "dist", ".workspace", ".tanstack"].includes(entry.name)) return [];
    const path = join(dir, entry.name);
    if (entry.isSymbolicLink()) return [];
    return entry.isDirectory() ? sourceFiles(path) : [relative(process.cwd(), path)];
  });
}
export function auditBrand() {
  return sourceFiles(process.cwd()).flatMap((path) =>
    brandViolations(path, readFileSync(path, "utf8")),
  );
}
