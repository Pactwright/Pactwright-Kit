/** Builds the 402 response with accepts[].extra.pactwright (ARCHITECTURE §8.1). ROADMAP K-06. */
import { notImplemented, type PactwrightExtra } from "@pactwright/core";
import type { PactRouteOptions } from "./pact.ts";

export interface PaymentRequired {
  x402Version: 2;
  accepts: {
    scheme: "exact" | "pact";
    network: string;
    asset: string;
    amount: string;
    payTo: string;
    extra: { pactwright: PactwrightExtra };
  }[];
}

export function buildPaymentRequired<Req>(_options: PactRouteOptions<Req>, _req: Req): PaymentRequired {
  return notImplemented("K-06");
}
