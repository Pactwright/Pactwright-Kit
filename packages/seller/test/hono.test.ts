import { describe, it, expect } from "vitest";
import { Hono } from "hono";
import { Keypair } from "@stellar/stellar-base";
import { pactHono } from "../src/hono.ts";
import { parseDeliveryHeader, DELIVERY_HEADER } from "../src/delivery.ts";
import type { PactRouteOptions } from "../src/pact.ts";

describe("pactHono (P7-07, FR-I3)", () => {
  const sellerKey = Keypair.random();
  const deliverySecret = "01".repeat(32);
  const contractId = "CA2VU3DR3H2X47AFTW2O6J5J3EWB3G7M4RNDWJ4S5QY27ZITX72MFEV6";

  const config = {
    deliverySecret,
    merchantAddress: sellerKey.publicKey(),
    pactContractId: contractId,
    refundVaultId: contractId,
  };

  const routeOptions: PactRouteOptions<unknown> = {
    mode: "exact-refund",
    price: "0.25",
    asset: "USDC",
    condition: () => ({ kind: "document.translation", lang: "pt", minPages: 1 }),
    refundWindowLedgers: 100,
  };

  it("returns 402 with PaymentRequired when no payment header is provided", async () => {
    const app = new Hono();
    app.use("/api/data", pactHono(routeOptions, config));
    app.get("/api/data", (c) => c.text("secret content"));

    const res = await app.request("/api/data");
    expect(res.status).toBe(402);

    const body = (await res.json()) as { error?: string; accepts?: unknown[] };
    expect(body.accepts).toBeDefined();
    expect(Array.isArray(body.accepts)).toBe(true);
  });

  it("serves request and attaches signed X-Pactwright-Delivery on payment", async () => {
    const app = new Hono();
    app.use("/api/data", pactHono(routeOptions, config));
    app.get("/api/data", (c) => c.text("delivered payload"));

    const pactId = "88".repeat(32);
    const paymentPayload = Buffer.from(JSON.stringify({ pact_id: pactId })).toString("base64");

    const res = await app.request("/api/data", {
      headers: {
        "x-payment": paymentPayload,
      },
    });

    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toBe("delivered payload");

    const deliveryHeader = res.headers.get(DELIVERY_HEADER);
    expect(deliveryHeader).toBeDefined();

    const parsed = parseDeliveryHeader(deliveryHeader!);
    expect(parsed).not.toBeNull();
    expect(parsed?.bodySha256).toBeDefined();
  });

  it("refuses terminal pacts with 409 Conflict", async () => {
    const app = new Hono();
    app.use("/api/data", pactHono(routeOptions, config));
    app.get("/api/data", (c) => c.text("delivered payload"));

    const pactId = "99".repeat(32);
    const paymentPayload = Buffer.from(JSON.stringify({ pact_id: pactId })).toString("base64");

    // First request delivers and marks terminal
    const res1 = await app.request("/api/data", { headers: { "x-payment": paymentPayload } });
    expect(res1.status).toBe(200);

    // Second request with same pact ID must be refused with 409
    const res2 = await app.request("/api/data", { headers: { "x-payment": paymentPayload } });
    expect(res2.status).toBe(409);
  });
});
