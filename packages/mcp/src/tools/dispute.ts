import { z } from "zod";
import { notImplemented } from "@pactwright/core";
import type { ToolDefinition } from "../tool.ts";

const input = z.object({ pactId: z.string(), reason: z.string() });

export const disputeTool: ToolDefinition<typeof input> = {
  name: "pactwright_dispute",
  description: "Request re-verification within the refund window.",
  input,
  handler: async () => notImplemented("K-11"),
};
