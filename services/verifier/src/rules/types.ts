/** A deterministic rule set per condition kind. The model only reads; rules decide (FR-V5). */
import type { z } from "zod";
import type { CriterionResult } from "../types.ts";

export interface RuleSet<ModelOutput extends z.ZodType = z.ZodType> {
  /** Matches `condition.kind`. */
  kind: string;
  /** Structured output the model must return (sent via output_config.format). */
  modelOutput: ModelOutput;
  /** Pure function: same inputs, same verdict. */
  decide(
    output: z.infer<ModelOutput>,
    condition: Record<string, unknown>,
    capStroops: bigint,
  ): { verdict: "ALLOW" | "DENY"; amount: bigint; criteria: CriterionResult[] };
}
