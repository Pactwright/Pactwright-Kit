/** A deterministic rule set per condition kind. The model only reads; rules decide (FR-V5). */
import type { z } from "zod";
import type { ReasonCode } from "@witness/core";
import type { CriterionResult } from "../types.ts";

export interface RuleDecision {
  verdict: "ALLOW" | "DENY";
  /** Stroops owed to the seller: `0 < amount <= cap` for ALLOW, `0` for DENY (contract rule). */
  amount: bigint;
  /** Witness criterion results, recorded in the envelope. */
  criteria: CriterionResult[];
  /** Witness reason codes for the decision. */
  reasons: ReasonCode[];
  /** Recorded in the envelope so a verdict can be re-derived later. */
  policyVersion: string;
}

export interface RuleSet<ModelOutput extends z.ZodType = z.ZodType> {
  /** Matches `condition.kind`. */
  kind: string;
  /** Structured output the model must return. */
  modelOutput: ModelOutput;
  /** How the model should read the evidence for this kind; sent ahead of the condition. */
  instructions?: string;
  /** Pure function: same inputs, same decision. */
  decide(output: z.infer<ModelOutput>, condition: Record<string, unknown>, capStroops: bigint): RuleDecision;
}
