# Verifier service

Witness-compatible verifier: delivery receipt → evidence hash → model reads → **rules decide**
→ signed verdict-v1 envelope (+ one attestation per pact for escrow). ARCHITECTURE §6.5.

## Testnet Deployment (ROADMAP V-10)

- **Testnet Endpoint**: `https://verifier.pactwright.dev`
- **Health Check**: `GET https://verifier.pactwright.dev/health`
- **Envelopes Retrieval**: `GET https://verifier.pactwright.dev/v1/envelopes/:sha256`
- **Verdict Evaluation**: `POST https://verifier.pactwright.dev/v1/verdicts`

### Container Build & Run

To build the container image locally:

```bash
docker build -f services/verifier/Dockerfile -t pactwright-verifier .
```

To run the container:

```bash
docker run -p 3000:3000 \
  -e PORT=3000 \
  -e VERIFIER_SECRET_KEY=<ed25519-secret-seed> \
  -e FACILITATOR_URL=https://testnet.facilitator.stellar.org \
  pactwright-verifier
```

Health check verification:
```bash
curl http://localhost:3000/health
# {"ok":true,"verifier":"G...","verifierHex":"..."}
```

---

## Latency Measurements & Default Deadlines (ROADMAP V-11, Q6)

Benchmarked across the standard 52-case eval set (`eval/cases/document-translation`):

| Condition Kind | Metric | Latency |
|---|---|---|
| `document.translation` | Deterministic Rules (Mean) | 0.033 ms |
| `document.translation` | Deterministic Rules (p50) | 0.005 ms |
| `document.translation` | Deterministic Rules (p95) | 0.044 ms |
| `document.translation` | Full Pipeline with LLM I/O (Estimated p95) | ~2.5 s |

### Deadline Selection Rationale (Q6)

Stellar ledgers close approximately every 5 seconds.

- **`verdictLedgers` = 120 ledgers (~10 minutes / 600 seconds)**:
  Provides a safe >100× safety margin over p95 model reading latency (~2.5s) to accommodate provider network jitter, rate limiting, and seller non-delivery challenge webhooks.
- **`settleLedgers` = 720 ledgers (~60 minutes / 3600 seconds)**:
  Provides a 1-hour window for the buyer or seller to settle the pact on-chain before the automatic release/refund grace period takes effect.

Default deadlines in `@pactwright/seller`:
```ts
export const DEFAULT_DEADLINES_BY_KIND = {
  "document.translation": { verdictLedgers: 120, settleLedgers: 720 },
};
```
