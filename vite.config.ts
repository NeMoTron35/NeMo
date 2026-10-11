import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsConfigPaths from "vite-tsconfig-paths";
import { nitro } from "nitro/vite";
import { fileURLToPath } from "node:url";

// These @solana packages only export "browser"/"node" conditions, which the Worker build can't resolve.
const solanaBrowserOnly = [
  "codecs",
  "codecs-core",
  "codecs-data-structures",
  "codecs-numbers",
  "codecs-strings",
  "errors",
  "options",
];
const browserAlias = (p: string) =>
  fileURLToPath(new URL(`./node_modules/${p}/dist/index.browser.mjs`, import.meta.url));

// Anchor's ESM entry assigns CommonJS `exports` outside browsers, which crashes the Worker.
const anchorBrowser = fileURLToPath(
  new URL("./node_modules/@coral-xyz/anchor/dist/browser/index.js", import.meta.url),
);
// Bare buffer imports otherwise become empty browser-external stubs in production.
const bufferBrowser = fileURLToPath(new URL("./node_modules/buffer/index.js", import.meta.url));

export default defineConfig(({ command }) => ({
  server: { host: "0.0.0.0", port: 8080, strictPort: true },
  resolve: {
    dedupe: ["react", "react-dom", "@tanstack/react-router"],
    alias: [
      { find: /^(?:node:)?buffer\/?$/, replacement: bufferBrowser },
      { find: /^rpc-websockets$/, replacement: browserAlias("rpc-websockets") },
      { find: /^@coral-xyz\/anchor$/, replacement: anchorBrowser },
      ...solanaBrowserOnly.map((n) => ({
        find: new RegExp(`^@solana/${n}$`),
        replacement: browserAlias(`@solana/${n}`),
      })),
    ],
  },
  plugins: [
    {
      name: "qli-browser-buffer",
      enforce: "pre",
      resolveId(source) {
        if (/^(?:node:)?buffer\/?$/.test(source)) return bufferBrowser;
        return null;
      },
    },
    tsConfigPaths(),
    tanstackStart({ server: { entry: "server" } }),
    react(),
    tailwindcss(),
    ...(command === "build"
      ? [
          nitro({
            preset: "cloudflare-module",
            cloudflare: { nodeCompat: true, deployConfig: true },
            alias: { "@coral-xyz/anchor": anchorBrowser },
            output: { dir: "dist", serverDir: "dist/server", publicDir: "dist/client" },
          }),
        ]
      : []),
  ],
}));