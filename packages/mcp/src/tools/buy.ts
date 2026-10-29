import { z } from "zod";
import type { RankedListing } from "@pactwright/adapters";
import type { ToolDefinition } from "../tool.ts";

const input = z.object({
  resourceUrl: z.string().url(),
  condition: z.record(z.string(), z.unknown()),
  idempotencyKey: z.string(),
  price: z.string().optional(),
  seller: z.string().optional(),
  mode: z.enum(["exact-refund", "escrow"]).optional(),
});

export const buyTool: ToolDefinition<typeof input> = {
  name: "pactwright_buy",
  description: "Buy from a seller under a frozen condition; returns the response and pact ID.",
  input,
  inputSchema: {
    type: "object",
    properties: {
      resourceUrl: { type: "string", description: "The seller URL to invoke" },
      condition: { type: "object", description: "Frozen contract condition" },
      idempotencyKey: { type: "string", description: "Idempotency key for request" },
      price: { type: "string", description: "Price in USDC" },
      seller: { type: "string", description: "Seller Stellar address" },
      mode: { type: "string", enum: ["exact-refund", "escrow"] },
    },
    required: ["resourceUrl", "condition", "idempotencyKey"],
  },
  handler: async (args, context) => {
    if (!context?.agent) {
      throw new Error("Pactwright agent runtime is not initialized");
    }
    const listing: RankedListing = {
      resourceUrl: args.resourceUrl,
      seller: args.seller ?? "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5",
      price: args.price ?? "1.00",
      mode: args.mode ?? "exact-refund",
      verifier: "02".repeat(32),
      refundWindowLedgers: 17280,
      score: 1.0,
    };
    const pact = await context.agent.buy(listing, {
      condition: args.condition,
      idempotencyKey: args.idempotencyKey,
    });
    return {
      pactId: pact.terms.pactId,
      terms: pact.terms,
      deliveryReceipt: pact.deliveryReceipt,
      paymentTx: pact.paymentTx,
      body: Buffer.from(pact.body).toString("utf8"),
    };
  },
};
