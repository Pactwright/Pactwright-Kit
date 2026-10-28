import { z } from "zod";
import { notImplemented } from "@pactwright/core";
import type { ToolDefinition } from "../tool.ts";

const input = z.object({ resourceUrl: z.string().url(), condition: z.record(z.string(), z.unknown()), idempotencyKey: z.string() });

export const buyTool: ToolDefinition<typeof input> = {
  name: "pactwright_buy",
  description: "Buy from a seller under a frozen condition; returns the response and pact ID.",
  input,
  handler: async () => notImplemented("K-11"),
};
