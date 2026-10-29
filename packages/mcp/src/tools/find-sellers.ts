import { z } from "zod";
import type { ToolDefinition } from "../tool.ts";

const input = z.object({ query: z.string(), maxPrice: z.string().optional() });

export const findSellersTool: ToolDefinition<typeof input> = {
  name: "pactwright_find_sellers",
  description: "Search protected sellers and rank them.",
  input,
  inputSchema: {
    type: "object",
    properties: {
      query: { type: "string", description: "Search query for seller service" },
      maxPrice: { type: "string", description: "Maximum price filter in USDC" },
    },
    required: ["query"],
  },
  handler: async (args, context) => {
    if (!context?.agent) {
      throw new Error("Pactwright agent runtime is not initialized");
    }
    const results = await context.agent.find({
      query: args.query,
      maxPrice: args.maxPrice,
    });
    return results;
  },
};
