"use strict";
// Pure JavaScript only: no native binding, so the upstream toBigIntLE() overflow cannot occur.
const { Buffer } = require("buffer");

function bytes(buf) {
  if (!ArrayBuffer.isView(buf) || buf.BYTES_PER_ELEMENT !== 1)
    throw new TypeError("Expected a Buffer or Uint8Array");
  return buf;
}
function hexOf(view, reverse) {
  let hex = "";
  const n = view.length;
  for (let i = 0; i < n; i++) {
    const b = view[reverse ? n - 1 - i : i];
    hex += (b < 16 ? "0" : "") + b.toString(16);
  }
  return hex;
}
function width(value) {
  if (!Number.isSafeInteger(value) || value < 0)
    throw new RangeError("Width must be a non-negative safe integer");
  return value;
}
function toHex(num, w) {
  if (typeof num !== "bigint") throw new TypeError("Expected a bigint");
  const value = num < 0n ? -num : num;
  return value
    .toString(16)
    .padStart(w * 2, "0")
    .slice(-w * 2 || 0, w ? undefined : 0);
}
exports.toBigIntLE = function toBigIntLE(buf) {
  const hex = hexOf(bytes(buf), true);
  return hex ? BigInt("0x" + hex) : 0n;
};
exports.toBigIntBE = function toBigIntBE(buf) {
  const hex = hexOf(bytes(buf), false);
  return hex ? BigInt("0x" + hex) : 0n;
};
exports.toBufferBE = function toBufferBE(num, w) {
  const size = width(w);
  return size ? Buffer.from(toHex(num, size), "hex") : Buffer.alloc(0);
};
exports.toBufferLE = function toBufferLE(num, w) {
  return exports.toBufferBE(num, w).reverse();
};