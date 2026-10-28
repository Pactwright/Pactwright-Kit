/** Envelope store. Unique (pactId, milestone): one delivery verdict per pact (B3). ROADMAP V-01. */
import type { VerdictEnvelope } from "./types.ts";

export interface VerdictStore {
  put(envelope: VerdictEnvelope, sha256: string): Promise<void>;
  get(sha256: string): Promise<VerdictEnvelope | undefined>;
  /** Returns the existing envelope for (pactId, milestone) if any. */
  find(pactId: string, milestone: string): Promise<VerdictEnvelope | undefined>;
}
