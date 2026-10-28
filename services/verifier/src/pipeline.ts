/**
 * delivery receipt → evidence hash check → model reads (structured output) → rules decide
 * → envelope (+ attestation for escrow). ROADMAP V-02. Core-team-only path.
 *
 * A model refusal (stop_reason "refusal") yields no verdict: the pact falls back to its
 * silence policy rather than guessing.
 */
import { notImplemented, type PactTerms } from "@pactwright/core";
import type { EvidenceItem, VerdictEnvelope } from "./types.ts";

export interface PipelineInput {
  terms: PactTerms;
  evidence: EvidenceItem[];
  deliveryReceipt?: string;
  milestone: "delivery" | `dispute-${number}`;
}

export interface PipelineResult {
  envelope: VerdictEnvelope;
  /** `verdict-v1 sha256=<hex> uri=<uri>` */
  envelopeRef: string;
  /** Escrow only: base64 XDR attestation + signature. */
  attestation?: { xdr: string; signature: string };
  /** Stroops owed to the seller (partial delivery). */
  amount: bigint;
}

export async function runPipeline(_input: PipelineInput): Promise<PipelineResult | "no-verdict"> {
  return notImplemented("V-02");
}
