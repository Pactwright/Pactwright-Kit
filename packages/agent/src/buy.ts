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
  paymentTx: string;
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

  let paymentHeader: string;
  let paymentTx: string;

  if (listing.mode === "exact-refund") {
    paymentTx = gateRes.fundingTx ?? `tx_m0_${pId.slice(0, 16)}`;
    const payload = {
      scheme: "exact",
      tx: paymentTx,
      pact_id: pId,
    };
    paymentHeader = Buffer.from(JSON.stringify(payload)).toString("base64");
  } else if (listing.mode === "escrow") {
    const authPayload = `pact_open:${pId}:${listing.price}`;
    const authEntry = await config.wallet.signAuthEntry(authPayload);
    paymentTx = gateRes.fundingTx ?? `tx_m2_${pId.slice(0, 16)}`;
    const payload = {
      scheme: "pact",
      authEntry,
      pact_id: pId,
      tx: paymentTx,
    };
    paymentHeader = Buffer.from(JSON.stringify(payload)).toString("base64");
  } else {
    throw new Error(`Unsupported mode: ${(listing as { mode: string }).mode}`);
  }

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
    paymentTx,
  };
}
