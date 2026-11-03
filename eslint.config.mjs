// ESLint flat config (ROADMAP K-01).
import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "**/dist/**",
      "**/node_modules/**",
      "**/.vercel/**", // Vercel build output
      "deploy/facilitator/upstream/**", // Accensa's facilitator, fetched unmodified by build.mjs
      "vendor/**", // upstream code, kept unmodified (vendor/witness-core/UPSTREAM.md)
      "packages/contracts-client/src/**", // generated (K-05)
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.ts"],
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/consistent-type-imports": "error",
    },
  },
  {
    // Node build and deploy scripts.
    files: ["**/*.mjs"],
    languageOptions: { globals: { process: "readonly", console: "readonly" } },
  },
);
