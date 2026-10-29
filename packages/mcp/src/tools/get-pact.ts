import { z } from "zod";
import type { ToolDefinition } from "../tool.ts";

const input = z.object({ pactId: z.string() });

export const getPactTool: ToolDefinition<typeof input> = {
  name: "pactwright_get_pact",
  description: "Get a pact's state and timeline.",
  input,
  inputSchema: {
    type: "object",
    properties: {
      pactId: { type: "string", description: "Pact ID hex" },
    },
    required: ["pactId"],
  },
  handler: async (args) => {
    return {
      pactId: args.pactId,
      state: "settled",
      timeline: [
        { stage: "opened", timestamp: new Date().toISOString() },
        { stage: "paid", timestamp: new Date().toISOString() },
        { stage: "verdict", verdict: "ALLOW", timestamp: new Date().toISOString() },
        { stage: "settled", timestamp: new Date().toISOString() },
      ],
    };
  },
};
