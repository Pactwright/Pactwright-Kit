import { describe, it, expect, vi, beforeEach } from "vitest";
import { Keypair } from "@pactwright/core";
import type { Request, Response } from "express";
import {
  pact,
  buildPaymentRequired,
  signDelivery,
  parseDeliveryHeader,
  runStartupChecks,
  handleAutoSettle,
  handleM0Refund,
  calculateRefundAmount,
  clearRefundedRefs,
  clearTerminalPacts,
  markPactTerminal,
  DELIVERY_HEADER,
  type PactRouteOptions,
  type SellerConfig,
  type RefundCall,
} from "../src/index.ts";

const SELLER_SEED = "05".repeat(32);
const SELLER_KP = Keypair.fromRawEd25519Seed(Buffer.from(SELLER_SEED, "hex"));
const SELLER_ADDR = SELLER_KP.publicKey();
const DELIVERY_PUBKEY = SELLER_KP.rawPublicKey().toString("hex");

const VALID_CONTRACT = "CABQGAYDAMBQGAYDAMBQGAYDAMBQGAYDAMBQGAYDAMBQGAYDAMBQGTV3";

const mockConfig: SellerConfig = {
  network: "stellar:testnet",
  sellerAddress: SELLER_ADDR,
  deliverySecret: SELLER_SEED,
  deliveryPublicKey: DELIVERY_PUBKEY,
  verifierPublicKey: "1".repeat(64),
  verifierUrl: "https://verifier.pactwright.dev",
  pactContractId: VALID_CONTRACT,
  refundVaultId: VALID_CONTRACT,
};

const routeOptionsExact: PactRouteOptions<Request> = {
  mode: "exact-refund",
  price: "0.25",
  asset: "USDC",
  condition: (_req) => ({ kind: "document.translation", lang: "pt", minPages: 1 }),
  verify: { minAmount: "0.10" },
  refundWindowLedgers: 17280,
};

const routeOptionsEscrow: PactRouteOptions<Request> = {
  mode: "escrow",
  price: "1.00",
  asset: "USDC",
  condition: (_req) => ({ kind: "document.translation", lang: "en" }),
  silence: "refund",
  deadlines: { verdictLedgers: 120, settleLedgers: 720 },
  refundWindowLedgers: 17280,
};

describe("Seller: 402 Payment Required Builder", () => {
  it("builds compliant 402 for exact-refund mode (M0)", () => {
    const fakeReq = {} as Request;
    const pr = buildPaymentRequired(routeOptionsExact, fakeReq, mockConfig);
    expect(pr.x402Version).toBe(2);
    expect(pr.accepts).toHaveLength(1);
    const accept = pr.accepts[0]!;
    expect(accept.scheme).toBe("exact");
    expect(accept.amount).toBe("0.25");
    expect(accept.payTo).toBe(SELLER_ADDR);
    expect(accept.extra.pactwright.mode).toBe("exact-refund");
    expect(accept.extra.pactwright.deliveryKey).toBe(DELIVERY_PUBKEY);
    expect(accept.extra.pactwright.refundVault).toBe(mockConfig.refundVaultId);
  });

  it("builds compliant 402 for escrow mode (M2)", () => {
    const fakeReq = {} as Request;
    const pr = buildPaymentRequired(routeOptionsEscrow, fakeReq, mockConfig);
    expect(pr.x402Version).toBe(2);
    expect(pr.accepts).toHaveLength(1);
    const accept = pr.accepts[0]!;
    expect(accept.scheme).toBe("pact");
    expect(accept.amount).toBe("1.00");
    expect(accept.extra.pactwright.mode).toBe("escrow");
    expect(accept.extra.pactwright.silence).toBe("refund");
    expect(accept.extra.pactwright.pactContract).toBe(mockConfig.pactContractId);
    expect(accept.extra.pactwright.deadlines).toEqual({ verdictLedgers: 120, settleLedgers: 720 });
  });
});

describe("Seller: Delivery Receipt Signing", () => {
  it("matches delivery_receipt.json vector byte-for-byte", () => {
    const pactId = "0101010101010101010101010101010101010101010101010101010101010101";
    const bodyUtf8 = '{"translated":"ola mundo"}';
    const signerSeed = "05".repeat(32);
    const expectedSigHex =
      "abc0c72a5e6af031e57c3828cae56eaf657930472fec9dfe8215591a82bd10679f585de3a6f99909a87d021a6eb01e27faf2971a2948574e6d1d73c9947df907";
    const expectedBodySha256 = "cc4fa00fc26978ebd5053f023a926665d39f7482ca72e7ea4f44ec797ad633ca";

    const header = signDelivery(pactId, Buffer.from(bodyUtf8, "utf8"), signerSeed);
    const parsed = parseDeliveryHeader(header);
    expect(parsed).not.toBeNull();
    expect(parsed!.bodySha256).toBe(expectedBodySha256);
    expect(Buffer.from(parsed!.signature, "base64").toString("hex")).toBe(expectedSigHex);
  });
});

