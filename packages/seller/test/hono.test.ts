/** Hono middleware: the same paywall as Express (P7-07, FR-I3). */
import { describe, it, expect, vi } from "vitest";
import { Hono } from "hono";
import { Keypair } from "@stellar/stellar-base";
import { encodePaymentSignatureHeader } from "@x402/core/http";
import type { FacilitatorClient } from "@x402/core/server";
import type { PaymentPayload } from "@x402/core/types";
import { pactHono } from "../src/hono.ts";
import { clearTerminalPacts } from "../src/express.ts";
import { parseDeliveryHeader, DELIVERY_HEADER } from "../src/delivery.ts";
import type { PactRouteOptions, SellerConfig } from "../src/pact.ts";

const USDC = "CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA";
const seller = Keypair.random().publicKey();
const buyer = Keypair.random().publicKey();

const config: SellerConfig = {
  sellerAddress: seller,
  deliverySecret: "01".repeat(32),
  verifierPublicKey: "11".repeat(32),
  verifierUrl: "https://verifier.example",
  usdcSac: USDC,
  facilitatorUrl: "https://facilitator.example",
};

const routeOptions: PactRouteOptions<unknown> = {
  mode: "exact-refund",
  price: "0.25",
  asset: "USDC",
  condition: () => ({ kind: "document.translation", lang: "pt", minPages: 1 }),
  refundWindowLedgers: 100,
};

function facilitator(valid = true) {
  return {
    verify: vi.fn(async () => (valid ? { isValid: true, payer: buyer } : { isValid: false, invalidReason: "bad" })),
    settle: vi.fn(async () => ({ success: true, transaction: "ab".repeat(32), network: "stellar:testnet", payer: buyer })),
    getSupported: vi.fn(),
  };
}

function app(fac: ReturnType<typeof facilitator>) {
  const a = new Hono();
  a.use("/api/data", pactHono(routeOptions, config, fac as unknown as FacilitatorClient));
  a.get("/api/data", (c) => c.json({ ok: true }));
  return a;
}

const payment = encodePaymentSignatureHeader({
  x402Version: 2,
  accepted: { scheme: "exact", network: "stellar:testnet", asset: USDC, amount: "2500000", payTo: seller, maxTimeoutSeconds: 60, extra: {} },
  payload: { transaction: "AAAA" },
} as PaymentPayload);

describe("pactHono (P7-07, FR-I3)", () => {
  it("returns 402 with PaymentRequired when no payment header is provided", async () => {
    const fac = facilitator();
    const res = await app(fac).request("/api/data", { headers: { "X-Pactwright-Nonce": "1" } });
    expect(res.status).toBe(402);
    expect(res.headers.get("payment-required")).toBeTruthy();
    expect(fac.verify).not.toHaveBeenCalled();
  });

  it("serves only after the facilitator verified and settled, and signs the delivery", async () => {
    clearTerminalPacts();
    const fac = facilitator();
    const res = await app(fac).request("/api/data", { headers: { "PAYMENT-SIGNATURE": payment, "X-Pactwright-Nonce": "1" } });
    expect(res.status).toBe(200);
    expect(fac.settle).toHaveBeenCalledOnce();
    expect(parseDeliveryHeader(res.headers.get(DELIVERY_HEADER)!)).not.toBeNull();
    expect(res.headers.get("payment-response")).toBeTruthy();
  });

  it("refuses an invalid payment and a pact that was already served", async () => {
    clearTerminalPacts();
    expect((await app(facilitator(false)).request("/api/data", { headers: { "PAYMENT-SIGNATURE": payment, "X-Pactwright-Nonce": "2" } })).status).toBe(402);
    const fac = facilitator();
    const a = app(fac);
    const headers = { "PAYMENT-SIGNATURE": payment, "X-Pactwright-Nonce": "3" };
    expect((await a.request("/api/data", { headers })).status).toBe(200);
    expect((await a.request("/api/data", { headers })).status).toBe(409);
    expect(fac.settle).toHaveBeenCalledOnce();
  });
});
