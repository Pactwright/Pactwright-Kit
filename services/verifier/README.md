# Verifier service

Witness-compatible verifier: delivery receipt → evidence hash → model reads → **rules decide**
→ signed verdict-v1 envelope (+ one attestation per pact for escrow). ARCHITECTURE §6.5.

## Testnet deployment (ROADMAP V-10)

Hosted on Render at **https://pactwright-verifier-testnet.onrender.com** (service
`pactwright-verifier-testnet`, defined in [`render.yaml`](../../render.yaml) next to the facilitator).
A verdict it signed has been accepted on-chain by `record_verdict`: see
[the hosted verifier](../../README.md#the-hosted-verifier) in the Kit README. Full setup guide:
[Run a verifier](https://pactwright.github.io/docs/guides/verifier/).

To deploy your own:

1. Render Dashboard → **New → Blueprint** → this repo. Render reads `render.yaml`.
2. Fill in the `sync: false` values when asked. They stay in Render's secret store:
   - `VERIFIER_SECRET_KEY`: the key the `pact` contract is configured with (`4efdaeb6…e4ff` on testnet).
   - `VERIFIER_PROVIDER`, `VERIFIER_MODEL`, `VERIFIER_EFFORT`: the pinned provider, model and
     effort. There is no default model.
   - `VERIFIER_LLM_API_KEY`, and `LLM_BASE_URL` if the provider isn't the adapter's default.
     The adapter speaks the OpenAI-compatible `chat/completions` API.
   - `FACILITATOR_URL`: the facilitator service's public URL.
   - `EVIDENCE_BUCKET_URL`: an https prefix the verifier can read. Evidence URIs must resolve
     under it; anything else is refused before any fetch. On testnet this is the public
     [`pactwright-evidence`](https://github.com/Pactwright/pactwright-evidence) repository.
   - `DATABASE_URL`: Postgres for verdict envelopes. The image runs with `NODE_ENV=production`,
     which refuses to start without it.
   `STELLAR_RPC_URL` is set in `render.yaml`; each escrow attestation is stamped with its latest
   ledger. Envelope links point at `RENDER_EXTERNAL_URL` (set by Render) unless
   `VERIFIER_PUBLIC_URL` is set.
3. Check that `GET <url>/health` returns the expected `verifierHex` and `"store":"postgres"`.

The process refuses to start, listing every problem, if the model, its API key, the verifier key,
the evidence bucket, the RPC or (in production) the database is missing: it never invents a reading.

Endpoints: `GET /health`, `GET /v1/envelopes/:sha256`, `POST /v1/verdicts`.

`GET /health` also reports `verdictRequests` (verdicts this process was asked to decide) and
`verdictFailures` (of those, the ones that ended in a 5xx). A 400 is the caller's mistake and a
409 says "already decided", so neither is counted; Studio's `/api/ops/health` turns the ratio into
the `verifier_error_rate` alert (ROADMAP XC-03).

Envelopes are stored in Postgres (`verifier_envelopes`, one row per pact and milestone), so a
restart or redeploy keeps them and their links keep resolving. Without a database (local runs
only) they're kept in memory.

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
  -e STELLAR_RPC_URL=https://soroban-testnet.stellar.org \
  -e VERIFIER_PUBLIC_URL=http://localhost:10000 \
  -e DATABASE_URL=<postgres-url> \
  pactwright-verifier
```

```bash
curl http://localhost:10000/health
# {"ok":true,"verifier":"G...","verifierHex":"...","store":"postgres"}
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
