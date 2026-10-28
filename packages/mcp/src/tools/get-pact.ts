import { z } from "zod";
import { notImplemented } from "@pactwright/core";
import type { ToolDefinition } from "../tool.ts";

const input = z.object({ pactId: z.string() });

export const getPactTool: ToolDefinition<typeof input> = {
  name: "pactwright_get_pact",
  description: "Get a pact's state and timeline.",
  input,
  handler: async () => notImplemented("K-11"),
};
