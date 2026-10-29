import { z } from "zod";
import type { ToolDefinition } from "../tool.ts";

const input = z.object({
  pactId: z.string(),
  reason: z.string(),
});

export const disputeTool: ToolDefinition<typeof input> = {
  name: "pactwright_dispute",
  description: "Request re-verification within the refund window.",
  input,
  inputSchema: {
    type: "object",
    properties: {
      pactId: { type: "string", description: "Pact ID hex" },
      reason: { type: "string", description: "Reason for the dispute" },
    },
    required: ["pactId", "reason"],
  },
  handler: async (args) => {
    return {
      pactId: args.pactId,
      disputeStatus: "submitted",
      reason: args.reason,
      submittedAt: new Date().toISOString(),
    };
  },
};
