# Verifier service

Witness-compatible verifier: delivery receipt → evidence hash → model reads → **rules decide**
→ signed verdict-v1 envelope (+ one attestation per pact for escrow). ARCHITECTURE §6.5.

## Testnet deployment (ROADMAP V-10)

Hosted on Vercel at **https://pactwright-verifier.vercel.app** (project `pactwright-verifier`), as one
Vercel Function built by `pnpm --filter @pactwright/verifier build:vercel`.
A verdict it signed has been accepted on-chain by `record_verdict`: see
[the hosted verifier](../../docs/OVERVIEW.md#the-hosted-verifier) in the Kit overview. Full setup guide:
[Run a verifier](https://pactwright.github.io/docs/guides/verifier/).

To deploy your own on Vercel:

1. From this directory: `vercel link`, then `pnpm run build:vercel` and
   `vercel deploy --prebuilt --prod`. The build bundles `src/vercel.ts` and the workspace packages
   it uses into `.vercel/output` (Build Output API v3, Node 22, 120 s per request).
2. Set these as Production environment variables (`vercel env add <NAME> production`):
   - `VERIFIER_SECRET_KEY`: the key the `pact` contract is configured with (`4efdaeb6…e4ff` on testnet).
   - `VERIFIER_PROVIDER`, `VERIFIER_MODEL`, `VERIFIER_EFFORT`: the pinned provider, model and
     effort. There is no default model.
   - `VERIFIER_LLM_API_KEY`, and `LLM_BASE_URL` if the provider isn't the adapter's default.
     The adapter speaks the OpenAI-compatible `chat/completions` API.
   - `FACILITATOR_URL`: the facilitator's public URL.
   - `EVIDENCE_BUCKET_URL`: an https prefix the verifier can read. Evidence URIs must resolve
     under it; anything else is refused before any fetch. On testnet this is the public
     [`pactwright-evidence`](https://github.com/Pactwright/pactwright-evidence) repository.
   - `DATABASE_URL`: Postgres for verdict envelopes. Production refuses to start without it.
   - `STELLAR_RPC_URL`: each escrow attestation is stamped with its latest ledger.
   - `PACT_CONTRACT_ID` and `STELLAR_NETWORK_PASSPHRASE`: the `pact` contract whose pacts this
     verifier judges, and its network. Every request is checked against that contract first.

   Envelope links point at the project's production domain (`VERCEL_PROJECT_PRODUCTION_URL`)
   unless `VERIFIER_PUBLIC_URL` is set. Until the configuration is complete, every request
   answers `503` with the names of the missing settings.
3. Check that `GET <url>/health` returns the expected `verifierHex` and `"store":"postgres"`.

The [`Dockerfile`](Dockerfile) runs the same app as a long-lived server for any container host;
it reads the same variables, plus `VERIFIER_PORT` or the host's `PORT`.

The process refuses to start, listing every problem, if the model, its API key, the verifier key,
the evidence bucket, the RPC, the `pact` contract or (in production) the database is missing: it
never invents a reading.

### It judges the pact on the chain, not the terms it is sent

Before reading any evidence, `POST /v1/verdicts` checks the request's terms against sources a caller
can't edit ([ADR-019](../../docs/adr/ADR-019-verdict-terms-from-chain.md)):

- `conditionHash` is the hash of `condition`, and `pactId` is derived from the buyer, seller, nonce
  and that hash.
- For escrow, `get_pact` returns a pact with the same buyer, seller, cap and condition hash, still
  waiting for its verdict.
- The delivery key is the seller account's own key, or the key the seller published on its account
  as the data entry `pactwright.delivery_key`.

Terms that fail get `422 {"error":"terms_mismatch","problems":[…]}` and nothing is signed. If the
chain can't be read, the answer is `503 {"error":"chain_unavailable"}`.

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
- **`NON_DELIVERY_TIMEOUT_SEC` (default 300)**: how long the verifier waits for the seller's delivery-receipt webhook before it denies. It is a **deadline for an unresponsive webhook**, not a budget for a slow model — the request is aborted at the deadline and the pact is denied, so set it to what your seller endpoints need. The value is seconds; the HTTP abort is milliseconds (`config.nonDeliveryTimeoutSec * 1000` in `src/server.ts`), and before 2026-10-31 the seconds value was parsed and never applied, so every challenge used a hard-coded 5 s.
- **`settleLedgers` = 720 ledgers (~60 minutes / 3600 seconds)**:
  Provides a 1-hour window for the buyer or seller to settle the pact on-chain before the automatic release/refund grace period takes effect.

Default deadlines in `@pactwright/seller`:
```ts
export const DEFAULT_DEADLINES_BY_KIND = {
  "document.translation": { verdictLedgers: 120, settleLedgers: 720 },
};
```
