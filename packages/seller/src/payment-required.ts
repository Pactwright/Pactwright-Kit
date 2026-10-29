/** Builds the 402 response with accepts[].extra.pactwright (ARCHITECTURE §8.1). ROADMAP K-06. */
import { PactwrightExtraSchema, type PactwrightExtra } from "@pactwright/core";
import { type PactRouteOptions, type SellerConfig, resolveSellerConfig, resolveDeadlines } from "./pact.ts";

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

export function buildPaymentRequired<Req>(
  options: PactRouteOptions<Req>,
  req: Req,
  config?: Partial<SellerConfig>,
): PaymentRequired {
  const cfg = resolveSellerConfig(config);
  const condition = options.condition(req);

  const extraCandidate: Record<string, unknown> = {
    version: 2,
    mode: options.mode,
    condition,
    deliveryKey: cfg.deliveryPublicKey,
    verifier: cfg.verifierPublicKey,
    verifierUrl: cfg.verifierUrl,
    refundWindowLedgers: options.refundWindowLedgers,
  };

  if (options.verify) {
    extraCandidate.verify = options.verify;
  }

  if (options.mode === "exact-refund") {
    if (cfg.refundVaultId) {
      extraCandidate.refundVault = cfg.refundVaultId;
    }
  } else {
    // escrow
    if (cfg.pactContractId) {
      extraCandidate.pactContract = cfg.pactContractId;
    }
    if (options.silence) {
      extraCandidate.silence = options.silence;
    }
    extraCandidate.deadlines = options.deadlines ?? resolveDeadlines(undefined, condition.kind as string);
    if (options.meter) {
      extraCandidate.meter = options.meter;
    }
  }

  const extra = PactwrightExtraSchema.parse(extraCandidate);
  const scheme = options.mode === "exact-refund" ? "exact" : "pact";

  return {
    x402Version: 2,
    accepts: [
      {
        scheme,
        network: cfg.network,
        asset: options.asset,
        amount: options.price,
        payTo: cfg.sellerAddress,
        extra: { pactwright: extra },
      },
    ],
  };
}
