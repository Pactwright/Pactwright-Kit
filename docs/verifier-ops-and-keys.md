# Mainnet Verifier Operations & Key Policy (ROADMAP P8-05, PRD §12 Q4)

## Architecture & Hosting (Q4 Resolution)

1. **Operator Model:**
   - **Foundation Verifiers:** In v1.1, the Pactwright Foundation operates redundant verifier clusters deployed across multi-region infrastructure (AWS & GCP).
   - **Federated / Seller-Selected Verifiers:** Sellers and buyers can specify any compliant verifier public key in the pact terms (`terms.verifier`). Third-party verifiers must conform to the `/v1/envelopes` and evaluation specifications.

2. **Key Storage & Management Policy:**
   - Verifier private signing keys are generated and held exclusively inside Hardware Security Modules (AWS CloudHSM / GCP Cloud KMS).
   - Keys are never serialized to disk or exposed to application containers.
   - Separate keys are maintained for envelope signing and on-chain verdict attestation submission.

3. **Key Rotation & Disaster Recovery:**
   - Keys are scheduled for rotation every 90 days.
   - When a verifier key is rotated, existing unsettled pacts continue to honor the snapshotted verifier public key recorded at `pact.open`.
   - In emergency compromise scenarios, `pact.set_verifier` can be invoked by the contract admin.
