# ADR-020: A non-delivery DENY needs an answer from the pact's own seller

- **Status:** Accepted (2026-11-08)
- **Governs:** `services/verifier/src/non-delivery.ts`, `pipeline.ts`, `server.ts` · PRD FR-V6 · ARCHITECTURE §5.1
- **Related:** ADR-012 (signed delivery receipts), ADR-019 (terms from the chain). Numbers are global across the three repos; 020 was the next free one.

## Context

FR-V6 says: no delivery receipt within the timeout → DENY. The verifier implemented it like this:
when a verdict request had no `deliveryReceipt`, it POSTed a challenge to `SELLER_WEBHOOK_URL`, one
URL for the whole verifier, and signed DENY if that URL was unset, unreachable, slow, or answered
anything but a receipt.

- On a verifier that serves more than one seller, one URL challenges the wrong party.
- With the URL unset (the hosted testnet verifier), every request without a receipt got a signed
  DENY at once. Anyone could send one for any escrow pact, submit the attestation with
  `record_verdict`, and `release` the buyer's money back after the seller had delivered.
- A seller that was briefly down or slow lost the sale, and nothing distinguishes that from a
  failure an attacker caused.

The seller middleware doesn't answer challenges, and no source a caller can't edit says where a
given seller would answer one.

## Decision

1. A request without a delivery receipt gets **no verdict** (`202 {"verdict":null,"reason":"no_delivery_receipt"}`),
   unless the verifier was configured in code with a challenge endpoint for that seller.
2. With such an endpoint, the verifier signs DENY only when the seller answers `2xx` without a
   receipt. Unreachable, timed out, a non-`2xx` answer or an unreadable body all mean no verdict.
3. The `SELLER_WEBHOOK_URL` fallback is removed: an endpoint never comes from the environment for
   all sellers, or from the request.

## Consequences

- Escrow: a pact with no delivery receipt falls to its silence policy at the verdict deadline. With
  the default `Silence::Refund`, the buyer gets the cap back, which is what a non-delivery DENY would
  have done, but nobody can force it early for a pact the seller delivered.
- A seller who chose `Silence::Pay` and doesn't deliver is paid once the verdict deadline passes.
  That was already true whenever the verifier was down; the buyer accepted it in the 402.
- M0: no verdict means no refund decision; the buyer can still dispute with a receipt.
- FR-V6 holds again once sellers publish a challenge endpoint the verifier can trust (for example a
  seller account data entry, as ADR-019 does for the delivery key). That is future work.
