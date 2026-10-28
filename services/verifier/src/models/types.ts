/** Model adapter: reads evidence into a rule set's structured output. */
import type { z } from "zod";

export interface ModelReading<T> {
  output: T;
  /** Pinned model ID actually used (recorded in the envelope). */
  modelId: string;
  /** sha256 of the raw model output (recorded in the envelope). */
  rawSha256: string;
}

export interface ModelAdapter {
  readonly name: string;
  read<S extends z.ZodType>(
    schema: S,
    instructions: string,
    evidence: { mimeType: string; data: Uint8Array }[],
  ): Promise<ModelReading<z.infer<S>> | "refusal">;
}
