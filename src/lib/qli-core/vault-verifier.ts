// Read-only on-chain Program Verifier for Quantum Vault devnet deployments.
// It NEVER enables writes: a passing report is evidence for an owner to review and then commit a
// source-reviewed QUANTUM_VAULT_DEPLOYMENT config. Address input or a pasted hash alone is not enough.
import { PublicKey, type Connection } from "@solana/web3.js";
import { sha256 } from "@noble/hashes/sha256";
import { DEVNET_GENESIS, UPGRADEABLE_LOADER } from "./quantum-vault";

/** Hash of the local build with the PLACEHOLDER program id (programs/Anchor.toml). It cannot verify
 * an owner rebuild: `declare_id!` is compiled into the binary, so a new program id yields a new hash.
 * Never used as a default; the verifier requires an artifact hash from source-reviewed config. */
export const PLACEHOLDER_BUILD_ARTIFACT = {
  sha256: "60b2a0bbe9207d839a4ed35805b2e7d5bc927296a8ec8b2f242361e68edc2cca",
  length: 256_832,
  programId: "93v9K8ytGDR3BAoxtaVVo7u1oaBv3Pu257eBAPCp7SH5",
} as const;
export const PINNED_TOOLCHAIN =
  "Agave 2.2.20 · SBF platform-tools v1.57 · Anchor CLI 0.31.1 · nightly-2025-11-01 (IDL only)";
/** Source-reviewed owner artifact. Stays null until the owner commits their rebuilt hash + length. */
export const OWNER_REVIEWED_ARTIFACT: { sha256: string; length: number; programId: string } | null =
  null;
export const PROGRAMDATA_HEADER = 45;

export type CheckStatus = "pass" | "fail" | "not-checked";
export type Check = { id: string; label: string; status: CheckStatus; detail: string };
export type VerifierReport = {
  programId: string;
  checks: Check[];
  ok: boolean;
  upgradeAuthority: string | null;
  programDataAddress: string | null;
  payloadLength: number | null;
  slot: number | null;
  writesEnabled: false;
};

export type VerifierInput = {
  programId: string;
  expectedUpgradeAuthority?: string | undefined;
  artifact?: { sha256: string; length: number } | undefined;
  idlBytes?: Uint8Array | undefined;
};

const hex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");

