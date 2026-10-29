import type { z } from "zod";
import type { Pactwright } from "@pactwright/agent";

export interface ToolContext {
  agent?: Pactwright;
}

/** A tool definition wired to the MCP server. */
export interface ToolDefinition<Input extends z.ZodType = z.ZodType> {
  name: string;
  description: string;
  input: Input;
  inputSchema?: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
  handler: (input: z.infer<Input>, context?: ToolContext) => Promise<unknown>;
}
