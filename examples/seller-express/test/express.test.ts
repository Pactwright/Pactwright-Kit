import { describe, expect, it, vi } from "vitest";
import { createApp } from "../src/index.ts";
import { Keypair } from "@pactwright/core";
import { DELIVERY_HEADER } from "@pactwright/seller";
import { encodePaymentSignatureHeader } from "@x402/core/http";
import type { FacilitatorClient } from "@x402/core/server";
import type { PaymentPayload } from "@x402/core/types";

const USDC = "CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA";
const sellerAddress = Keypair.random().publicKey();
const buyer = Keypair.random().publicKey();
// A stub facilitator: approves and settles. Against a real one, see e2e/testnet.
const facilitator = {
  verify: vi.fn(async () => ({ isValid: true, payer: buyer })),
  settle: vi.fn(async () => ({ success: true, transaction: "0b".repeat(32), network: "stellar:testnet", payer: buyer })),
  getSupported: vi.fn(),
} as unknown as FacilitatorClient;
const app = createApp(
  {
    sellerAddress,
    deliverySecret: "05".repeat(32),
    verifierPublicKey: "11".repeat(32),
    verifierUrl: "https://verifier.example",
    usdcSac: USDC,
    facilitatorUrl: "https://facilitator.example",
  },
  facilitator,
);

// Helper to make mock requests to Express app via supertest-like fetch or custom listener
import http from "node:http";

interface MockResponse<T = Record<string, unknown>> {
  status: number;
  headers: http.IncomingHttpHeaders;
  body: T;
}

function requestApp<T = Record<string, unknown>>(
  method: string,
  path: string,
  headers: Record<string, string> = {},
): Promise<MockResponse<T>> {
  return new Promise((resolve, reject) => {
    const server = http.createServer(app);
    server.listen(0, () => {
      const addr = server.address();
      if (!addr || typeof addr === "string") {
        server.close();
        return reject(new Error("Unable to get server address"));
      }
      const port = addr.port;
      const req = http.request(
        `http://localhost:${port}${path}`,
        { method, headers },
        (res) => {
          let data = "";
          res.on("data", (chunk) => (data += chunk));
          res.on("end", () => {
            server.close();
            let parsed = data;
            try {
              parsed = JSON.parse(data);
            } catch {
              // ignore
            }
            resolve({
              status: res.statusCode || 0,
              headers: res.headers,
              body: parsed,
            });
          });
        },
      );
      req.on("error", (err) => {
        server.close();
        reject(err);
      });
      req.end();
    });
  });
}

describe("examples/seller-express", () => {
  it("serves GET /health with seller identity", async () => {
    const res = await requestApp("GET", "/health");
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.seller).toBeDefined();
  });

  it("returns 402 with pactwright extra on unprotected request to /translate", async () => {
    const res = await requestApp("GET", "/translate?to=es&text=Hello");
    expect(res.status).toBe(402);
    expect(res.body.x402Version).toBe(2);
    expect(res.body.accepts[0].scheme).toBe("exact");
    expect(res.body.accepts[0].extra.pactwright.condition.kind).toBe("document.translation");
    expect(res.body.accepts[0].extra.pactwright.condition.lang).toBe("es");
  });

  it("serves 200 with X-Pactwright-Delivery after the facilitator settles the payment", async () => {
    const payment = encodePaymentSignatureHeader({
      x402Version: 2,
      accepted: { scheme: "exact", network: "stellar:testnet", asset: USDC, amount: "2500000", payTo: sellerAddress, maxTimeoutSeconds: 60, extra: {} },
      payload: { transaction: "AAAA" },
    } as PaymentPayload);

    const res = await requestApp("GET", "/translate?to=es&text=Hello", {
      "payment-signature": payment,
      "x-pactwright-nonce": "42",
    });

    expect(res.status).toBe(200);
    expect(res.body.translated).toBe("Hola mundo");
    const delivery = res.headers[DELIVERY_HEADER.toLowerCase()] as string;
    expect(delivery).toMatch(/^sha256=[0-9a-f]{64};\s*sig=[A-Za-z0-9+/=]+$/);
    expect(res.headers["payment-response"]).toBeDefined();
  });

});
