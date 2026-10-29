import { describe, expect, it, vi } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { Pactwright } from "@pactwright/agent";
import { createServer } from "../src/index.ts";

describe("Pactwright MCP Server", () => {
  const mockAgent: Pactwright = {
    find: vi.fn(async () => [
      {
        resourceUrl: "https://seller.test/translate",
        seller: "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5",
        mode: "exact-refund" as const,
        price: "1.00",
        verifier: "02".repeat(32),
        refundWindowLedgers: 17280,
        score: 1.0,
      },
    ]),
    buy: vi.fn(async () => ({
      terms: {
        pactId: "01".repeat(32),
        mode: "exact-refund" as const,
        buyer: "GA7QYNF7SOWQ3GLR2BGMZEHXAVIRZA4KVWLTJJFC7MGXUA74P7UJVTOO",
        seller: "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5",
        resourceUrl: "https://seller.test/translate",
        cap: "1.00",
        nonce: "1",
        conditionHash: "02".repeat(32),
        condition: {},
        verifier: "03".repeat(32),
        metered: false,
        refundWindowLedgers: 17280,
      },
      body: new Uint8Array(new TextEncoder().encode("Translation completed")),
      deliveryReceipt: "sha256=abcdef; sig=123456",
      paymentTx: "tx_mock_123",
    })),
    await: vi.fn(async () => "settled" as const),
    certificate: vi.fn(async () => ({
      pactId: "01".repeat(32),
      transition: "settled" as const,
      toSeller: "1.00",
      toBuyer: "0",
      leaf: "0a".repeat(32),
      status: "pending" as const,
      receiptAnchor: "CABQGAYDAMBQGAYDAMBQGAYDAMBQGAYDAMBQGAYDAMBQGAYDAMBQGTV3",
      txs: [{ stage: "settled", hash: "tx_cert" }],
    })),
  };

  async function createConnectedClient(agent?: Pactwright) {
    const server = createServer({ agent });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

    const client = new Client(
      { name: "test-client", version: "1.0.0" },
      { capabilities: {} },
    );

    await Promise.all([
      server.connect(serverTransport),
      client.connect(clientTransport),
    ]);

    return { client, server };
  }

  function getTextContent(res: unknown): { type: string; text: string } {
    const r = res as { content: Array<{ type: string; text: string }> };
    return r.content[0]!;
  }

  it("lists all five pactwright buyer tools", async () => {
    const { client } = await createConnectedClient(mockAgent);
    const result = await client.listTools();

    expect(result.tools).toHaveLength(5);
    const names = result.tools.map((t) => t.name);
    expect(names).toContain("pactwright_find_sellers");
    expect(names).toContain("pactwright_buy");
    expect(names).toContain("pactwright_get_pact");
    expect(names).toContain("pactwright_dispute");
    expect(names).toContain("pactwright_get_certificate");
  });

  it("calls pactwright_find_sellers tool", async () => {
    const { client } = await createConnectedClient(mockAgent);
    const res = await client.callTool({
      name: "pactwright_find_sellers",
      arguments: { query: "translate" },
    });

    expect(res.isError).toBeFalsy();
    const content = getTextContent(res);
    const sellers = JSON.parse(content.text);
    expect(sellers).toHaveLength(1);
    expect(sellers[0].resourceUrl).toBe("https://seller.test/translate");
  });

  it("calls pactwright_buy tool", async () => {
    const { client } = await createConnectedClient(mockAgent);
    const res = await client.callTool({
      name: "pactwright_buy",
      arguments: {
        resourceUrl: "https://seller.test/translate",
        condition: { kind: "document.translation" },
        idempotencyKey: "mcp_key_1",
      },
    });

    expect(res.isError).toBeFalsy();
    const content = getTextContent(res);
    const parsed = JSON.parse(content.text);
    expect(parsed.pactId).toBe("01".repeat(32));
    expect(parsed.body).toBe("Translation completed");
  });

  it("calls pactwright_get_pact tool", async () => {
    const { client } = await createConnectedClient(mockAgent);
    const res = await client.callTool({
      name: "pactwright_get_pact",
      arguments: { pactId: "01".repeat(32) },
    });

    expect(res.isError).toBeFalsy();
    const content = getTextContent(res);
    const parsed = JSON.parse(content.text);
    expect(parsed.pactId).toBe("01".repeat(32));
    expect(parsed.state).toBe("settled");
    expect(parsed.timeline).toBeDefined();
  });

  it("calls pactwright_dispute tool", async () => {
    const { client } = await createConnectedClient(mockAgent);
    const res = await client.callTool({
      name: "pactwright_dispute",
      arguments: { pactId: "01".repeat(32), reason: "Output was unreadable" },
    });

    expect(res.isError).toBeFalsy();
    const content = getTextContent(res);
    const parsed = JSON.parse(content.text);
    expect(parsed.pactId).toBe("01".repeat(32));
    expect(parsed.disputeStatus).toBe("submitted");
  });

  it("calls pactwright_get_certificate tool", async () => {
    const { client } = await createConnectedClient(mockAgent);
    const res = await client.callTool({
      name: "pactwright_get_certificate",
      arguments: { pactId: "01".repeat(32) },
    });

    expect(res.isError).toBeFalsy();
    const content = getTextContent(res);
    const parsed = JSON.parse(content.text);
    expect(parsed.pactId).toBe("01".repeat(32));
    expect(parsed.transition).toBe("settled");
  });

  it("returns structured error message when tool fails, not a stack trace", async () => {
    const failingAgent: Pactwright = {
      ...mockAgent,
      find: vi.fn(async () => {
        throw new Error("Custom network connection timeout");
      }),
    };

    const { client } = await createConnectedClient(failingAgent);
    const res = await client.callTool({
      name: "pactwright_find_sellers",
      arguments: { query: "failing_query" },
    });

    expect(res.isError).toBe(true);
    const content = getTextContent(res);
    expect(content.type).toBe("text");
    const parsed = JSON.parse(content.text);
    expect(parsed.error).toBe("Custom network connection timeout");
    expect(content.text).not.toContain("at Module._compile");
  });

  it("returns structured error when calling unknown tool", async () => {
    const { client } = await createConnectedClient(mockAgent);
    const res = await client.callTool({
      name: "non_existent_tool",
      arguments: {},
    });

    expect(res.isError).toBe(true);
    const content = getTextContent(res);
    const parsed = JSON.parse(content.text);
    expect(parsed.error).toContain("Tool not found");
  });
});