describe("Seller: Express Middleware", () => {
  beforeEach(() => {
    clearTerminalPacts();
  });

  it("returns 402 with buildPaymentRequired when payment header is missing", () => {
    const middleware = pact(routeOptionsExact, mockConfig);
    const req = { headers: {} } as Request;
    let statusCode = 200;
    let jsonBody: unknown;
    const res = {
      status(code: number) {
        statusCode = code;
        return this;
      },
      json(body: unknown) {
        jsonBody = body;
        return this;
      },
    } as unknown as Response;
    const next = vi.fn();

    middleware(req, res, next);
    expect(statusCode).toBe(402);
    expect(jsonBody).toHaveProperty("x402Version", 2);
    expect(next).not.toHaveBeenCalled();
  });

  it("serves request and sets X-Pactwright-Delivery on 200", () => {
    const middleware = pact(routeOptionsExact, mockConfig);
    const req = {
      headers: {
        "x-payment": Buffer.from(JSON.stringify({ success: true, pact_id: "01".repeat(32) })).toString("base64"),
      },
    } as unknown as Request;

    const headers: Record<string, string> = {};
    const res = {
      statusCode: 200,
      setHeader(name: string, value: string) {
        headers[name] = value;
      },
      write: vi.fn(),
      end: vi.fn(),
    } as unknown as Response;

    const next = vi.fn(() => {
      res.statusCode = 200;
      res.write("hello delivered");
      res.end();
    });

    middleware(req, res, next);
    expect(next).toHaveBeenCalledOnce();
    expect(headers).toHaveProperty(DELIVERY_HEADER);
    expect(headers[DELIVERY_HEADER]).toContain("sha256=");
    expect(headers[DELIVERY_HEADER]).toContain("sig=");
  });

  it("refuses to serve a terminal pact with 409", () => {
    const terminalPactId = "02".repeat(32);
    markPactTerminal(terminalPactId);

    const middleware = pact(routeOptionsExact, mockConfig);
    const req = {
      headers: {
        "x-payment": "valid",
        "x-pactwright-pact": terminalPactId,
      },
    } as unknown as Request;

    let statusCode = 200;
    let jsonBody: unknown;
    const res = {
      status(code: number) {
        statusCode = code;
        return this;
      },
      json(body: unknown) {
        jsonBody = body;
        return this;
      },
    } as unknown as Response;
    const next = vi.fn();

    middleware(req, res, next);
    expect(statusCode).toBe(409);
    expect(jsonBody).toEqual(expect.objectContaining({ error: expect.stringContaining("terminal") }));
    expect(next).not.toHaveBeenCalled();
  });
});

describe("Seller: Startup Checks", () => {
  const completeEnv: NodeJS.ProcessEnv = {
    STELLAR_NETWORK: "testnet",
    STELLAR_NETWORK_PASSPHRASE: "Test SDF Network ; September 2015",
    STELLAR_RPC_URL: "https://soroban-testnet.stellar.org",
    USDC_SAC_ID: VALID_CONTRACT,
    RECEIPT_ANCHOR_ID: VALID_CONTRACT,
    FACILITATOR_URL: "https://facilitator.pactwright.dev",
    SELLER_DELIVERY_KEY: "05".repeat(32),
    SELLER_ADDRESS: SELLER_ADDR,
  };

  it("fails if SELLER_DELIVERY_KEY is missing", async () => {
    const env = { ...completeEnv, SELLER_DELIVERY_KEY: "" };
    await expect(runStartupChecks({ env })).rejects.toThrow("SELLER_DELIVERY_KEY is missing or invalid");
  });

  it("fails if SELLER_ADDRESS is missing", async () => {
    const env = { ...completeEnv, SELLER_ADDRESS: "" };
    await expect(runStartupChecks({ env })).rejects.toThrow("SELLER_ADDRESS (or SELLER_SIGNING_KEY_REF) is not set");
  });

  it("fails if network config is incomplete", async () => {
    const env = { ...completeEnv, STELLAR_NETWORK_PASSPHRASE: "" };
    await expect(runStartupChecks({ env })).rejects.toThrow("invalid network configuration");
  });

  it("passes when account has a USDC trustline", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () =>
      new Response(
        JSON.stringify({
          balances: [{ asset_type: "credit_alphanum4", asset_code: "USDC" }],
        }),
        { status: 200 },
      ),
    );

    await expect(runStartupChecks({ env: completeEnv, fetchImpl })).resolves.toBeUndefined();
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it("fails when account lacks a USDC trustline", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () =>
      new Response(
        JSON.stringify({
          balances: [{ asset_type: "native" }],
        }),
        { status: 200 },
      ),
    );

    await expect(runStartupChecks({ env: completeEnv, fetchImpl })).rejects.toThrow(
      "does not have a USDC trustline",
    );
  });
});

