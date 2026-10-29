/** 402 → exact pay (M0) or pact open (M2) → response body + delivery receipt. */
import { conditionHash, nonceFromIdempotencyKey, pactId, type PactTerms } from "@pactwright/core";
import type { RankedListing } from "@pactwright/adapters";
import type { PactwrightConfig } from "./client.ts";

export interface BuyOptions {
  /** Frozen before payment; its hash goes into the pact. */
  condition: Record<string, unknown>;
  /** Same key on retry → same nonce → same pact (no duplicates). */
  idempotencyKey: string;
  request?: { method?: string; headers?: Record<string, string>; body?: string };
  fetchImpl?: typeof fetch;
}

export interface Pact {
  terms: PactTerms;
  /** Paid response body. */
  body: Uint8Array;
  /** Raw X-Pactwright-Delivery header. */
  deliveryReceipt?: string;
  /** Hash of the settled payment (M0 transfer or M2 `open`), when the provider or seller reports it. */
  paymentTx?: string;
}

/** What a payment provider is asked to pay. */
export interface PaymentRequest {
  mode: "exact-refund" | "escrow";
  pactId: string;
  buyer: string;
  seller: string;
  amount: string;
  nonce: bigint;
  conditionHash: string;
}

/**
 * Builds the x402 payment: a signed USDC transfer (M0) or a signed `pact.open` (M2). It must
 * produce something a facilitator can verify and settle on-chain (ROADMAP K-08, K-09).
 */
export interface PaymentProvider {
  pay(request: PaymentRequest): Promise<{ header: string; paymentTx?: string }>;
}

export async function buy(
  config: PactwrightConfig,
  listing: RankedListing,
  options: BuyOptions,
): Promise<Pact> {
  const gateRes = await config.adapters.gate.approveBudget({
    agent: config.wallet.address(),
    amount: listing.price,
    asset: "USDC",
  });

  if (!gateRes.approved) {
    throw new Error("Budget approval rejected by gate");
  }

  const condHash = conditionHash(options.condition);
  const nonce = nonceFromIdempotencyKey(options.idempotencyKey);
  const buyer = config.wallet.address();
  const seller = listing.seller;
  const pId = pactId(buyer, seller, nonce, condHash);

  // No payment provider, no purchase: never send a payment header that pays nothing.
  if (!config.payment) {
    throw new Error("agent buy needs a payment provider (config.payment): see ROADMAP K-08 / K-09");
  }
  if (listing.mode !== "exact-refund" && listing.mode !== "escrow") {
    throw new Error(`Unsupported mode: ${(listing as { mode: string }).mode}`);
  }
  const payment = await config.payment.pay({
    mode: listing.mode,
    pactId: pId,
    buyer,
    seller,
    amount: listing.price,
    nonce,
    conditionHash: condHash,
  });
  const paymentHeader = payment.header;

  const doFetch = options.fetchImpl ?? config.fetchImpl ?? globalThis.fetch;
  const method = options.request?.method ?? "POST";
  const headers: Record<string, string> = {
    ...options.request?.headers,
    "X-Payment": paymentHeader,
    "X-Pactwright-Pact": pId,
    "X-Pactwright-Idempotency": options.idempotencyKey,
  };

  const res = await doFetch(listing.resourceUrl, {
    method,
    headers,
    body: options.request?.body,
  });

  if (res.status === 409) {
    const errBody = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(errBody.error ?? `Pact ${pId} is in a terminal state or has already been served.`);
  }

  if (!res.ok) {
    throw new Error(`Buy request failed with HTTP ${res.status}`);
  }

  const bodyBytes = new Uint8Array(await res.arrayBuffer());
  const deliveryReceipt = res.headers.get("x-pactwright-delivery") ?? undefined;
  const paymentTx = payment.paymentTx ?? settledTx(res.headers.get("x-payment-response"));

  const terms: PactTerms = {
    pactId: pId,
    mode: listing.mode,
    buyer,
    seller,
    resourceUrl: listing.resourceUrl,
    cap: listing.price,
    nonce: nonce.toString(),
    conditionHash: condHash,
    condition: options.condition,
    verifier: listing.verifier,
    metered: false,
    silence: listing.silence,
    verdictDeadline: 120,
    settleDeadline: 720,
    refundWindowLedgers: listing.refundWindowLedgers,
  };

  return {
    terms,
    body: bodyBytes,
    deliveryReceipt,
    ...(paymentTx ? { paymentTx } : {}),
  };
}

/** x402 `X-Payment-Response`: base64 JSON whose `transaction` is the settled payment's hash. */
function settledTx(header: string | null): string | undefined {
  if (!header) return undefined;
  try {
    const decoded = JSON.parse(Buffer.from(header, "base64").toString("utf8")) as { transaction?: unknown };
    return typeof decoded.transaction === "string" && /^[0-9a-f]{64}$/i.test(decoded.transaction) ? decoded.transaction : undefined;
  } catch {
    return undefined;
  }
}
