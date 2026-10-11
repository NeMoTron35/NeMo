"""QLi Intelligence public synthetic-only reference for Hugging Face Spaces.

No real-chain RPC, private keys, wallets, automated trading, or external inference.
The demo math mirrors research/qli-intelligence/core.mjs for fixed-point u64 swaps.
"""
from __future__ import annotations

import hashlib
import json
from typing import Any

UINT64_MAX = (1 << 64) - 1
SCENARIOS = (
    ("Baseline", 10_000, 10_000),
    ("Reduced output-side reserve", 10_000, 5_000),
    ("Increased output-side reserve", 10_000, 15_000),
    ("Input-side shock", 15_000, 10_000),
    ("Output-side shock", 5_000, 10_000),
)


def u64(value: Any, name: str) -> int:
    if isinstance(value, bool) or (not isinstance(value, (int, str))):
        raise ValueError(f"{name} must be a positive integer")
    string_value = str(value)
    if not string_value.isdecimal() or str(int(string_value)) != string_value:
        raise ValueError(f"{name} must be a canonical unsigned decimal")
    numeric = int(string_value)
    if numeric <= 0 or numeric > UINT64_MAX:
        raise ValueError(f"{name} outside u64 range")
    return numeric


def swap(reserve_in: Any, reserve_out: Any, amount_in: Any, fee_bps: int = 30) -> dict[str, Any]:
    x = u64(reserve_in, "reserve_in")
    y = u64(reserve_out, "reserve_out")
    a = u64(amount_in, "amount_in")
    if isinstance(fee_bps, bool) or not isinstance(fee_bps, int) or not (0 <= fee_bps <= 1000):
        raise ValueError("fee_bps must be between 0 and 1000")
    net_in = a * (10_000 - fee_bps) // 10_000
    out = net_in * y // (x + net_in)
    k_before = x * y
    k_after = (x + a) * (y - out)
    if out >= y or k_after < k_before:
        raise ArithmeticError("Constant-product invariant failed")
    return {
        "engine": "synthetic-constant-product-v1",
        "calibrated": False,
        "amountIn": str(a),
        "feeAmount": str(a - net_in),
        "amountOut": str(out),
        "reserveInAfter": str(x + a),
        "reserveOutAfter": str(y - out),
        "invariantNondecreasing": True,
        "disclaimer": "Illustrative math only; not a DBC quote or future price forecast.",
    }


def scenarios(reserve_in: Any, reserve_out: Any, amount_in: Any, fee_bps: int = 30) -> dict[str, Any]:
    x, y, a = u64(reserve_in, "reserve_in"), u64(reserve_out, "reserve_out"), u64(amount_in, "amount_in")
    rows = []
    for name, x_bps, y_bps in SCENARIOS:
        simulated_x, simulated_y = x * x_bps // 10_000, y * y_bps // 10_000
        result = swap(simulated_x, simulated_y, a, fee_bps)
        rows.append({
            "scenario": name, "reserveIn": str(simulated_x),
            "reserveOut": str(simulated_y), "amountOut": result["amountOut"],
        })
    values = [int(r["amountOut"]) for r in rows]
    record = {
        "version": "QLI-SPACE-SYNTHETIC-1",
        "input": {"reserveIn": str(x), "reserveOut": str(y), "amountIn": str(a), "feeBps": fee_bps},
        "scenarios": rows,
        "worstOutput": str(min(values)), "bestOutput": str(max(values)),
        "provenance": "synthetic", "prediction": False,
    }
    # Domain-separated integrity checksum only, not a blockchain signature/attestation.
    payload = json.dumps(record, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    digest = hashlib.sha256(b"QLI-SPACE-RESEARCH-v1\x00" + payload.encode("utf-8")).hexdigest()
    return {**record, "offchainSha256": digest}