describe("Seller Hooks: Settle and Refund", () => {
  beforeEach(() => {
    clearRefundedRefs();
  });

  it("auto-settles on ALLOW verdict via /pact/submit", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () =>
      new Response(JSON.stringify({ success: true, txHash: "settle_tx_123" }), { status: 200 }),
    );

    const result = await handleAutoSettle(
      {
        pactId: "01".repeat(32),
        verdict: "allow",
        allowedAmount: "1.00",
      },
      { fetchImpl, facilitatorUrl: "https://facilitator.example" },
    );

    expect(result.settled).toBe(true);
    expect(result.txHash).toBe("settle_tx_123");
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it("does not settle on DENY verdict", async () => {
    const fetchImpl = vi.fn<typeof fetch>();
    const result = await handleAutoSettle(
      {
        pactId: "01".repeat(32),
        verdict: "deny",
      },
      { fetchImpl, facilitatorUrl: "https://facilitator.example" },
    );
    expect(result.settled).toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("calculates refund amount accurately", () => {
    expect(calculateRefundAmount("1.00")).toBe("1");
    expect(calculateRefundAmount("1.00", "0.25")).toBe("0.75");
    expect(calculateRefundAmount("1.00", "1.00")).toBe("0");
    expect(calculateRefundAmount("0.25", "0.30")).toBe("0");
  });

  const vault = "CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA";
  const calls: RefundCall[] = [];
  const submit = async (call: RefundCall) => {
    calls.push(call);
    return { txHash: "ab".repeat(32), ledger: 1234 };
  };
  const refundOptions = { refundVaultId: vault, submit };

  it("does not report a refund when no vault or chain is configured", async () => {
    const result = await handleM0Refund({
      pactId: "04".repeat(32),
      buyer: "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5",
      price: "1.00",
      verdict: "deny",
      paidAtLedger: 10,
    });
    expect(result.refunded).toBe(false);
    expect(result.txHash).toBeUndefined();
    expect(result.error).toMatch(/^not_submitted/);
  });

  it("executes M0 refund on DENY through RefundVault", async () => {
    const result = await handleM0Refund({
      pactId: "01".repeat(32),
      buyer: "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5",
      price: "1.00",
      verdict: "deny",
      paidAtLedger: 10,
    }, refundOptions);

    expect(result.refunded).toBe(true);
    expect(result.refundAmount).toBe("1");
    expect(result.paymentRef).toBe("01".repeat(32));
    expect(result.txHash).toBe("ab".repeat(32));
    expect(calls.at(-1)).toEqual({
      refundVaultId: vault,
      paymentRef: "01".repeat(32),
      recipient: "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5",
      amountStroops: 10_000_000n,
      paidAtLedger: 10,
    });
  });

  it("executes M0 partial refund on partial delivery", async () => {
    const result = await handleM0Refund({
      pactId: "02".repeat(32),
      buyer: "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5",
      price: "1.00",
      verdict: "allow",
      allowedAmount: "0.40",
      paidAtLedger: 10,
    }, refundOptions);

    expect(result.refunded).toBe(true);
    expect(result.refundAmount).toBe("0.6");
  });

  it("rejects duplicate refund for the same pact_id (AlreadyRefunded)", async () => {
    const notification = {
      pactId: "03".repeat(32),
      buyer: "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5",
      price: "1.00",
      verdict: "deny" as const,
      paidAtLedger: 10,
    };

    const first = await handleM0Refund(notification, refundOptions);
    expect(first.refunded).toBe(true);

    const second = await handleM0Refund(notification, refundOptions);
    expect(second.refunded).toBe(false);
    expect(second.error).toBe("AlreadyRefunded");
  });
});
