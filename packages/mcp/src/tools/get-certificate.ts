import { z } from "zod";
import type { ToolDefinition } from "../tool.ts";

const input = z.object({ pactId: z.string() });

export const getCertificateTool: ToolDefinition<typeof input> = {
  name: "pactwright_get_certificate",
  description: "Get the certificate for a terminal pact.",
  input,
  inputSchema: {
    type: "object",
    properties: {
      pactId: { type: "string", description: "Pact ID hex" },
    },
    required: ["pactId"],
  },
  handler: async (args, context) => {
    if (!context?.agent) {
      throw new Error("Pactwright agent runtime is not initialized");
    }
    const cert = await context.agent.certificate(args.pactId);
    return cert;
  },
};
