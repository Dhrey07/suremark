import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "src"), "server-only": path.resolve(import.meta.dirname, "tests/empty.ts") } },
  test: {
    environment: "node",
    globalSetup: ["tests/global-setup.ts"],
    fileParallelism: false,
    testTimeout: 30000,
    env: {
      DATABASE_URL: process.env.TEST_DATABASE_URL ?? "postgres://postgres@127.0.0.1:5432/upa_test",
      MASTER_SECRET: "test-master-secret-0123456789abcdef0123456789abcdef",
      SIGNING_KEY_VERSION: "1",
    },
    hookTimeout: 60000,
  },
});
