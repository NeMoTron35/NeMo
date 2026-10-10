// @vitest-environment node
import { describe, expect, it } from "vitest";
import { toBigIntBE, toBigIntLE, toBufferBE, toBufferLE } from "@quantum-qli/bigint-buffer-js";
import { u64, u128 } from "@solana/buffer-layout-utils";

describe("first-party bigint-buffer replacement", () => {
  it("round-trips little and big endian values", () => {
    const n = 0x0102030405060708n;
    expect([...toBufferLE(n, 8)]).toEqual([8, 7, 6, 5, 4, 3, 2, 1]);
    expect([...toBufferBE(n, 8)]).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(toBigIntLE(toBufferLE(n, 8))).toBe(n);
    expect(toBigIntBE(toBufferBE(n, 8))).toBe(n);
    expect(toBigIntLE(new Uint8Array())).toBe(0n);
  });
  it("truncates to the requested width and rejects invalid input", () => {
    expect([...toBufferBE(0x1ffffn, 2)]).toEqual([0xff, 0xff]);
    expect(() => toBufferLE(1n, -1)).toThrow(RangeError);
    expect(() => toBigIntLE("ab" as unknown as Uint8Array)).toThrow(TypeError);
  });
  it("is the implementation used by Solana u64/u128 layouts", () => {
    const b = Buffer.alloc(16);
    u64().encode(258n, b, 0);
    expect(u64().decode(b, 0)).toBe(258n);
    u128().encode(2n ** 100n, b, 0);
    expect(u128().decode(b, 0)).toBe(2n ** 100n);
  });
});