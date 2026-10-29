# Verifier service

Witness-compatible verifier: delivery receipt → evidence hash → model reads → **rules decide**
→ signed verdict-v1 envelope (+ one attestation per pact for escrow). ARCHITECTURE §6.5.

## Testnet Deployment (ROADMAP V-10)

Not deployed yet. The verifier is hosted on Render from [`render.yaml`](../../render.yaml) at the
repo root (service `pactwright-verifier-testnet`, next to the facilitator). Its public URL goes
here, and into `VERIFIER_URL` defaults, once the first deploy is live.

1. Render Dashboard → **New → Blueprint** → this repo. Render reads `render.yaml`.
2. Fill in the `sync: false` secrets when asked. They stay in Render's secret store:
   - `VERIFIER_SECRET_KEY`: the key the `pact` contract is configured with (`4efdaeb6…e4ff`).
   - `VERIFIER_PROVIDER`, `VERIFIER_MODEL`, `VERIFIER_EFFORT`: the pinned provider, model and
     effort. There is no default model.
   - `VERIFIER_LLM_API_KEY`, and `LLM_BASE_URL` if the provider isn't the adapter's default.
     The adapter speaks the OpenAI-compatible `chat/completions` API.
   - `FACILITATOR_URL`: the facilitator service's public URL.
   - `EVIDENCE_BUCKET_URL`: an https prefix the verifier can read. Evidence URIs must resolve
     under it; anything else is refused before any fetch.
3. Check that `GET <url>/health` returns `verifierHex` `4efdaeb6…e4ff`.

The process refuses to start, listing every problem, if the model, its API key, the verifier key
or the evidence bucket is missing: it never invents a reading.

Endpoints: `GET /health`, `GET /v1/envelopes/:sha256`, `POST /v1/verdicts`.

The envelope store is in memory: a restart or redeploy forgets stored envelopes (the contract's
one-attestation-per-pact rule still holds on-chain).

### Container Build & Run

```bash
docker build -f services/verifier/Dockerfile -t pactwright-verifier .
```

```bash
docker run -p 10000:10000 \
  -e VERIFIER_SECRET_KEY=<ed25519-secret-seed> \
  -e VERIFIER_PROVIDER=<provider> -e VERIFIER_MODEL=<pinned-model-id> \
  -e VERIFIER_LLM_API_KEY=<api-key> \
  -e FACILITATOR_URL=<facilitator-url> \
  -e EVIDENCE_BUCKET_URL=<https-evidence-prefix> \
  pactwright-verifier
```

```bash
curl http://localhost:10000/health
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
