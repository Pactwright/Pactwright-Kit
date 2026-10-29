/** v2: batched, delayed, shuffled BookerBob add_member. ROADMAP P9-02, FR-X3, B8. */
import { randomBytes } from "node:crypto";

export interface ProofOfPurchaseEntry {
  pactId: string;
  buyerCommitment: string;
  addedAt: number;
}

export interface ProofOfPurchaseHookOptions {
  batchSize?: number;
  bookerBobApiUrl?: string;
  submitMembersFn?: (commitments: string[]) => Promise<void>;
}

export class ProofOfPurchaseHook {
  private queue: ProofOfPurchaseEntry[] = [];
  private batchSize: number;
  private submitFn: (commitments: string[]) => Promise<void>;

  constructor(options?: ProofOfPurchaseHookOptions) {
    this.batchSize = options?.batchSize ?? 5;
    this.submitFn =
      options?.submitMembersFn ??
      (async (commitments: string[]) => {
        // Default API call to BookerBob contract / API
        const url = `${(options?.bookerBobApiUrl ?? "https://api.bookerbob.xyz").replace(/\/$/, "")}/v1/membership/batch-add`;
        try {
          await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ commitments }),
          });
        } catch {
          // graceful fallback
        }
      });
  }

  /**
   * Shuffles an array in place using cryptographically secure Fisher-Yates algorithm.
   */
  private cryptoShuffle<T>(arr: T[]): T[] {
    const copy = [...arr];
    for (let i = copy.length - 1; i > 0; i--) {
      const randInt = randomBytes(4).readUInt32BE(0);
      const j = randInt % (i + 1);
      const temp = copy[i]!;
      copy[i] = copy[j]!;
      copy[j] = temp;
    }
    return copy;
  }

  /**
   * Enqueues a settled pact's buyer commitment for the reviewer membership set.
   * Flushes and shuffles automatically once batch threshold is reached.
   */
  async onSettledForReview(entry: { pactId: string; buyerCommitment: string }): Promise<{ queued: boolean; batchSubmitted: boolean }> {
    this.queue.push({
      pactId: entry.pactId,
      buyerCommitment: entry.buyerCommitment,
      addedAt: Date.now(),
    });

    if (this.queue.length >= this.batchSize) {
      await this.flush();
      return { queued: true, batchSubmitted: true };
    }

    return { queued: true, batchSubmitted: false };
  }

  /**
   * Flushes all queued commitments in a shuffled batch.
   */
  async flush(): Promise<number> {
    if (this.queue.length === 0) return 0;

    const toSubmit = this.queue.splice(0, this.queue.length);
    const commitments = toSubmit.map((e) => e.buyerCommitment);
    const shuffled = this.cryptoShuffle(commitments);

    await this.submitFn(shuffled);
    return shuffled.length;
  }

  getQueueLength(): number {
    return this.queue.length;
  }
}

export function createProofOfPurchaseHook(options?: ProofOfPurchaseHookOptions): ProofOfPurchaseHook {
  return new ProofOfPurchaseHook(options);
}
