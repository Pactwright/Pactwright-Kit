/** Hono middleware (v1): the same paywall as `pact()` for Express. ROADMAP P7-07. */
import type { Context, MiddlewareHandler, Next } from "hono";
import type { FacilitatorClient } from "@x402/core/server";
import { DELIVERY_HEADER, signDelivery } from "./delivery.ts";
import { type PactRouteOptions, type SellerConfig, resolveSellerConfig } from "./pact.ts";
import { isPactTerminal, markPactTerminal } from "./express.ts";
import { facilitatorFor, processPayment } from "./paywall.ts";

export function pactHono(
  options: PactRouteOptions<Context["req"]>,
  config?: Partial<SellerConfig>,
  facilitator?: FacilitatorClient,
): MiddlewareHandler {
  const cfg = resolveSellerConfig(config);
  const fac = facilitator ?? facilitatorFor(cfg);

  return async (c: Context, next: Next): Promise<Response | void> => {
    const outcome = await processPayment(
      options,
      c.req,
      { url: c.req.url, header: (n) => c.req.header(n) },
      cfg,
      fac,
      isPactTerminal,
    );
    if (outcome.kind === "respond") {
      return c.json(outcome.body as object, outcome.status, outcome.headers);
    }

    await next();
    for (const [name, value] of Object.entries(outcome.headers)) c.res.headers.set(name, value);
    if (c.res.status >= 200 && c.res.status < 300) {
      const body = new Uint8Array(await c.res.clone().arrayBuffer());
      c.res.headers.set(DELIVERY_HEADER, signDelivery(outcome.pactId, body, cfg.deliverySecret));
      markPactTerminal(outcome.pactId);
    }
  };
}
