// @solana/spl-token's layout helpers read a global Buffer; install the aliased browser build
// before they evaluate. Must be imported first.
import { Buffer } from "buffer";
const g = globalThis as { Buffer?: typeof Buffer };
g.Buffer ??= Buffer;
export {};