export async function verifyDeployedProgram(
  connection: Connection,
  input: VerifierInput,
): Promise<VerifierReport> {
  const checks: Check[] = [];
  const add = (id: string, label: string, status: CheckStatus, detail: string) =>
    checks.push({ id, label, status, detail });
  const report = (extra: Partial<VerifierReport> = {}): VerifierReport => ({
    programId: input.programId,
    checks,
    ok: checks.length > 0 && checks.every((c) => c.status === "pass"),
    upgradeAuthority: null,
    programDataAddress: null,
    payloadLength: null,
    slot: null,
    ...extra,
    writesEnabled: false,
  });
  let pid: PublicKey;
  try {
    pid = new PublicKey(input.programId.trim());
  } catch {
    add("address", "Program address", "fail", "Not a valid base58 public key.");
    return report();
  }
  const artifact = input.artifact ?? null;
  const genesis = await connection.getGenesisHash();
  if (genesis !== DEVNET_GENESIS) {
    add("genesis", "Devnet genesis", "fail", `RPC genesis ${genesis} is not Solana devnet.`);
    return report();
  }
  add("genesis", "Devnet genesis", "pass", DEVNET_GENESIS);
  const slot = await connection.getSlot("confirmed");
  const prog = await connection.getAccountInfo(pid, "confirmed");
  if (!prog) {
    add("program", "Program account", "fail", "No account at this address on devnet.");
    return report({ slot });
  }
  if (!prog.executable || !prog.owner.equals(UPGRADEABLE_LOADER) || prog.data.length !== 36) {
    add("program", "Program account", "fail", "Not an executable BPF Upgradeable Loader program.");
    return report({ slot });
  }
  const pv = new DataView(prog.data.buffer, prog.data.byteOffset, prog.data.length);
  if (pv.getUint32(0, true) !== 2) {
    add("program", "Program account", "fail", "Loader state is not Program.");
    return report({ slot });
  }
  add("program", "Program account", "pass", "Executable, owned by BPF Upgradeable Loader.");
  const pdAddr = new PublicKey(prog.data.subarray(4, 36));
  const canonical = PublicKey.findProgramAddressSync([pid.toBuffer()], UPGRADEABLE_LOADER)[0];
  if (!pdAddr.equals(canonical)) {
    add("programdata", "Canonical ProgramData", "fail", "ProgramData pointer is not canonical.");
    return report({ slot });
  }
  const pd = await connection.getAccountInfo(pdAddr, "confirmed");
  if (
    !pd ||
    pd.executable ||
    !pd.owner.equals(UPGRADEABLE_LOADER) ||
    pd.data.length < PROGRAMDATA_HEADER
  ) {
    add("programdata", "Canonical ProgramData", "fail", "ProgramData account missing or invalid.");
    return report({ slot, programDataAddress: pdAddr.toBase58() });
  }
  const dv = new DataView(pd.data.buffer, pd.data.byteOffset, pd.data.length);
  const opt = pd.data[12];
  if (dv.getUint32(0, true) !== 3 || (opt !== 0 && opt !== 1)) {
    add("programdata", "Canonical ProgramData", "fail", "ProgramData header malformed.");
    return report({ slot, programDataAddress: pdAddr.toBase58() });
  }
  add("programdata", "Canonical ProgramData", "pass", pdAddr.toBase58());
  const authority = opt === 1 ? new PublicKey(pd.data.subarray(13, 45)).toBase58() : null;
  if (authority === null) add("authority", "Upgrade authority", "fail", "Immutable (none).");
  else if (input.expectedUpgradeAuthority && input.expectedUpgradeAuthority.trim() !== authority)
    add("authority", "Upgrade authority", "fail", `On-chain ${authority} differs from expected.`);
  else
    add(
      "authority",
      "Upgrade authority",
      input.expectedUpgradeAuthority ? "pass" : "not-checked",
      input.expectedUpgradeAuthority
        ? authority
        : `${authority} — supply your expected authority to check it.`,
    );
  // Bytecode: deployed payload = artifact bytes + zero padding (from --max-len). Hash the artifact
  // prefix and separately prove the remainder is zero. Never conflate the two hashes.
  const payload = pd.data.subarray(PROGRAMDATA_HEADER);
  if (!artifact) {
    add(
      "bytecode",
      "Bytecode vs attested artifact",
      "not-checked",
      "No source-reviewed artifact hash for this program id. Pasted hashes are not accepted.",
    );
  } else if (payload.length < artifact.length) {
    add("bytecode", "Bytecode vs attested artifact", "fail", "Payload shorter than artifact.");
  } else {
    const prefix = hex(sha256(payload.subarray(0, artifact.length)));
    const padZero = payload.subarray(artifact.length).every((b) => b === 0);
    add(
      "bytecode",
      "Bytecode vs attested artifact",
      prefix === artifact.sha256 && padZero ? "pass" : "fail",
      prefix !== artifact.sha256
        ? `Artifact-prefix SHA-256 ${prefix} ≠ attested ${artifact.sha256}.`
        : padZero
          ? `Artifact SHA-256 matches; ${payload.length - artifact.length} padding bytes are zero.`
          : "Artifact matches but non-zero bytes follow it.",
    );
  }
  if (!input.idlBytes) add("idl", "Anchor IDL correspondence", "not-checked", "No IDL supplied.");
  else {
    try {
      const idl = JSON.parse(new TextDecoder().decode(input.idlBytes)) as {
        address?: string;
        metadata?: { version?: string; name?: string };
      };
      const okAddr = idl.address === pid.toBase58();
      const okVer = idl.metadata?.version === "0.1.0" && idl.metadata?.name === "quantum_vault";
      add(
        "idl",
        "Anchor IDL correspondence",
        okAddr && okVer ? "pass" : "fail",
        !okAddr
          ? `IDL address ${idl.address ?? "missing"} ≠ program id (rebuild after anchor keys sync).`
          : okVer
            ? `quantum_vault 0.1.0, sha256 ${hex(sha256(input.idlBytes))}`
            : "IDL name/version mismatch.",
      );
    } catch {
      add("idl", "Anchor IDL correspondence", "fail", "IDL is not valid JSON.");
    }
  }
  return report({
    slot,
    upgradeAuthority: authority,
    programDataAddress: pdAddr.toBase58(),
    payloadLength: payload.length,
  });
}

/** Owner runbook. Run from the repository root; every step returns there. Devnet only.
 * Keypair JSON files are private keys: keep them offline, never paste, upload or commit them.
 * Only public addresses (program id, upgrade authority) may be shared. */
