/** 402 → exact pay (M0) or pact open (M2) → response body + delivery receipt. */
import { notImplemented, type PactTerms } from "@pactwright/core";
import type { RankedListing } from "@pactwright/adapters";
import type { PactwrightConfig } from "./client.ts";

export interface BuyOptions {
  /** Frozen before payment; its hash goes into the pact. */
  condition: Record<string, unknown>;
  /** Same key on retry → same nonce → same pact (no duplicates). */
  idempotencyKey: string;
  request?: { method?: string; headers?: Record<string, string>; body?: string };
}

export interface Pact {
  terms: PactTerms;
  /** Paid response body. */
  body: Uint8Array;
  /** Raw X-Pactwright-Delivery header. */
  deliveryReceipt?: string;
  paymentTx: string;
}

export async function buy(
  _config: PactwrightConfig,
  _listing: RankedListing,
  _options: BuyOptions,
): Promise<Pact> {
  return notImplemented("K-08"); // M2 path: K-09
}
