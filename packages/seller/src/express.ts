/** Express middleware: pact(options). ROADMAP K-06. */
import type { RequestHandler, Request, Response, NextFunction } from "express";
import { buildPaymentRequired } from "./payment-required.ts";
import { DELIVERY_HEADER, signDelivery } from "./delivery.ts";
import { type PactRouteOptions, type SellerConfig, resolveSellerConfig } from "./pact.ts";

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

/** Extracts pact_id from request headers (M0 or M2). */
function extractPactId(req: Request): string | undefined {
  // Check X-Pactwright-Pact header first (format: "pact_id=<hex>" or JSON)
  const pactHeader = req.headers["x-pactwright-pact"];
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

  // Check X-Payment header
  const paymentHeader = req.headers["x-payment"];
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

export function pact(
  options: PactRouteOptions<Request>,
  config?: Partial<SellerConfig>,
): RequestHandler {
  const cfg = resolveSellerConfig(config);

  return (req: Request, res: Response, next: NextFunction): void => {
    const hasPayment = req.headers["x-payment"] || req.headers["authorization"]?.startsWith("Bearer ");

    // If no payment header provided, return 402 with x402 + extra.pactwright
    if (!hasPayment) {
      const pr = buildPaymentRequired(options, req, cfg);
      res.status(402).json(pr);
      return;
    }

    // Identify the pact
    const pactId = extractPactId(req) ?? "01".repeat(32);

    // Refuse terminal pacts
    if (isPactTerminal(pactId)) {
      res.status(409).json({ error: `Pact ${pactId} is in a terminal state or has already been served.` });
      return;
    }

    // Intercept response to sign X-Pactwright-Delivery on 200/success
    const originalWrite = res.write.bind(res);
    const originalEnd = res.end.bind(res);
    const chunks: Buffer[] = [];

    // Override write
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    res.write = function (chunk: any, ...args: any[]): boolean {
      if (chunk) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }
      return originalWrite(chunk, ...args);
    };

    // Override end
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    res.end = function (chunk?: any, ...args: any[]): Response {
      if (chunk) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }
      const bodyBuffer = Buffer.concat(chunks);

      // Only sign delivery on 2xx responses
      if (res.statusCode >= 200 && res.statusCode < 300) {
        const receipt = signDelivery(pactId, bodyBuffer, cfg.deliverySecret);
        res.setHeader(DELIVERY_HEADER, receipt);
        markPactTerminal(pactId);
      }

      return originalEnd(chunk, ...args);
    };

    next();
  };
}
