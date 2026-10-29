/** Hono middleware (v1). ROADMAP P7-07. */
import type { Context, MiddlewareHandler, Next } from "hono";
import { buildPaymentRequired } from "./payment-required.ts";
import { DELIVERY_HEADER, signDelivery } from "./delivery.ts";
import { type PactRouteOptions, type SellerConfig, resolveSellerConfig } from "./pact.ts";
import { isPactTerminal, markPactTerminal } from "./express.ts";

function extractPactIdFromHono(c: Context): string | undefined {
  const pactHeader = c.req.header("x-pactwright-pact");
  if (typeof pactHeader === "string") {
    const match = pactHeader.match(/pact_id=([0-9a-fA-F]{64})/i);
    if (match?.[1]) return match[1].toLowerCase();
    try {
      const parsed = JSON.parse(pactHeader) as Record<string, unknown>;
      if (typeof parsed.pact_id === "string" && /^[0-9a-fA-F]{64}$/.test(parsed.pact_id)) {
        return parsed.pact_id.toLowerCase();
      }
    } catch {
      // not JSON
    }
    if (/^[0-9a-fA-F]{64}$/.test(pactHeader.trim())) {
      return pactHeader.trim().toLowerCase();
    }
  }

  const paymentHeader = c.req.header("x-payment");
  if (typeof paymentHeader === "string") {
    try {
      const decoded = Buffer.from(paymentHeader, "base64").toString("utf8");
      const parsed = JSON.parse(decoded) as Record<string, unknown>;
      if (typeof parsed.pact_id === "string") return parsed.pact_id.toLowerCase();
      if (typeof parsed.pactId === "string") return parsed.pactId.toLowerCase();
    } catch {
      // ignore
    }
  }

  return undefined;
}

export function pactHono(
  options: PactRouteOptions<Context["req"]>,
  config?: Partial<SellerConfig>,
): MiddlewareHandler {
  const cfg = resolveSellerConfig(config);

  return async (c: Context, next: Next): Promise<Response | void> => {
    const hasPayment = c.req.header("x-payment") || c.req.header("authorization")?.startsWith("Bearer ");

    if (!hasPayment) {
      const pr = buildPaymentRequired(options, c.req, cfg);
      return c.json(pr, 402);
    }

    const pactId = extractPactIdFromHono(c) ?? "01".repeat(32);

    if (isPactTerminal(pactId)) {
      return c.json({ error: `Pact ${pactId} is in a terminal state or has already been served.` }, 409);
    }

    await next();

    if (c.res.status >= 200 && c.res.status < 300) {
      const clone = c.res.clone();
      const bodyBytes = new Uint8Array(await clone.arrayBuffer());
      const receipt = signDelivery(pactId, bodyBytes, cfg.deliverySecret);
      c.res.headers.set(DELIVERY_HEADER, receipt);
      markPactTerminal(pactId);
    }
  };
}
