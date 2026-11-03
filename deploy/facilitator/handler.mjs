/**
 * Vercel Function entrypoint for Accensa's x402 facilitator (ROADMAP L-08). The facilitator
 * itself is unmodified upstream code at the commit pinned in `build.mjs`; this file is the
 * serverless counterpart of its `src/server.js`: the same configuration, signers, RPC retry
 * and routes, built once per function instance, with no port, timers or background workers.
 *
 * Without DATABASE_URL or REDIS_URL, rate limits and idempotency are per instance, which
 * suits the free testnet deployment this serves.
 */
import { resolveConfig } from "./upstream/src/config.js";
import { buildFacilitator } from "./upstream/src/facilitator.js";
import { installHorizonClient } from "./upstream/src/horizon-client.js";
import { installRpcRetry } from "./upstream/src/rpc-retry.js";
import { createRequestLog } from "./upstream/src/log.js";
import { createMetrics } from "./upstream/src/metrics.js";
import { createIpPseudonymizer, deriveIpHashSecret } from "./upstream/src/ip.js";
import { RateLimiter } from "./upstream/src/rate-limit.js";
import { createRateLimitStore } from "./upstream/src/rate-limit-store.js";
import { buildIdempotencyStore } from "./upstream/src/idempotency.js";
import { buildCatalogStore } from "./upstream/src/catalog/postgres.js";
import { buildSettlementStore } from "./upstream/src/store/index.js";
import { createApp } from "./upstream/src/app.js";

let ready;

async function build() {
  const config = resolveConfig();
  installHorizonClient({ rpcForceIpv4: config.rpcForceIpv4, log: (msg) => console.log(`  ${msg}`) });
  const metrics = createMetrics();
  const rpc = installRpcRetry({
    rpcForceIpv4: config.rpcForceIpv4,
    log: (msg) => console.warn(`  ${msg}`),
    onStateChange: (msg) => console.warn(`  [Breaker] ${msg}`),
    onRetry: ({ code, host }) => metrics.incRpcRetry({ code, host }),
  });
  const ipPseudonymizer = createIpPseudonymizer({
    secret: config.ipHashSecret ?? deriveIpHashSecret(config.perNetwork[config.networks[0]]?.secret),
  });
  const { facilitator, signers, schemes } = buildFacilitator(config);
  const rateLimiter = new RateLimiter(config.rateLimits, createRateLimitStore(process.env, { maxSize: 10000 }));
  const catalog = buildCatalogStore(config, { log: (msg) => console.warn(`  ${msg}`) });
  const app = await createApp(config, facilitator, rateLimiter, catalog, buildIdempotencyStore(config), {
    breakerStates: rpc?.getBreakerStates,
    logger: createRequestLog({ level: config.logLevel }),
    metrics,
    signers,
    pactSchemeFor: (network) => schemes[network]?.pactScheme ?? undefined,
    ipPseudonymizer,
    settlementStore: buildSettlementStore(config),
  });
  await app.ready();
  return app;
}

export default async function handler(req, res) {
  ready ??= build();
  let app;
  try {
    app = await ready;
  } catch (e) {
    // Rebuild on the next request; report the reason without any configured value.
    ready = undefined;
    console.error(JSON.stringify({ level: "error", msg: "facilitator failed to start", reason: e.message }));
    res.statusCode = 503;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ error: "not_configured" }));
    return;
  }
  app.server.emit("request", req, res);
}
