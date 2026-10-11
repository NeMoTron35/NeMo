import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/qli-vault-bankrun.test.ts"],
    testTimeout: 120_000,
    hookTimeout: 120_000,
  },
});
