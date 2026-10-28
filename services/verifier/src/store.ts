/**
 * Envelope store. Unique (pactId, milestone): one delivery verdict per pact (B3, ADR-003).
 * `MemoryVerdictStore` serves tests and local runs; a durable store implements the same
 * interface for deployment (V-10).
 */
import type { VerdictEnvelope } from "./types.ts";

export class DuplicateVerdictError extends Error {
  constructor(public readonly pactId: string, public readonly milestone: string, public readonly existing: string) {
    super(`a verdict for pact ${pactId} milestone ${milestone} already exists (${existing})`);
    this.name = "DuplicateVerdictError";
  }
}

export interface VerdictStore {
  /** Throws `DuplicateVerdictError` if (agreementId, milestoneId) already has an envelope. */
  put(envelope: VerdictEnvelope, sha256: string): Promise<void>;
  get(sha256: string): Promise<VerdictEnvelope | undefined>;
  /** Returns the existing envelope hash for (pactId, milestone), if any. */
  find(pactId: string, milestone: string): Promise<string | undefined>;
}

export class MemoryVerdictStore implements VerdictStore {
  private readonly bySha = new Map<string, VerdictEnvelope>();
  private readonly byMilestone = new Map<string, string>();

  private static key(pactId: string, milestone: string): string {
    return `${pactId}/${milestone}`;
  }

  async put(envelope: VerdictEnvelope, sha256: string): Promise<void> {
    const key = MemoryVerdictStore.key(envelope.agreementId, envelope.milestoneId);
    const existing = this.byMilestone.get(key);
    if (existing) throw new DuplicateVerdictError(envelope.agreementId, envelope.milestoneId, existing);
    this.bySha.set(sha256, envelope);
    this.byMilestone.set(key, sha256);
  }

  async get(sha256: string): Promise<VerdictEnvelope | undefined> {
    return this.bySha.get(sha256);
  }

  async find(pactId: string, milestone: string): Promise<string | undefined> {
    return this.byMilestone.get(MemoryVerdictStore.key(pactId, milestone));
  }
}
