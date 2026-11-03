# ADR-018: The envelope hash commits to the signed envelope

- **Status:** Proposed (2026-11-03)
- **Governs:** [ROADMAP.md](../../ROADMAP.md) V-13 · `services/verifier/src/sign.ts` (core-team path) · ARCHITECTURE §6.5
- **Related:** ADR-003 (one verdict per pact and milestone), ADR-004 (`pact` scheme). Numbers are global across the three repos; 018 was the next free one.

## Context

A verdict produces three things that should name the same record: the signed verdict-v1 envelope, the
reference `verdict-v1 sha256=<h> uri=<base>/v1/envelopes/<h>` returned to the seller, and the
`envelope_hash` in the escrow `VerdictAttestation` that `record_verdict` stores on the pact. The
anchorer then folds `envelope_hash` into the pact's receipt leaf (`receipt_leaf` in the contracts'
`hashing.rs`).

`signVerdict` sets `envelopeSha256 = computeProofHash(conditionHash, evidence)`. That is Witness's
`proofHash`, a hash of the condition and the evidence file hashes. It leaves out the pact, the
verdict, the reasons, the amount, the timestamp and the signature. Found during the local run on
2026-10-29:

- Two pacts judged on the same documents get the same hash. Every local run on the translation
  fixtures produced `6a01ac1b…`, whatever the pact or the verdict.
- The on-chain `envelope_hash` doesn't commit to the verdict record. An ALLOW and a DENY for the same
  evidence would anchor the same 32 bytes, so a receipt can't prove which envelope it refers to.
- `GET /v1/envelopes/<h>` is ambiguous. The Postgres store from #95 indexes `sha256` without a
  unique constraint and returns whichever row matches first, which can be another pact's envelope.

The contract is not affected. It stores and hashes whatever 32 bytes the attestation carries.

## Decision

1. The envelope hash is `sha256(canonicalize(envelope))`, where `envelope` is the full signed
   verdict-v1 envelope (including `proofHash` and `signature`) and `canonicalize` is the RFC 8785
   canonicalization already vendored in `@witness/core`. `proofHash` keeps its Witness meaning and
   stays inside the envelope.
2. `signVerdict` computes the hash after signing and uses it for the reference, the attestation's
   `envelopeHash` and the store key. Nothing else changes in the attestation or the contract.
3. The store makes `sha256` unique. `GET /v1/envelopes/<h>` returns at most one envelope, and anyone
   holding it can check it with `sha256(canonicalize(body)) == h`, then with `verifyEnvelope`.
4. Envelopes already issued keep their old references. On testnet, where the hosted verifier has
   stored none (`verifier_envelopes` was empty on 2026-11-03), no migration is needed. Pacts already
   settled on-chain keep the proof hash they recorded; this ADR doesn't rewrite them.

## Consequences

- Each verdict has its own hash, so a receipt leaf commits to one specific signed decision.
- The hash can only be computed after signing, so the envelope can't contain its own hash (it never
  did).
- Sellers and Studio that recompute a hash from the envelope have to use the new rule. The Kit's
  seller hooks only pass the hash through, so they don't change.
- The change is in `sign.ts`, a core-team path, and needs a test vector: a fixed envelope, its
  canonical bytes and the expected hash, plus two pacts on the same evidence getting different hashes.

## Alternatives considered

- **Hash the envelope without the signature.** Ed25519 signatures are deterministic, so this
  identifies the record equally well. It was rejected because hashing the exact bytes that are served
  is simpler to explain and to check.
- **Mix the pact ID into the proof hash.** This changes Witness's `proofHash` definition and breaks
  compatibility with other Witness verifiers.
- **Key envelopes by `(pact, milestone)` only.** This fixes the lookup but leaves the on-chain hash
  unable to tell verdicts apart.
