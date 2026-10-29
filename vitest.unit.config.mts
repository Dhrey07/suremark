import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "src"), "server-only": path.resolve(import.meta.dirname, "tests/empty.ts") } },
  test: {
    environment: "node",
    include: ["tests/codes.test.ts", "tests/credential.test.ts", "tests/cuis.test.ts"],
    env: {
      MASTER_SECRET: "test-master-secret-0123456789abcdef0123456789abcdef",
      SIGNING_KEY_VERSION: "1",
    },
  },
});
