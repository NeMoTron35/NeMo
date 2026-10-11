"""Read-only artifact and public-devnet verifier. Never reads wallet key material."""
import base64
import hashlib
import json
import os
from pathlib import Path
import re
import sys
import urllib.request

URL = "https://api.devnet.solana.com"
GENESIS = "EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG"
LOADER = "BPFLoaderUpgradeab1e11111111111111111111111"
ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"


def b58(data):
    n = int.from_bytes(data, "big")
    out = ""
    while n:
        n, r = divmod(n, 58)
        out = ALPHABET[r] + out
    return "1" * (len(data) - len(data.lstrip(b"\0"))) + out


def artifact(path, checksum):
    p = Path(path).resolve(strict=True)
    data = p.read_bytes()
    if len(data) < 4 or data[:4] != b"\x7fELF":
        raise ValueError("Artifact is not an ELF SBF file.")
    digest = hashlib.sha256(data).hexdigest()
    text = Path(checksum).resolve(strict=True).read_text().strip()
    # Exactly one checksum, optionally followed by the file name. No ambiguous manifests.
    match = re.fullmatch(r"([0-9a-fA-F]{64})(?:\s+\*?[^\r\n]+)?", text)
    if not match or match[1].lower() != digest:
        raise ValueError("Artifact SHA256 mismatch or malformed checksum file.")
    fp = hashlib.sha256(data.rstrip(b"\0")).hexdigest()
    expected = os.environ.get("EXPECTED_FP", "").lower()
    if expected and expected != fp:
        raise ValueError("Artifact code fingerprint differs from EXPECTED_FP.")
    return {"artifact": str(p), "fileSha256": digest, "codeFingerprint": fp, "bytes": len(data)}


def rpc(method, params=None):
    req = urllib.request.Request(
        URL,
        json.dumps({"jsonrpc": "2.0", "id": 1, "method": method, "params": params or []}).encode(),
        {"Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=30) as response:
        value = json.load(response)
    if "error" in value or "result" not in value:
        raise ValueError("Devnet RPC failed: " + method)
    return value["result"]


def account(address):
    result = rpc("getAccountInfo", [address, {"encoding": "base64", "commitment": "confirmed"}])
    value = result.get("value")
    if value is None:
        return None, result["context"]["slot"]
    value["bytes"] = base64.b64decode(value["data"][0], validate=True)
    return value, result["context"]["slot"]


def verify(program, expected, authority=None):
    if not re.fullmatch(r"[1-9A-HJ-NP-Za-km-z]{32,44}", program):
        raise ValueError("Invalid program public key.")
    if expected is not None and not re.fullmatch(r"[0-9a-f]{64}", expected):
        raise ValueError("A reviewed code fingerprint is required.")
    if rpc("getGenesisHash") != GENESIS:
        raise ValueError("Wrong genesis: public devnet required.")
    a, slot = account(program)
    if a is None:
        return {"status": "NOT_DEPLOYED", "program": program, "network": "devnet", "slot": slot}
    d = a["bytes"]
    if a["owner"] != LOADER or not a["executable"] or len(d) != 36 or int.from_bytes(d[:4], "little") != 2:
        raise ValueError("Program executable/Upgradeable Loader state check failed.")
    pd_address = b58(d[4:36])
    pd, _ = account(pd_address)
    if pd is None or pd["owner"] != LOADER or pd["executable"]:
        raise ValueError("ProgramData owner/state invalid.")
    p = pd["bytes"]
    if len(p) <= 45 or int.from_bytes(p[:4], "little") != 3 or p[12] not in (0, 1):
        raise ValueError("Malformed ProgramData header.")
    actual_authority = b58(p[13:45]) if p[12] == 1 else "immutable"
    if authority and actual_authority != authority:
        raise ValueError("Upgrade authority differs from the reviewed owner.")
    fp = hashlib.sha256(p[45:].rstrip(b"\0")).hexdigest()
    if expected is not None and fp != expected:
        raise ValueError("On-chain code fingerprint mismatch: unknown/replaced program.")
    return {
        "status": "DEVNET_DEPLOYED" if expected is not None else "PRESENT_UNREVIEWED", "program": program, "programData": pd_address,
        "network": "devnet", "genesis": GENESIS, "slot": slot,
        "programDataSlot": int.from_bytes(p[4:12], "little"),
        "upgradeAuthority": actual_authority, "codeFingerprint": fp, "writesEnabled": False,
    }


def main():
    mode, *args = sys.argv[1:]
    if mode == "artifact" and len(args) == 2:
        print(json.dumps(artifact(*args)))
    elif mode == "verify" and 2 <= len(args) <= 3:
        report = verify(*args)
        print(json.dumps(report, indent=2))
        if report["status"] == "NOT_DEPLOYED":
            sys.exit(3)
    elif mode == "probe" and len(args) == 1:
        report = verify(args[0], None)
        print(json.dumps(report, indent=2))
        if report["status"] == "NOT_DEPLOYED":
            sys.exit(3)
    else:
        raise ValueError("Usage: hook-artifact.py artifact SO CHECKSUM | verify PROGRAM FINGERPRINT [AUTHORITY]")


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        # No secret input is accepted by this utility. Do not emit network URLs or exception payloads.
        print("Verification refused: " + (str(error) if isinstance(error, ValueError) else "file or RPC unavailable"), file=sys.stderr)
        sys.exit(1)