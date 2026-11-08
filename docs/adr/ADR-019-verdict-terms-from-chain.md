# ADR-019: The verifier judges the pact on the chain, not the terms it is sent

- **Status:** Accepted (2026-11-08)
- **Governs:** `services/verifier/src/chain-terms.ts`, `server.ts`, `sign.ts` (core-team path) · ARCHITECTURE §6.5 · ADR-012
- **Related:** ADR-003 (one verdict per pact), ADR-012 (signed delivery receipts), ADR-014 (verifier key snapshot). Numbers are global across the three repos; 019 was the next free one.

## Context

`POST /v1/verdicts` takes the pact's terms from the request: the condition, the cap, the parties and
the seller's delivery key. The verifier judged the evidence against those terms and signed. The
contract's `record_verdict` checks only that the attestation's `pact_id` and `condition_hash` match
the pact, and that an ALLOW amount is at most the cap. Nothing tied the terms the verifier judged to
the pact the contract holds:

- `signVerdict` used `terms.conditionHash` when present, without checking it against
  `terms.condition`. A seller could send the real `pact_id` and `condition_hash` with an easier
  condition (fewer pages, another language) and get an ALLOW the contract accepts.
- The delivery key came from the request. A buyer could send its own key, sign a "delivery
  receipt" over any document, and get a DENY for a pact the seller had delivered.

So the verifier was a signing oracle for whatever terms a caller chose, and ADR-012's "neither side
can fake what was delivered" did not hold.

The contract stores the buyer, seller, cap and condition hash, but not the seller's delivery key.

## Decision

1. Before the pipeline runs, the verifier checks the request against sources a caller can't edit:
   - `conditionHash` must equal `conditionHash(condition)`, and `pactId` must equal the `pact_id`
     derived from the buyer, seller, nonce and that hash.
   - For escrow pacts, `get_pact` on the configured `pact` contract must return a pact whose buyer,
     seller, cap and condition hash equal the request's. A delivery verdict needs the pact in `Funded`.
   - The delivery key must belong to the seller: either the seller account's own ed25519 key, or the
     key the seller publishes on its Stellar account as the data entry `pactwright.delivery_key`
     (32 raw bytes, or 64 hex characters). Sellers keep a separate hot delivery key by publishing it
     once with `manageData`.
2. A request that fails any check gets `422 terms_mismatch` with the reasons, and nothing is signed.
   If the chain can't be read, the verifier answers `503` and signs nothing.
3. `signVerdict` always hashes `terms.condition` itself and refuses terms whose `conditionHash`
   disagrees, so no other caller can sign a hash it didn't judge.
4. The verifier needs `PACT_CONTRACT_ID` and `STELLAR_NETWORK_PASSPHRASE`; it refuses to start
   without them.

## Consequences

- An attestation now means "this verifier judged this pact's frozen condition against evidence the
  pact's seller signed". ADR-012's guarantee holds for escrow pacts.
- Sellers whose delivery key isn't their account key must publish it once on their account. The
  seller guide says how.
- M0 (exact-refund) payments aren't on the `pact` contract, so their cap can't be checked on-chain;
  the condition, `pact_id` and delivery-key checks still apply. Their envelopes move no money by
  themselves (refunds are the seller's call, ADR-001).
- Each verdict request costs one `get_pact` simulation and one ledger-entry read.
