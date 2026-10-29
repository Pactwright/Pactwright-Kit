import { describe, expect, it, vi } from "vitest";
import { runAgentBuyer } from "../src/index.ts";
import { Keypair } from "@pactwright/core";
import { encodePaymentRequiredHeader } from "@x402/core/http";

describe("examples/agent-node", () => {
  it("initializes and executes buyer flow against seller endpoint", async () => {
    const agentKey = Keypair.random();
    const mockDelivery = "sha256=" + "0d".repeat(32) + "; sig=dGVzdF9zaWduYXR1cmU=";

    const required = {
      x402Version: 2,
      resource: { url: "http://localhost:4000/translate?to=es", description: "", mimeType: "" },
      accepts: [
        {
          scheme: "exact",
          network: "stellar:testnet",
          asset: "CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA",
          amount: "2500000",
          payTo: "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5",
          maxTimeoutSeconds: 60,
          extra: { areFeesSponsored: true, pactwright: { condition: { kind: "document.translation", lang: "es", minPages: 1 } } },
        },
      ],
    };
    const mockFetch = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (!(init?.headers as Record<string, string>)["PAYMENT-SIGNATURE"]) {
        return new Response(JSON.stringify(required), {
          status: 402,
          headers: { "PAYMENT-REQUIRED": encodePaymentRequiredHeader(required as never) },
        });
      }
      return new Response(
        JSON.stringify({
          text: "Hello",
          targetLang: "es",
          translated: "Hola mundo",
        }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            "X-Pactwright-Delivery": mockDelivery,
          },
        },
      );
    }) as unknown as typeof fetch;

    // Stand-in for the built-in x402 payment, which signs a real transfer (see e2e/testnet).
    const payment = { pay: async () => ({ headers: { "PAYMENT-SIGNATURE": "signed-payment" } }) };
    const pact = await runAgentBuyer({
      agentKey,
      payment,
      sellerUrl: "http://localhost:4000/translate?to=es",
      targetLang: "es",
      fetchImpl: mockFetch,
    });

    expect(pact.terms.pactId).toBeDefined();
    expect(pact.deliveryReceipt).toBe(mockDelivery);
    const bodyJson = JSON.parse(new TextDecoder().decode(pact.body));
    expect(bodyJson).toEqual({
      text: "Hello",
      targetLang: "es",
      translated: "Hola mundo",
    });
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });
});
