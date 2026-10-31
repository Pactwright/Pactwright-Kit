import { z } from "zod";
import type { ToolDefinition } from "../tool.ts";

const input = z.object({ pactId: z.string() });

export const getPactTool: ToolDefinition<typeof input> = {
  name: "pactwright_get_pact",
  description:
    "Get a pact's state and timeline. Not yet wired to a pact read: the agent has no get_pact path, so this refuses rather than describes.",
  input,
  inputSchema: {
    type: "object",
    properties: {
      pactId: { type: "string", description: "Pact ID hex" },
    },
    required: ["pactId"],
  },
  handler: async (args) => {
    // A fabricated `state: "settled"` is worse than an error here: an agent reads this to decide
    // whether its money is gone. The real read is the `pact` contract's `get_pact`
    // (@pactwright/contracts-client), which no agent-facing API reaches yet.
    throw new Error(
      `pactwright_get_pact cannot read pact ${args.pactId}: no pact-state read is wired into the agent, ` +
        "and this tool will not invent one. Read the certificate with pactwright_get_certificate, or the Studio API.",
    );
  },
};
