/**
 * Builds a valid x402 v2 `402 Payment Required` with `accepts[].extra.pactwright`
 * (ARCHITECTURE §8.1). ROADMAP K-06.
 *
 * - M0 (`exact-refund`): scheme `exact`, paid straight to the seller.
 * - M2 (`escrow`): scheme `pact`, paid into the `pact` contract (accensa/x402-facilitator-stellar,
 *   docs/scheme_pact_stellar.md).
 *
 * Amounts are in the token's smallest unit and `asset` is the token contract, as x402 requires.
 */
import type { PaymentRequired, PaymentRequirements } from "@x402/core/types";
import { PactwrightExtraSchema, toStroops } from "@pactwright/core";
import { type PactRouteOptions, type ResolvedSellerConfig, resolveDeadlines } from "./pact.ts";

export type { PaymentRequired };

export function buildPaymentRequired<Req>(
  options: PactRouteOptions<Req>,
  req: Req,
  cfg: ResolvedSellerConfig,
  resourceUrl: string,
): PaymentRequired {
  const condition = options.condition(req);
  const escrow = options.mode === "escrow";
  if (escrow && !cfg.pactContractId) throw new Error("escrow routes need PACT_CONTRACT_ID");

  const extra = PactwrightExtraSchema.parse({
    version: 2,
    mode: options.mode,
    condition,
    deliveryKey: cfg.deliveryPublicKey,
    verifier: cfg.verifierPublicKey,
    verifierUrl: cfg.verifierUrl,
    refundWindowLedgers: options.refundWindowLedgers,
    ...(options.verify ? { verify: options.verify } : {}),
    ...(escrow
      ? {
          pactContract: cfg.pactContractId,
          silence: options.silence ?? "refund",
          deadlines: options.deadlines ?? resolveDeadlines(undefined, condition.kind as string),
          ...(options.meter ? { meter: options.meter } : {}),
        }
      : cfg.refundVaultId
        ? { refundVault: cfg.refundVaultId }
        : {}),
  });

  const requirement: PaymentRequirements = {
    scheme: escrow ? "pact" : "exact",
    network: cfg.network as PaymentRequirements["network"],
    asset: cfg.usdcSac,
    amount: toStroops(options.price).toString(),
    payTo: cfg.sellerAddress,
    maxTimeoutSeconds: cfg.maxTimeoutSeconds,
    extra: {
      areFeesSponsored: true,
      ...(escrow ? { pactContract: cfg.pactContractId } : {}),
      pactwright: extra,
    },
  };

  return {
    x402Version: 2,
    error: "payment required",
    resource: { url: resourceUrl, description: `Pactwright ${escrow ? "escrow" : "exact-refund"} purchase`, mimeType: "" },
    accepts: [requirement],
  };
}
