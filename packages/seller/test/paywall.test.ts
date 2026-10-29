/**
 * The x402 paywall (ROADMAP K-06): a real Express server and a stub facilitator. Content is
 * served only after the facilitator verified and settled the payment against the route's own
 * terms, and the pact id comes from the payer the facilitator verified.
 */
import { describe, it, expect, vi, beforeEach, afterAll, beforeAll } from "vitest";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import express from "express";
import { conditionHash, Keypair, pactId } from "@pactwright/core";
import { decodePaymentRequiredHeader, decodePaymentResponseHeader, encodePaymentSignatureHeader } from "@x402/core/http";
import type { FacilitatorClient } from "@x402/core/server";
import type { PaymentPayload, PaymentRequirements } from "@x402/core/types";
import {
  pact,
  buildPaymentRequired,
  resolveSellerConfig,
  clearTerminalPacts,
  parseDeliveryHeader,
  DELIVERY_HEADER,
  SellerConfigError,
  type PactRouteOptions,
  type SellerConfig,
} from "../src/index.ts";

const USDC = "CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA";
const PACT = "CDUXJJUNYFILEYHE3LITANJEKCDFERNAABOSG75OWATFVM776BCMFEV6";
const DELIVERY_SEED = "05".repeat(32);
const seller = Keypair.random().publicKey();
const buyer = Keypair.random().publicKey();
const CONDITION = { kind: "document.translation", lang: "pt", minPages: 1 };

const config: SellerConfig = {
  network: "stellar:testnet",
  sellerAddress: seller,
  deliverySecret: DELIVERY_SEED,
  verifierPublicKey: "11".repeat(32),
  verifierUrl: "https://verifier.example",
  usdcSac: USDC,
  pactContractId: PACT,
  facilitatorUrl: "https://facilitator.example",
};

const exactRoute: PactRouteOptions<express.Request> = {
  mode: "exact-refund",
  price: "0.25",
  asset: "USDC",
  condition: () => CONDITION,
  refundWindowLedgers: 17280,
};
const escrowRoute: PactRouteOptions<express.Request> = { ...exactRoute, mode: "escrow", price: "1" };

/** Records what the paywall asked the facilitator, and answers as configured. */
function stubFacilitator(answers: { valid?: boolean; settled?: boolean; pactId?: string } = {}) {
  const calls: { verify: PaymentRequirements[]; settle: PaymentRequirements[] } = { verify: [], settle: [] };
  const facilitator = {
    verify: vi.fn(async (_p: PaymentPayload, r: PaymentRequirements) => {
      calls.verify.push(r);
      return answers.valid === false ? { isValid: false, invalidReason: "invalid_exact_stellar_payload_wrong_amount" } : { isValid: true, payer: buyer };
    }),
    settle: vi.fn(async (_p: PaymentPayload, r: PaymentRequirements) => {
      calls.settle.push(r);
      return answers.settled === false
        ? { success: false, errorReason: "settle_failed", transaction: "", network: r.network }
        : {
            success: true,
            transaction: "ab".repeat(32),
            network: r.network,
            payer: buyer,
            ...(answers.pactId ? { extensions: { pactwright: { pactId: answers.pactId } } } : {}),
          };
    }),
    getSupported: vi.fn(),
  };
  return { facilitator: facilitator as unknown as FacilitatorClient, calls, mocks: facilitator };
}

let server: Server;
let base: string;
let route = exactRoute;
let fac = stubFacilitator();
const served = vi.fn();

