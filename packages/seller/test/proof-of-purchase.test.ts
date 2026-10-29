import { describe, it, expect } from "vitest";
import { createProofOfPurchaseHook } from "../src/hooks/proof-of-purchase.ts";

describe("ProofOfPurchaseHook (P9-02, FR-X3, B8)", () => {
  it("batches, delays, and shuffles buyer commitments before submission", async () => {
    const batchesSubmitted: string[][] = [];

    const hook = createProofOfPurchaseHook({
      batchSize: 3,
      submitMembersFn: async (commitments) => {
        batchesSubmitted.push(commitments);
      },
    });

    // Enqueue 1
    const r1 = await hook.onSettledForReview({ pactId: "p1", buyerCommitment: "comm_1" });
    expect(r1.batchSubmitted).toBe(false);
    expect(hook.getQueueLength()).toBe(1);

    // Enqueue 2
    const r2 = await hook.onSettledForReview({ pactId: "p2", buyerCommitment: "comm_2" });
    expect(r2.batchSubmitted).toBe(false);
    expect(hook.getQueueLength()).toBe(2);

    // Enqueue 3 -> reaches batchSize (3) -> auto-flushes
    const r3 = await hook.onSettledForReview({ pactId: "p3", buyerCommitment: "comm_3" });
    expect(r3.batchSubmitted).toBe(true);
    expect(hook.getQueueLength()).toBe(0);

    expect(batchesSubmitted.length).toBe(1);
    expect(batchesSubmitted[0]?.length).toBe(3);
    expect(batchesSubmitted[0]).toContain("comm_1");
    expect(batchesSubmitted[0]).toContain("comm_2");
    expect(batchesSubmitted[0]).toContain("comm_3");
  });
});