export const DEPLOY_RUNBOOK: { step: string; cmd: string }[] = [
  {
    step: "1. Pin the toolchain (Agave 2.2.20, platform-tools v1.57, Anchor 0.31.1, nightly-2025-11-01)",
    cmd: 'sh -c "$(curl -sSfL https://release.anza.xyz/v2.2.20/install)"\nsolana --version            # solana-cli 2.2.20\ncargo-build-sbf --version   # expect platform-tools v1.57\ncargo install --git https://github.com/coral-xyz/anchor avm --locked\navm install 0.31.1 && avm use 0.31.1 && anchor --version\nrustup toolchain install nightly-2025-11-01',
  },
  {
    step: "2. Work from the repository root",
    cmd: 'cd /path/to/QLi                       # your clone\nexport QLI_ROOT="$(pwd)"\ntest -f programs/Anchor.toml && echo "root ok"\nmkdir -p programs/target/deploy\nmkdir -p "$HOME/.config/qli-devnet" && chmod 700 "$HOME/.config/qli-devnet"',
  },
  {
    step: "3. Devnet only: set and check the cluster",
    cmd: `solana config set --url https://api.devnet.solana.com\nsolana genesis-hash --url https://api.devnet.solana.com   # must print ${DEVNET_GENESIS}`,
  },
  {
    step: "4. Owner wallet = fee payer + upgrade authority (private; keep offline, back up safely)",
    cmd: 'solana-keygen new --outfile "$HOME/.config/qli-devnet/owner.json"\nchmod 600 "$HOME/.config/qli-devnet/owner.json"\nexport OWNER="$(solana-keygen pubkey "$HOME/.config/qli-devnet/owner.json")"; echo "$OWNER"\nsolana airdrop 2 "$OWNER" --url https://api.devnet.solana.com',
  },
  {
    step: "5. Program-id keypair (separate file; only fixes the address; never commit it)",
    cmd: 'solana-keygen new --outfile "$QLI_ROOT/programs/target/deploy/quantum_vault-keypair.json"\nchmod 600 "$QLI_ROOT/programs/target/deploy/quantum_vault-keypair.json"\nexport PROGRAM_ID="$(solana-keygen pubkey "$QLI_ROOT/programs/target/deploy/quantum_vault-keypair.json")"; echo "$PROGRAM_ID"\ngit -C "$QLI_ROOT" check-ignore programs/target/deploy/quantum_vault-keypair.json   # must print the path\ntest "$PROGRAM_ID" != "$OWNER" && echo "distinct keys ok"',
  },
  {
    step: "6. Align the program id (review every diff by hand)",
    cmd: '(cd "$QLI_ROOT/programs" && anchor keys sync)   # updates declare_id! and Anchor.toml\n# Then edit by hand, replacing the old placeholder with $PROGRAM_ID:\n#   src/lib/qli-core/quantum-vault.ts   LOCAL_BUILD_PROGRAM_ID\n#   (tests import LOCAL_BUILD_PROGRAM_ID; no other fixture edits needed)\ngrep -n "declare_id" "$QLI_ROOT/programs/quantum_vault/src/lib.rs"\ngrep -n "quantum_vault =" "$QLI_ROOT/programs/Anchor.toml"\ngrep -n "LOCAL_BUILD_PROGRAM_ID =" "$QLI_ROOT/src/lib/qli-core/quantum-vault.ts"\ngrep -rn "93v9K8ytGDR3BAoxtaVVo7u1oaBv3Pu257eBAPCp7SH5" "$QLI_ROOT/programs" "$QLI_ROOT/src" --exclude-dir=target   # must print nothing',
  },
  {
    step: "7. Rebuild SBF + IDL with the new id and record the NEW hash",
    cmd: '(cd "$QLI_ROOT/programs" && cargo-build-sbf --tools-version v1.57 --manifest-path quantum_vault/Cargo.toml --sbf-out-dir target/deploy)\n(cd "$QLI_ROOT/programs" && RUSTUP_TOOLCHAIN=nightly-2025-11-01 anchor idl build -p quantum_vault -o idl/quantum_vault.json -- --locked)\nsha256sum "$QLI_ROOT/programs/target/deploy/quantum_vault.so"\nstat -c%s "$QLI_ROOT/programs/target/deploy/quantum_vault.so"\ngrep -n "\\"address\\"" "$QLI_ROOT/programs/idl/quantum_vault.json"   # must equal $PROGRAM_ID\n# The old placeholder hash no longer applies.',
  },
  {
    step: "8. Run tests from the root against the rebuilt binary",
    cmd: '(cd "$QLI_ROOT/programs" && cargo test -p quantum_vault_policy)\n(cd "$QLI_ROOT" && QLI_VAULT_SBF=1 BPF_OUT_DIR="$QLI_ROOT/programs/target/deploy" bunx vitest run src/test/quantum-vault-sbf.test.ts src/test/quantum-vault.test.ts)',
  },
  {
    step: "9. OWNER SIGNATURE REQUIRED — deploy to devnet with your own signer",
    cmd: 'solana program deploy "$QLI_ROOT/programs/target/deploy/quantum_vault.so" \\\n  --program-id "$QLI_ROOT/programs/target/deploy/quantum_vault-keypair.json" \\\n  --upgrade-authority "$HOME/.config/qli-devnet/owner.json" \\\n  --keypair "$HOME/.config/qli-devnet/owner.json" \\\n  --url devnet',
  },
  {
    step: "10. Verify on-chain bytes and authority",
    cmd: 'solana program show "$PROGRAM_ID" --url devnet   # Authority must equal $OWNER\nsolana program dump "$PROGRAM_ID" /tmp/qv-dumped.so --url devnet\nLEN=$(stat -c%s "$QLI_ROOT/programs/target/deploy/quantum_vault.so")\nhead -c "$LEN" /tmp/qv-dumped.so | sha256sum   # must equal step 7\ntail -c +$((LEN + 1)) /tmp/qv-dumped.so | tr -d \'\\0\' | wc -c   # must print 0 (padding only)',
  },
  {
    step: "11. Share only public addresses",
    cmd: 'echo "program: $PROGRAM_ID  upgrade authority: $OWNER"\n# Then commit OWNER_REVIEWED_ARTIFACT (sha256, length, programId) and the\n# QUANTUM_VAULT_DEPLOYMENT config for source review. Never share keypair JSON or seed phrases.',
  },
];
