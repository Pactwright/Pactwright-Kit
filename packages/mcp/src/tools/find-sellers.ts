import { z } from "zod";
import { notImplemented } from "@pactwright/core";
import type { ToolDefinition } from "../tool.ts";

const input = z.object({ query: z.string(), maxPrice: z.string().optional() });

export const findSellersTool: ToolDefinition<typeof input> = {
  name: "pactwright_find_sellers",
  description: "Search protected sellers and rank them.",
  input,
  handler: async () => notImplemented("K-11"),
};
