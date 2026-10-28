/** Verifier configuration. Startup fails if anything required is missing. ROADMAP V-01. */
import { notImplemented } from "@pactwright/core";

export interface VerifierConfig {
  /** LLM provider used by models/llm.ts. Recorded in every envelope. */
  provider: string;
  /** Pinned model ID. Recorded in every envelope. */
  model: string;
  /** Explicit reasoning effort, where the provider supports it. Recorded in every envelope. */
  effort?: string;
  verifierSecret: Uint8Array;
  facilitatorUrl: string;
  evidenceBucketUrl: string;
  /** Seconds a seller has to answer a non-delivery challenge. */
  nonDeliveryTimeoutSec: number;
}

export function loadVerifierConfig(_env: NodeJS.ProcessEnv): VerifierConfig {
  return notImplemented("V-01");
}
