import { defineConfig } from "vitest/config";

// Workspace packages resolve to their TypeScript source through the "source" export
// condition, so tests never need a build first (ROADMAP K-01).
const conditions = ["source", "import", "module", "node", "default"];

export default defineConfig({
  resolve: { conditions },
  ssr: { resolve: { conditions, externalConditions: ["source"] } },
  test: {
    include: [
      "packages/*/test/**/*.test.ts",
      "services/*/test/**/*.test.ts",
      "vendor/*/test/**/*.test.ts",
    ],
  },
});
