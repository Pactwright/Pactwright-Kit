import { z } from "zod";
import { notImplemented } from "@pactwright/core";
import type { ToolDefinition } from "../tool.ts";

const input = z.object({ pactId: z.string() });

export const getCertificateTool: ToolDefinition<typeof input> = {
  name: "pactwright_get_certificate",
  description: "Get the certificate for a terminal pact.",
  input,
  handler: async () => notImplemented("K-11"),
};
