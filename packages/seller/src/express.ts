/** Express middleware: pact(options). ROADMAP K-06. */
import type { RequestHandler, Request, Response, NextFunction } from "express";
import type { FacilitatorClient } from "@x402/core/server";
import { DELIVERY_HEADER, signDelivery } from "./delivery.ts";
import { type PactRouteOptions, type SellerConfig, resolveSellerConfig } from "./pact.ts";
import { facilitatorFor, processPayment } from "./paywall.ts";

/** Set of pact IDs that have reached a terminal state or were already served. */
const terminalPacts = new Set<string>();

export function markPactTerminal(pactId: string): void {
  terminalPacts.add(pactId.toLowerCase());
}

export function isPactTerminal(pactId: string): boolean {
  return terminalPacts.has(pactId.toLowerCase());
}

export function clearTerminalPacts(): void {
  terminalPacts.clear();
}

export function pact(
  options: PactRouteOptions<Request>,
  config?: Partial<SellerConfig>,
  facilitator?: FacilitatorClient,
): RequestHandler {
  const cfg = resolveSellerConfig(config);
  const fac = facilitator ?? facilitatorFor(cfg);

  return (req: Request, res: Response, next: NextFunction): void => {
    const url = `${req.protocol}://${req.get("host") ?? "localhost"}${req.originalUrl}`;
    processPayment(options, req, { url, header: (n) => req.get(n) ?? undefined }, cfg, fac, isPactTerminal)
      .then((outcome) => {
        if (outcome.kind === "respond") {
          res.status(outcome.status).set(outcome.headers).json(outcome.body);
          return;
        }
        res.set(outcome.headers);
        signResponse(res, outcome.pactId, cfg.deliverySecret);
        next();
      })
      .catch(next);
  };
}

/** Signs `X-Pactwright-Delivery` over the exact body of a 2xx response, then marks the pact served. */
function signResponse(res: Response, pactId: string, deliverySecret: Uint8Array | string): void {
  const originalWrite = res.write.bind(res);
  const originalEnd = res.end.bind(res);
  const chunks: Buffer[] = [];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  res.write = function (chunk: any, ...args: any[]): boolean {
    if (chunk) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    return originalWrite(chunk, ...args);
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  res.end = function (chunk?: any, ...args: any[]): Response {
    if (chunk) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    if (res.statusCode >= 200 && res.statusCode < 300 && !res.headersSent) {
      res.setHeader(DELIVERY_HEADER, signDelivery(pactId, Buffer.concat(chunks), deliverySecret));
      markPactTerminal(pactId);
    }
    return originalEnd(chunk, ...args);
  };
}
