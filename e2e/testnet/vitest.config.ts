import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

// Same source aliases as the root config, plus the verifier service. Only this config runs
// the testnet e2e, so `pnpm test` never sends transactions.
export default defineConfig({
  resolve: {
    alias: [
      { find: "@pactwright/verifier", replacement: resolve(root, "services/verifier/src/index.ts") },
      { find: /^@pactwright\/(.*)$/, replacement: resolve(root, "packages/$1/src/index.ts") },
      { find: "@witness/core", replacement: resolve(root, "vendor/witness-core/src/index.ts") },
      { find: "@accensa/sdk", replacement: resolve(root, "vendor/accensa-sdk/src/index.ts") },
    ],
  },
  test: {
    root,
    include: ["e2e/testnet/run.e2e.ts"],
    testTimeout: 900_000,
  },
});
