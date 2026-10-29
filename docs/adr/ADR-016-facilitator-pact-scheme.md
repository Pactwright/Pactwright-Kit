# ADR-016: Facilitator `pact` Scheme and `/pact/submit`

## Status
Accepted (Phase 2, ROADMAP X-01, ARCHITECTURE §6.4).

## Context
Standard x402 payments on Stellar typically execute direct token transfers from the buyer to the seller (`exact` scheme). In Pactwright Mode 2 (escrow), payment must instead be deposited into the non-custodial `pact` Soroban contract with fee sponsorship, enabling automated release upon verifier attestations without trusting either party.

Furthermore, post-funding contract actions (`settle`, `release`, `close_meter`, `extend_pact_ttl`) need a sponsored submission gateway so sellers and verifiers do not require native XLM reserves on testnet or pubnet.

## Decision

1. **New Scheme `pact` in `/verify`:**
   - Facilitator accepts requests with scheme `pact`.
   - Strictly enforces that the transaction invocation is `pact.open` targeting the configured contract ID.
   - Enforces that `seller == payTo`, `cap == amount`, and `condition_hash == sha256(condition)`.
   - Verifies seller trustline and ensures the facilitator is never party to the escrow.

2. **Fee Sponsorship in `/settle`:**
   - The facilitator acts as fee sponsor for the verified `pact.open` transaction.
   - Upon successful submission, returns transaction hash and `pact_id`.

3. **Dedicated Submission Route `POST /pact/submit`:**
   - Exposes an allow-list of safe contract functions:
     - `settle`: seller claims payout with allowed amount.
     - `release`: buyer or verifier releases funds on denial or silence.
     - `close_meter`: closes a metered session with highest signed usage voucher.
     - `extend_pact_ttl`: extends state TTL.
   - All other functions and arbitrary invocations are rejected with 403 Forbidden.
   - Reuses existing facilitator API keys, rate limits, and daily fee ceilings.

## Consequences
- Agents can fund escrows with sponsored fees using standard x402 workflows.
- Sellers and verifiers have a secure, bounded gateway to execute terminal escrow transitions without holding native XLM.