beforeAll(async () => {
  const app = express();
  app.get("/doc", (req, res, next) => pact(route, config, fac.facilitator)(req, res, next), (_req, res) => {
    served();
    res.json({ translated: "olá" });
  });
  server = app.listen(0);
  await new Promise((r) => server.once("listening", r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => server.close());
beforeEach(() => {
  clearTerminalPacts();
  served.mockClear();
  route = exactRoute;
  fac = stubFacilitator();
});

/** A payment header whose `accepted` claims a cheaper price: the paywall must ignore it. */
function paymentHeader(scheme = "exact"): string {
  const accepted = { scheme, network: "stellar:testnet", asset: USDC, amount: "1", payTo: seller, maxTimeoutSeconds: 60, extra: {} };
  return encodePaymentSignatureHeader({ x402Version: 2, accepted, payload: { transaction: "AAAA" } } as PaymentPayload);
}

describe("402 Payment Required", () => {
  it("is valid x402 v2: token contract, integer amount, CAIP-2 network, fee sponsorship", () => {
    const pr = buildPaymentRequired(exactRoute, {} as express.Request, resolveSellerConfig(config), "https://s/doc");
    const r = pr.accepts[0]!;
    expect(r).toMatchObject({ scheme: "exact", network: "stellar:testnet", asset: USDC, amount: "2500000", payTo: seller, maxTimeoutSeconds: 60 });
    expect(r.extra).toMatchObject({ areFeesSponsored: true, pactwright: { mode: "exact-refund", condition: CONDITION } });
  });

  it("offers the pact scheme with the contract for escrow routes", () => {
    const r = buildPaymentRequired(escrowRoute, {} as express.Request, resolveSellerConfig(config), "https://s/doc").accepts[0]!;
    expect(r).toMatchObject({ scheme: "pact", amount: "10000000", extra: { pactContract: PACT, pactwright: { silence: "refund" } } });
  });

  it("is returned, with the PAYMENT-REQUIRED header, when there is no payment", async () => {
    const res = await fetch(`${base}/doc`, { headers: { "X-Pactwright-Nonce": "7" } });
    expect(res.status).toBe(402);
    expect(decodePaymentRequiredHeader(res.headers.get("payment-required")!).accepts[0]!.amount).toBe("2500000");
    expect(fac.mocks.verify).not.toHaveBeenCalled();
    expect(served).not.toHaveBeenCalled();
  });
});

describe("paying", () => {
  const pay = (nonce = "7", scheme = "exact") =>
    fetch(`${base}/doc`, { headers: { "PAYMENT-SIGNATURE": paymentHeader(scheme), "X-Pactwright-Nonce": nonce } });

  it("serves only after verify and settle, against the route's own terms", async () => {
    const res = await pay();
    expect(res.status).toBe(200);
    expect(served).toHaveBeenCalledOnce();
    // The client claimed amount "1"; the facilitator was asked about the real price.
    expect(fac.calls.verify[0]!.amount).toBe("2500000");
    expect(fac.calls.settle[0]!.amount).toBe("2500000");
    expect(decodePaymentResponseHeader(res.headers.get("payment-response")!).transaction).toBe("ab".repeat(32));

    const expectedId = pactId(buyer, seller, 7n, conditionHash(CONDITION));
    expect(res.headers.get("x-pactwright-pact")).toBe(expectedId);
    const receipt = parseDeliveryHeader(res.headers.get(DELIVERY_HEADER.toLowerCase())!);
    const body = Buffer.from(await res.arrayBuffer());
    const kp = Keypair.fromRawEd25519Seed(Buffer.from(DELIVERY_SEED, "hex"));
    const { deliveryMessage } = await import("@pactwright/core");
    expect(kp.verify(Buffer.from(deliveryMessage(expectedId, receipt!.bodySha256)), Buffer.from(receipt!.signature, "base64"))).toBe(true);
    expect(receipt!.bodySha256).toBe((await import("node:crypto")).createHash("sha256").update(body).digest("hex"));
  });

  it("refuses an invalid payment without settling or serving", async () => {
    fac = stubFacilitator({ valid: false });
    const res = await pay();
    expect(res.status).toBe(402);
    expect(((await res.json()) as { error: string }).error).toBe("invalid_exact_stellar_payload_wrong_amount");
    expect(fac.mocks.settle).not.toHaveBeenCalled();
    expect(served).not.toHaveBeenCalled();
  });

  it("does not serve when settlement fails", async () => {
    fac = stubFacilitator({ settled: false });
    expect((await pay()).status).toBe(402);
    expect(served).not.toHaveBeenCalled();
  });

  it("needs the nonce to derive the pact id", async () => {
    const res = await fetch(`${base}/doc`, { headers: { "PAYMENT-SIGNATURE": paymentHeader() } });
    expect(res.status).toBe(402);
    expect(fac.mocks.verify).not.toHaveBeenCalled();
  });

  it("refuses to serve the same pact twice, before charging again", async () => {
    expect((await pay()).status).toBe(200);
    const again = await pay();
    expect(again.status).toBe(409);
    expect(fac.mocks.settle).toHaveBeenCalledOnce();
    expect(served).toHaveBeenCalledOnce();
  });

  it("escrow: refuses a settled pact whose on-chain id doesn't match the request", async () => {
    route = escrowRoute;
    fac = stubFacilitator({ pactId: "cd".repeat(32) });
    expect((await pay("7", "pact")).status).toBe(402);
    expect(served).not.toHaveBeenCalled();
  });

  it("escrow: serves when the contract's pact id matches", async () => {
    route = escrowRoute;
    fac = stubFacilitator({ pactId: pactId(buyer, seller, 9n, conditionHash(CONDITION)) });
    expect((await pay("9", "pact")).status).toBe(200);
  });
});

describe("configuration", () => {
  it("has no default payee, delivery key, verifier, token or facilitator", () => {
    const saved = { ...process.env };
    for (const k of ["SELLER_ADDRESS", "SELLER_DELIVERY_KEY", "VERIFIER_PUBLIC_KEY", "VERIFIER_URL", "USDC_SAC_ID", "FACILITATOR_URL"]) {
      delete process.env[k];
    }
    try {
      expect(() => resolveSellerConfig({})).toThrow(SellerConfigError);
    } finally {
      process.env = saved;
    }
  });
});
