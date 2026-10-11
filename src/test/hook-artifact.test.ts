// @vitest-environment node
import { describe, it, expect } from "vitest";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";

describe("unsigned artifact checks", () => {
  it("distinguishes absence, RPC spoofing and upgrade-authority mismatch with actual verifier logic", () => {
    const source = `
import importlib.util,base64,hashlib
s=importlib.util.spec_from_file_location('hook','scripts/hook-artifact.py');m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
p=bytes([3,0,0,0])+bytes(8)+bytes([1])+bytes([1])*32+b'CODE'
d=bytes([2,0,0,0])+bytes([2])*32
a={'owner':m.LOADER,'executable':True,'bytes':d}
pd={'owner':m.LOADER,'executable':False,'bytes':p}
m.rpc=lambda *args:m.GENESIS
m.account=lambda key:(a if key=='1'*32 else pd,99)
fp=hashlib.sha256(b'CODE').hexdigest()
assert m.verify('1'*32,fp,m.b58(bytes([1])*32))['status']=='DEVNET_DEPLOYED'
try:m.verify('1'*32,fp,'wrong');raise AssertionError('accepted authority')
except ValueError:pass
pd['owner']='wrong'
try:m.verify('1'*32,fp);raise AssertionError('accepted owner')
except ValueError:pass
m.account=lambda key:(None,99)
assert m.verify('1'*32,fp)['status']=='NOT_DEPLOYED'
m.rpc=lambda *args:'mainnet'
try:m.verify('1'*32,fp);raise AssertionError('accepted genesis')
except ValueError:pass
print('verified')
`;
    expect(execFileSync("python3", ["-B", "-c", source], { encoding: "utf8" }).trim()).toBe(
      "verified",
    );
  });
  it("accepts exact SHA and distinguishes file SHA from padded code fingerprint", () => {
    const dir = mkdtempSync(join(tmpdir(), "qli-artifact-"));
    try {
      const bytes = Buffer.from([0x7f, 0x45, 0x4c, 0x46, 1, 2, 0, 0]);
      const path = join(dir, "hook.so"),
        sha = path + ".sha256";
      writeFileSync(path, bytes);
      writeFileSync(sha, createHash("sha256").update(bytes).digest("hex") + "  hook.so\n");
      const result = JSON.parse(
        execFileSync("python3", ["scripts/hook-artifact.py", "artifact", path, sha], {
          encoding: "utf8",
        }),
      );
      expect(result.fileSha256).not.toBe(result.codeFingerprint);
      writeFileSync(sha, "a".repeat(64));
      const refused = spawnSync("python3", ["scripts/hook-artifact.py", "artifact", path, sha], {
        encoding: "utf8",
      });
      expect(refused.status).toBe(1);
      expect(refused.stderr).toMatch(/SHA256 mismatch/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
  it("refuses invalid ELF before any deployment command", () => {
    const dir = mkdtempSync(join(tmpdir(), "qli-artifact-"));
    try {
      const p = join(dir, "bad.so");
      writeFileSync(p, "not sbf");
      writeFileSync(p + ".sha256", "a".repeat(64));
      const r = spawnSync("bash", ["scripts/deploy-transfer-hook-devnet.sh"], {
        env: { ...process.env, QLI_HOOK_SO: p, QLI_HOOK_SHA256: p + ".sha256" },
        encoding: "utf8",
      });
      expect(r.status).toBe(1);
      expect(r.stderr).toMatch(/not an ELF/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});