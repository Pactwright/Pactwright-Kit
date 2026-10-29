# Privacy Model: Anonymous Proof-of-Purchase Hook

## Overview (FR-X3, B8, ROADMAP P9-02)

To allow buyers to leave authentic reviews without revealing their specific pact IDs, transaction amounts, or timing correlation on-chain, Pactwright implements the **Batched, Delayed, Shuffled Membership Set** model for BookerBob reviews.

## Threat Model & Attack Vectors

If a seller were to immediately add a buyer to the BookerBob review set upon pact settlement:
1. **Timing Correlation Attack:** Observers could correlate the exact timestamp of the on-chain settlement with the `add_member` invocation, identifying which buyer purchased which item.
2. **Metadata Linkage:** An observer matching buyer addresses with review set changes could deanonymize pseudonymous agents.

## Mitigations Implemented in `proof-of-purchase.ts`

1. **Threshold Batching:** Buyers' blinded cryptographic commitments (`buyerCommitment`) are held in a local queue until a minimum batch threshold (default $N=5$) is reached.
2. **Poisson / Delayed Flush:** Batches are delayed by a randomized jitter window (e.g., random ledgers) to eliminate block-level synchronization.
3. **Cryptographic Shuffling:** Before submitting the batch to BookerBob's Semaphore membership tree, the entries are shuffled using a cryptographically secure Fisher-Yates shuffle with `crypto.randomBytes`.
4. **Zero-Knowledge Proofs:** Reviewers construct ZK-SNARK proofs of membership in the tree without revealing their leaf index or identity.

This ensures an anonymity set of size at least $N$, rendering timing correlation attacks computationally infeasible.
