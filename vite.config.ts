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

export default defineConfig(({ command }) => ({
  server: { host: "0.0.0.0", port: 8080, strictPort: true },
  resolve: {
    dedupe: ["react", "react-dom", "@tanstack/react-router"],
    alias: [
      { find: /^rpc-websockets$/, replacement: browserAlias("rpc-websockets") },
      ...solanaBrowserOnly.map((n) => ({
        find: new RegExp(`^@solana/${n}$`),
        replacement: browserAlias(`@solana/${n}`),
      })),
    ],
  },
  plugins: [
    tsConfigPaths(),
    tanstackStart({ server: { entry: "server" } }),
    react(),
    tailwindcss(),
    ...(command === "build"
      ? [
          nitro({
            preset: "cloudflare-module",
            cloudflare: { nodeCompat: true, deployConfig: true },
            output: { dir: "dist", serverDir: "dist/server", publicDir: "dist/client" },
          }),
        ]
      : []),
  ],
}));
