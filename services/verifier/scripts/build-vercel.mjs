// Bundles the verifier into one Vercel Function, in the Build Output API format:
// .vercel/output/{config.json, functions/index.func/}. Every request routes to the function.
// Workspace packages are bundled from their TypeScript sources (the "source" export condition),
// so no separate package build is needed first.
import { build } from "esbuild";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const output = join(root, ".vercel", "output");
const func = join(output, "functions", "index.func");

rmSync(output, { recursive: true, force: true });
mkdirSync(func, { recursive: true });

await build({
  entryPoints: [join(root, "src", "vercel.ts")],
  outfile: join(func, "index.mjs"),
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  conditions: ["source"],
  // pg's optional native and Cloudflare bindings are never used here.
  external: ["pg-native", "pg-cloudflare", "cloudflare:sockets"],
  // Some bundled dependencies are CommonJS and call require() at runtime.
  banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" },
  sourcemap: "linked",
  logLevel: "warning",
});

writeFileSync(
  join(func, ".vc-config.json"),
  JSON.stringify({ runtime: "nodejs22.x", handler: "index.mjs", launcherType: "Nodejs", shouldAddHelpers: false, maxDuration: 120 }, null, 2),
);
writeFileSync(join(output, "config.json"), JSON.stringify({ version: 3, routes: [{ src: "/(.*)", dest: "/index" }] }, null, 2));
console.log(`verifier bundled into ${func}`);
