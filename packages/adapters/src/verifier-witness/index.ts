/** Witness-compatible verifier client (MVP). ROADMAP K-13. */
import { notImplemented } from "@pactwright/core";
import type { Verifier, VerdictInput, VerdictOutput } from "../types.ts";

export class VerifierWitness implements Verifier {
  requestVerdict(_input: VerdictInput): Promise<VerdictOutput> {
    return notImplemented("K-13");
  }

  verifyEnvelope(_envelopeRef: string): Promise<boolean> {
    return notImplemented("K-13");
  }
}
