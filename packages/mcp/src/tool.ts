import type { z } from "zod";

/** A tool definition, independent of the MCP SDK until K-11 wires it in. */
export interface ToolDefinition<Input extends z.ZodType = z.ZodType> {
  name: string;
  description: string;
  input: Input;
  handler: (input: z.infer<Input>) => Promise<unknown>;
}
