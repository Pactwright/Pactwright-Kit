import type { z } from "zod";
import type { Pactwright } from "@pactwright/agent";

export interface ToolContext {
  agent?: Pactwright;
}

/**
 * The four MCP behaviour hints, all required. Hosts warn users from these before invoking a tool and
 * the OpenAI and Anthropic directories reject tools where any hint is missing, so a tool that does not
 * state them is a tool that cannot be listed. Values describe what the handler does, not what it is
 * meant to do: see the per-tool comments.
 */
export interface ToolAnnotations {
  readOnlyHint: boolean;
  destructiveHint: boolean;
  idempotentHint: boolean;
  openWorldHint: boolean;
}

/** A tool definition wired to the MCP server. */
export interface ToolDefinition<Input extends z.ZodType = z.ZodType> {
  name: string;
  description: string;
  annotations: ToolAnnotations;
  input: Input;
  inputSchema?: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
  handler: (input: z.infer<Input>, context?: ToolContext) => Promise<unknown>;
}
