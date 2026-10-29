import { describe, expect, it, vi } from "vitest";
import { runAgentBuyer } from "../src/index.ts";
import { Keypair } from "@pactwright/core";

describe("examples/agent-node", () => {
  it("initializes and executes buyer flow against seller endpoint", async () => {
    const agentKey = Keypair.random();
    const mockDelivery = "sha256=" + "0d".repeat(32) + "; sig=dGVzdF9zaWduYXR1cmU=";

    const mockFetch = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => {
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

    const pact = await runAgentBuyer({
      agentKey,
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
    expect(mockFetch).toHaveBeenCalled();
  });
});
