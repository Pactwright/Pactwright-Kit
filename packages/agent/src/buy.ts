/**
 * Buy over x402 (ROADMAP K-08, K-09): request → 402 → check the seller's terms → pay → retry →
 * response body + delivery receipt + the settled payment's transaction.
 */
import { conditionHash, nonceFromIdempotencyKey, pactId, toStroops, type PactTerms } from "@pactwright/core";
import type { RankedListing } from "@pactwright/adapters";
import { x402Client, x402HTTPClient } from "@x402/core/client";
import type { PaymentRequired, PaymentRequirements } from "@x402/core/types";
import type { PactwrightConfig } from "./client.ts";
import { x402Payment } from "./x402.ts";

/** The u64 nonce in the buyer's `pact_id`, so the seller can derive the same id. */
export const NONCE_HEADER = "X-Pactwright-Nonce";

export interface BuyOptions {
  /** Frozen before payment; its hash goes into the pact. The seller must ask for exactly this. */
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
  /** Hash of the settled payment (M0 transfer or M2 `open`), from the seller's `PAYMENT-RESPONSE`. */
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
  /** The seller's 402, and the one requirement the agent chose to pay. */
  paymentRequired: PaymentRequired;
  requirement: PaymentRequirements;
}

/**
 * Builds the x402 payment headers: a signed USDC transfer (M0) or a signed `pact.open` (M2) that
 * a facilitator can verify and settle on-chain. The default is `x402Payment` with the agent's wallet.
 */
export interface PaymentProvider {
  pay(request: PaymentRequest): Promise<{ headers: Record<string, string> }>;
}

export async function buy(config: PactwrightConfig, listing: RankedListing, options: BuyOptions): Promise<Pact> {
  if (listing.mode !== "exact-refund" && listing.mode !== "escrow") {
    throw new Error(`Unsupported mode: ${(listing as { mode: string }).mode}`);
  }
  const gateRes = await config.adapters.gate.approveBudget({
    agent: config.wallet.address(),
    amount: listing.price,
    asset: "USDC",
  });
  if (!gateRes.approved) throw new Error("Budget approval rejected by gate");

  const condHash = conditionHash(options.condition);
  const nonce = nonceFromIdempotencyKey(options.idempotencyKey);
  const buyer = config.wallet.address();
  const seller = listing.seller;
  const pId = pactId(buyer, seller, nonce, condHash);
  const doFetch = options.fetchImpl ?? config.fetchImpl ?? globalThis.fetch;
  const send = (extra: Record<string, string>) =>
    doFetch(listing.resourceUrl, {
      method: options.request?.method ?? "POST",
      headers: { ...options.request?.headers, [NONCE_HEADER]: nonce.toString(), ...extra },
      body: options.request?.body,
    });

  // 1. Ask, and expect the seller's 402.
  const first = await send({});
  if (first.status !== 402) throw new Error(`expected 402 Payment Required, got HTTP ${first.status}`);
  const http = new x402HTTPClient(new x402Client());
  const paymentRequired = http.getPaymentRequiredResponse(
    (name) => first.headers.get(name),
    await first.json().catch(() => undefined),
  );

  // 2. Pay only for what was agreed: the right scheme, seller, price and frozen condition.
  const scheme = listing.mode === "escrow" ? "pact" : "exact";
  const requirement = paymentRequired.accepts.find((r) => r.scheme === scheme);
  if (!requirement) throw new Error(`seller does not accept the ${scheme} scheme`);
  if (requirement.payTo !== seller) throw new Error("402 names a different payee than the listing");
  if (BigInt(requirement.amount) > toStroops(listing.price)) throw new Error("402 asks for more than the listing price");
  const sellerCondition = (requirement.extra.pactwright as { condition?: Record<string, unknown> } | undefined)?.condition;
  if (!sellerCondition || conditionHash(sellerCondition) !== condHash) {
    throw new Error("402 names a different condition than the buyer froze");
  }

  const payment = config.payment ?? x402Payment({ wallet: config.wallet, rpcUrl: config.network.rpcUrl });
  const { headers } = await payment.pay({
    mode: listing.mode,
    pactId: pId,
    buyer,
    seller,
    amount: listing.price,
    nonce,
    conditionHash: condHash,
    paymentRequired,
    requirement,
  });

  // 3. Retry with the payment.
  const res = await send(headers);
  if (res.status === 409) {
    const errBody = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(errBody.error ?? `Pact ${pId} was already served.`);
  }
  if (!res.ok) {
    const errBody = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(`Buy failed with HTTP ${res.status}${errBody.error ? `: ${errBody.error}` : ""}`);
  }

  const settlement = (() => {
    try {
      return http.getPaymentSettleResponse((name) => res.headers.get(name));
    } catch {
      return undefined;
    }
  })();
  const paymentTx = settlement?.success && /^[0-9a-f]{64}$/i.test(settlement.transaction) ? settlement.transaction : undefined;

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
    refundWindowLedgers: listing.refundWindowLedgers,
  };

  return {
    terms,
    body: new Uint8Array(await res.arrayBuffer()),
    deliveryReceipt: res.headers.get("x-pactwright-delivery") ?? undefined,
    ...(paymentTx ? { paymentTx } : {}),
  };
}
