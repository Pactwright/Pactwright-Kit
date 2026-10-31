import { z } from "zod";
import type { ToolDefinition } from "../tool.ts";

const input = z.object({
  pactId: z.string(),
  reason: z.string(),
});

export const disputeTool: ToolDefinition<typeof input> = {
  name: "pactwright_dispute",
  description:
    "Request re-verification within the refund window. Not yet wired: the verifier accepts a `dispute-<n>` milestone, the Kit verdict adapter does not send one.",
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
    // Saying `disputeStatus: "submitted"` when nothing was sent tells a buyer their dispute is filed
    // and it is not. The missing piece is small and named: `VerdictInput` has no `milestone`, so
    // `dispute-1` cannot reach POST /v1/verdicts through the adapter.
    throw new Error(
      `pactwright_dispute did not file anything for pact ${args.pactId}: the verdict adapter sends ` +
        "`milestone: \"delivery\"` only, and the refund-window dispute path is not wired. Nothing was submitted.",
    );
  },
};
