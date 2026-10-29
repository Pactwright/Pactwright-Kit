import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Workspace packages resolve to their TypeScript source through alias,
// while preserving standard package resolution for node_modules dependencies.
export default defineConfig({
  resolve: {
    alias: [
      { find: /^@pactwright\/(.*)$/, replacement: resolve(__dirname, "packages/$1/src/index.ts") },
      { find: "@witness/core", replacement: resolve(__dirname, "vendor/witness-core/src/index.ts") },
      { find: "@accensa/sdk", replacement: resolve(__dirname, "vendor/accensa-sdk/src/index.ts") },
    ],
  },
  test: {
    include: [
      "packages/*/test/**/*.test.ts",
      "services/*/test/**/*.test.ts",
      "vendor/*/test/**/*.test.ts",
      "examples/*/test/**/*.test.ts",
    ],
  },
});
