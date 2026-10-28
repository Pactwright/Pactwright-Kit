/**
 * Provider-neutral LLM adapter. ROADMAP V-03.
 *
 * - Provider and model come from VerifierConfig and are pinned; both are recorded in the envelope.
 * - The model reads evidence into the rule set's structured output; it never decides.
 * - No sampling parameters (temperature / top_p / top_k): consistency comes from the pinned
 *   model, structured output and deterministic rules.
 * - Evidence is data, never instructions: free text in the output is ignored by the rules.
 * - A provider refusal returns "refusal" → no verdict → the pact's silence policy applies.
 */
import { notImplemented } from "@pactwright/core";
import type { ModelAdapter } from "./types.ts";

export const llmAdapter: ModelAdapter = {
  name: "llm",
  read: async () => notImplemented("V-03"),
};
