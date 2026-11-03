// Bundles Accensa's facilitator into one Vercel Function, in the Build Output API format:
// .vercel/output/{config.json, functions/index.func/}. Every request routes to the function.
// Upstream is fetched at a pinned commit (override with FACILITATOR_REF) into ./upstream and
// installed from its own lockfile; nothing in it is changed.
//   npm ci && node build.mjs && vercel deploy --prebuilt --prod
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const REPO = "https://github.com/accensa/x402-facilitator-stellar.git";
// main after the `pact` scheme (#651) and #652.
const REF = process.env.FACILITATOR_REF ?? "2aafe8d5db5e480844d935233121ec14cd8b3c48";

const root = dirname(fileURLToPath(import.meta.url));
const upstream = join(root, "upstream");
const output = join(root, ".vercel", "output");
const func = join(output, "functions", "index.func");

const run = (cmd, args, cwd) => execFileSync(cmd, args, { cwd, stdio: "inherit" });
if (!existsSync(join(upstream, ".git"))) {
  mkdirSync(upstream, { recursive: true });
  run("git", ["init", "-q"], upstream);
  run("git", ["remote", "add", "origin", REPO], upstream);
}
run("git", ["fetch", "-q", "--depth", "1", "origin", REF], upstream);
run("git", ["checkout", "-q", "--force", "FETCH_HEAD"], upstream);
run("npm", ["ci", "--omit=dev", "--ignore-scripts", "--no-audit", "--no-fund", "--loglevel=error"], upstream);

rmSync(output, { recursive: true, force: true });
mkdirSync(func, { recursive: true });

await build({
  entryPoints: [join(root, "handler.mjs")],
  outfile: join(func, "index.mjs"),
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  // Optional native and alternative-runtime bindings the facilitator never loads.
  external: ["pg-native", "pg-cloudflare", "cloudflare:sockets"],
  // Some bundled dependencies are CommonJS and call require() at runtime.
  banner: { js: "import { createRequire as __pwCreateRequire } from 'node:module'; const require = __pwCreateRequire(import.meta.url);" },
  sourcemap: "linked",
  logLevel: "warning",
});

// Upstream loads these with createRequire at runtime, out of the bundler's sight, so they ship
// beside the bundle with their dependencies. (ioredis, kafkajs, redlock and node-vault are only
// loaded when Redis, Kafka or Vault is configured, which this deployment doesn't use.)
const shipped = new Set();
const ship = (name) => {
  if (shipped.has(name)) return;
  shipped.add(name);
  const dir = join(upstream, "node_modules", name);
  cpSync(dir, join(func, "node_modules", name), { recursive: true });
  const { dependencies = {} } = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
  for (const dep of Object.keys(dependencies)) if (existsSync(join(upstream, "node_modules", dep))) ship(dep);
};
for (const name of ["undici", "opossum", "pg"]) ship(name);

writeFileSync(
  join(func, ".vc-config.json"),
  JSON.stringify({ runtime: "nodejs22.x", handler: "index.mjs", launcherType: "Nodejs", shouldAddHelpers: false, maxDuration: 60 }, null, 2),
);
writeFileSync(join(output, "config.json"), JSON.stringify({ version: 3, routes: [{ src: "/(.*)", dest: "/index" }] }, null, 2));
console.log(`facilitator ${REF.slice(0, 7)} bundled into ${func}`);
