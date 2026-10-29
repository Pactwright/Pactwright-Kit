/**
 * Framework-neutral x402 paywall for Pactwright routes. ROADMAP K-06.
 *
 * No payment → 402. A payment is verified and settled by the facilitator before the route runs,
 * so content is never served for a payment that didn't land. The `pact_id` comes from the chain
 * or is derived from the payer the facilitator verified, never taken from the client.
 */
import { conditionHash, pactId as derivePactId } from "@pactwright/core";
import {
  decodePaymentSignatureHeader,
  encodePaymentRequiredHeader,
  encodePaymentResponseHeader,
  HTTPFacilitatorClient,
} from "@x402/core/http";
import type { FacilitatorClient } from "@x402/core/server";
import type { PaymentPayload, PaymentRequired, SettleResponse } from "@x402/core/types";
import { buildPaymentRequired } from "./payment-required.ts";
import type { PactRouteOptions, ResolvedSellerConfig } from "./pact.ts";

/** x402 v2 request header carrying the payment; `X-PAYMENT` is accepted as the v1 name. */
export const PAYMENT_HEADERS = ["payment-signature", "x-payment"] as const;
/** The u64 nonce the buyer used in its `pact_id`; required so the seller can derive the id. */
export const NONCE_HEADER = "x-pactwright-nonce";

export interface PaywallRequest {
  /** Absolute URL of the protected resource. */
  url: string;
  header(name: string): string | undefined;
}

export type PaywallOutcome =
  | { kind: "respond"; status: 402 | 409; headers: Record<string, string>; body: unknown }
  | { kind: "paid"; pactId: string; settlement: SettleResponse; headers: Record<string, string> };

export function facilitatorFor(cfg: ResolvedSellerConfig): FacilitatorClient {
  return new HTTPFacilitatorClient({
    url: cfg.facilitatorUrl,
    ...(cfg.facilitatorApiKey
      ? {
          createAuthHeaders: async () => {
            const h = { Authorization: `Bearer ${cfg.facilitatorApiKey}` };
            return { verify: h, settle: h, supported: h };
          },
        }
      : {}),
  });
}

function paymentRequired(pr: PaymentRequired, error?: string): PaywallOutcome {
  const body = error ? { ...pr, error } : pr;
  return { kind: "respond", status: 402, headers: { "PAYMENT-REQUIRED": encodePaymentRequiredHeader(body) }, body };
}

/**
 * Runs the paywall for one request. `isServed` lets the caller refuse a pact that already
 * received its content (checked before settling, so a repeat isn't charged twice).
 */
export async function processPayment<Req>(
  options: PactRouteOptions<Req>,
  raw: Req,
  req: PaywallRequest,
  cfg: ResolvedSellerConfig,
  facilitator: FacilitatorClient,
  isServed: (pactId: string) => boolean,
): Promise<PaywallOutcome> {
  const pr = buildPaymentRequired(options, raw, cfg, req.url);
  const header = PAYMENT_HEADERS.map((h) => req.header(h)).find(Boolean);
  if (!header) return paymentRequired(pr);

  let payload: PaymentPayload;
  try {
    payload = decodePaymentSignatureHeader(header);
  } catch {
    return paymentRequired(pr, "malformed payment header");
  }
  // Always verify against this route's own terms, never the ones the client echoes back.
  const requirement = pr.accepts.find(
    (r) => r.scheme === payload.accepted?.scheme && r.network === payload.accepted?.network,
  );
  if (!requirement) return paymentRequired(pr, "payment does not match an accepted scheme");

  const nonceHeader = req.header(NONCE_HEADER);
  if (!nonceHeader || !/^\d{1,20}$/.test(nonceHeader)) return paymentRequired(pr, `missing ${NONCE_HEADER}`);
  const nonce = BigInt(nonceHeader);

  const verified = await facilitator.verify(payload, requirement);
  if (!verified.isValid || !verified.payer) {
    return paymentRequired(pr, verified.invalidReason ?? "payment rejected");
  }
  const condition = (requirement.extra.pactwright as { condition: Record<string, unknown> }).condition;
  const expectedId = derivePactId(verified.payer, cfg.sellerAddress, nonce, conditionHash(condition));
  if (isServed(expectedId)) {
    return { kind: "respond", status: 409, headers: {}, body: { error: `pact ${expectedId} was already served` } };
  }

  const settlement = await facilitator.settle(payload, requirement);
  if (!settlement.success) return paymentRequired(pr, settlement.errorReason ?? "settlement failed");

  // M2: the contract's own pact_id, which must equal the one the seller derived.
  const onChainId = (settlement.extensions?.pactwright as { pactId?: string } | undefined)?.pactId;
  if (requirement.scheme === "pact" && onChainId !== expectedId) {
    return paymentRequired(pr, "settled pact does not match the request's nonce");
  }
  return {
    kind: "paid",
    pactId: expectedId,
    settlement,
    headers: { "PAYMENT-RESPONSE": encodePaymentResponseHeader(settlement), "X-Pactwright-Pact": expectedId },
  };
}
