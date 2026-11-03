# Pactwright-Kit: details moved from the README

These sections were in the README. They moved here, unchanged, so the README stays short.
The [documentation site](https://pactwright.github.io/docs/) covers the same ground for readers; this file keeps the repository's own copy.

### 🧪 Test fixtures and the eval set

Four layers, each with a different claim to keep it honest.

- **Unit and integration suite** — `pnpm test`. Measured on 2026-10-30: **418 passed | 3 skipped
  (421 tests) across 45 test files**, including the suites that ship with the vendored Witness core
  and Accensa SDK. The 3 skipped tests are the Postgres-backed envelope store; they run in CI, which
  starts a Postgres service and sets `TEST_DATABASE_URL`.
- **Hashing conformance** — [`packages/core/test/vectors`](../packages/core/test/vectors). `pactwright/`
  holds this project's vectors (`pact_id`, `condition_hash`, `delivery_receipt`, `receipt_leaf`,
  `usage_voucher`, `verdict_attestation`, `nonce`, `merkle`), `accensa/` holds Accensa's Merkle
  vectors. [`vectors.yml`](../.github/workflows/vectors.yml) runs them on every pull request against the
  pinned contracts release, so a byte difference fails CI rather than the network.
- **Rules eval** — [`services/verifier/eval/cases/document-translation`](../services/verifier/eval/cases/document-translation):
  52 labelled ALLOW/DENY cases, scored by `pnpm eval` on every push and pull request. It gates on
  ≥ 90%. Because it scores the rules against hand-written readings, it says nothing about the model.
- **Real-model eval** — [`services/verifier/eval/real`](../services/verifier/eval/real): 29 labelled
  `document.translation` cases built from real documents (an English source, human translations in
  8 languages, unrelated texts), pushed through the full pipeline with the configured model. It costs
  money, so [`verifier-eval.yml`](../.github/workflows/verifier-eval.yml) runs it on demand and weekly,
  never per PR, and fails below 90%.
- **Testnet end-to-end** — [`e2e/testnet`](../e2e/testnet): every MVP scenario as real transactions,
  plus [`kms.e2e.ts`](../e2e/testnet/kms.e2e.ts) and [`hosted-verifier.e2e.ts`](../e2e/testnet/hosted-verifier.e2e.ts).
  [`e2e-testnet.yml`](../.github/workflows/e2e-testnet.yml) runs it nightly and builds its job summary
  from the run's own report; nothing in the summary is hard-coded.

What these fixtures cannot see: the quality of a model reading outside the translation set, the real
Vespi and Pollar APIs (F-08 / F-09), pubnet behaviour, and anything about the contracts themselves,
which are tested in [Pactwright-contracts](https://github.com/Pactwright/Pactwright-contracts).

### The hosted verifier

On 2026-10-29 the hosted verifier judged a real purchase with its real model (Google
`gemini-3.5-flash-lite`), and the contract accepted its signature. The script opened an escrow pact
with fresh accounts, committed the source and the delivered Portuguese translation to the public
[evidence store](https://github.com/Pactwright/pactwright-evidence), asked
`pactwright-verifier.vercel.app` for a verdict, then recorded it and settled. The script
never holds the verifier key, so the contract accepting the attestation shows the hosted service
signed it.

| Step | Ledger | Transaction |
|---|---|---|
| `open` (1 USDC locked) | 5453755 | [`b0103116…`](https://stellar.expert/explorer/testnet/tx/b01031165b23c378d3fa9f5c9befbee0b1a733d944a89e1ce13e17ff290d1a5d) |
| verdict: ALLOW 1 USDC, signed by the hosted verifier | issued at 5453756 | |
| `record_verdict` | 5453761 | [`0225f78b…`](https://stellar.expert/explorer/testnet/tx/0225f78b5c3e9b321e1fd5311bc54a61ca9904fa82dbd2b4aeb9f379bc8650db) |
| `settle` (1 USDC to the seller) | 5453762 | [`1f4ab38c…`](https://stellar.expert/explorer/testnet/tx/1f4ab38c3881892633c2dcf8d7c99c22bc49831d09512eb1b700e62e23e44924) |

The pact in Studio: [`40725564…5c55`](https://pactwright-studio.vercel.app/pact/4072556402d709463f7cb888a4a9e03b061d906f0b7ca5c49ebb2eec4e7d5c55).
Report: [`e2e/testnet/results/hosted-verifier-2026-10-29.json`](../e2e/testnet/results/hosted-verifier-2026-10-29.json).
Run it yourself (it needs write access to the evidence store) with
`GITHUB_TOKEN=… pnpm e2e:hosted-verifier --reporter=verbose`.

**Hosted testnet services.** All three run on Vercel (moved from Render on 2026-11-03), checked live on 2026-11-03.

| Service | URL | What was measured |
|---|---|---|
| Facilitator | [`/supported`](https://pactwright-facilitator.vercel.app/supported) | Returns `exact` and `pact` on `stellar:testnet` with fees sponsored and `pactContract` = `CDUXJJUNYF…FEV6` |
| Verifier | [`/health`](https://pactwright-verifier.vercel.app/health) | `ok`, `verifier` `GBHP3LVW…P7TDT`, `verifierHex` `4efdaeb6…e4ff` — the key sellers put in their terms |
| Studio | [`pactwright-studio.vercel.app`](https://pactwright-studio.vercel.app/) | Indexes the testnet pacts; separate repository |

> [!NOTE]
> Vercel Functions don't sleep the way Render's free tier did (cold starts of 42 s and 23 s there).
> Deploys to testnet are manual, as prebuilt Vercel deployments:
> - Facilitator: `cd deploy/facilitator && npm ci && npm run build && vercel deploy --prebuilt --prod`
> - Verifier: `cd services/verifier && pnpm run build:vercel && vercel deploy --prebuilt --prod`


## Architecture (continued)

The components, and what each one actually does:

1. **[`@pactwright/core`](../packages/core)** — schemas, hashing, Merkle, amounts, network config.
   - Hashing (`pactId`, condition hash, signed messages) matches the contract; the testnet run checks the Kit's `pact_id` against the contract's on every `open`.
   - Amounts are decimal strings in TypeScript and `i128` stroops on-chain, converted in only one place, `amounts.ts`, so a rounding bug cannot hide elsewhere.
   - `loadNetworkConfig` throws and lists every problem at once when the network configuration is incomplete.
2. **[`@pactwright/contracts-client`](../packages/contracts-client)** — typed client for the `pact` contract.
   - Generated from the contract's release bindings ([`scripts/fetch-bindings.sh`](../scripts/fetch-bindings.sh), [`scripts/check-bindings.sh`](../scripts/check-bindings.sh)).
   - Used by the testnet run for `open`, `record_verdict` and `release`, and by the verifier's submit path through the facilitator's `/pact/submit`.
3. **[`@pactwright/seller`](../packages/seller)** — the `pact(options)` middleware for x402 sellers, in Express and Hono forms.
   - Builds a valid x402 v2 `402` with the pact terms, verifies and settles the payment through the facilitator before serving anything, derives `pact_id` from the verified payer, signs `X-Pactwright-Delivery`, and serves one pact once.
   - Refund and settle hooks: `RefundVault.refund` (M0, disputes) and `settle` (M2), sent as real transactions; the signing key comes from a KMS (`KMS_KEY_ID`) or, for development only, `SELLER_SECRET_KEY`.
   - No default payee, delivery key or verifier: it refuses to start rather than guess one.
4. **[`@pactwright/agent`](../packages/agent)** — the buyer runtime: find, buy, await, certificate, plus metered sessions.
   - `buy` reads the `402`, refuses terms that differ from the listing or the frozen condition, and pays with `exact` (M0) or `pact` (M2), signing only auth entries.
   - `accounts.ts` creates sponsored agent accounts (CAP-33 reserves plus a USDC trustline) and tops them up through RPC, and never returns the hash of an unsent transaction.
5. **[`@pactwright/mcp`](../packages/mcp) and [`@pactwright/cli`](../packages/cli)** — the same runtime exposed to an LLM and to an operator.
   - MCP tools: `find_sellers`, `buy`, `get_pact`, `dispute`, `get_certificate`.
   - CLI commands: `pactwright verify`, `pact`, `agent-create`, `agent-topup`.
6. **[`@pactwright/adapters`](../packages/adapters)** — pluggable discovery, reputation, spending gate, wallet and verifier.
   - The Vespi gate and the Pollar wallet fail closed when their APIs are unreachable; neither has been exercised against the partner's real API (ROADMAP F-08 / F-09).
7. **[`services/verifier`](../services/verifier)** — the Witness-compatible verifier service, and the trust boundary of the whole protocol.
   - A provider-neutral model adapter, deterministic rule functions, and a Hono HTTP service backed by a Postgres envelope store.
   - It holds no money and can only sign verdicts. The contract holds the funds, and a missing verdict falls back to the agreed silence policy, which by default refunds the buyer.

**How the verifier decides.** Its design follows one rule from
[Witness](https://github.com/fabian416/witness): **the model reads, code decides.** A model is needed
because "is this a correct Portuguese translation?" cannot be checked by a hash — but the model only
*reads*, and the decision and the amount come from plain rules anyone can audit and re-run.

1. **The model reads.** An LLM turns the delivered document into a small structured reading, for example `{ detectedLanguage, pageCount, isTranslationOfSource, untranslatedSegments }`. It never decides anything.
2. **Code decides.** A pure rule function turns that reading and the frozen condition into ALLOW or DENY, plus an amount. The same inputs always give the same verdict, so anyone can re-run the rules on the stored reading.
3. **Everything is signed and kept.** The verdict is a Witness `verdict-v1` envelope. It records the criteria, reason codes, model ID and policy version, is signed with the verifier's key, and is retrievable by its hash. Envelopes live in Postgres, so their links keep resolving after a restart or redeploy.
4. **If the model refuses, there is no verdict.** The verifier doesn't guess. The pact falls back to its silence policy.

Example: `document.translation`. The condition is frozen before payment:

```json
{ "kind": "document.translation", "lang": "pt", "minPages": 4, "maxUntranslatedSegments": 0 }
```

| Criterion | Mandatory | Fails when |
|---|---|---|
| `language` | Yes | The detected language isn't the required one (`pt-BR` counts as `pt`) |
| `is_translation` | Yes | The document isn't a translation of the source |
| `completeness` | Yes | More untranslated segments than allowed |
| `has_pages` | Yes | Nothing was delivered |
| `page_count` | No | Fewer pages than `minPages` |

A failed mandatory criterion means DENY, and the buyer gets everything back. A short delivery is
paid pro rata: `cap × pages ÷ minPages`, rounded down. With a 1 USDC cap and 3 of 4 pages, the
seller is paid 0.75 USDC and 0.25 USDC returns to the buyer. `code.review` is the second condition
kind.

**Status per piece.**

| Piece | Status | What's there |
|---|---|---|
| `@pactwright/core` | Working | Schemas, exact amounts, Merkle proofs matching `ReceiptAnchor`, network config, and hashing that matches the contract. The testnet run checks the Kit's `pact_id` against the contract's on every `open` |
| `@pactwright/contracts-client` | Working | Generated from the contract's bindings; used by the testnet run for `open`, `record_verdict` and `release` |
| `services/verifier` rules and signing | Working | `document.translation` and `code.review` rules, verdict-v1 envelopes, one attestation per pact. The contract accepts its signatures on testnet |
| `services/verifier` receipt checks | Working | Verifies the seller's ed25519 signature over the pact and body hash, and that the body is in the evidence |
| `services/verifier` model reading | Real model | Provider-neutral adapter (OpenAI-compatible API), with timeouts and bounded retries. Fails closed: with no provider, model and key configured, it refuses rather than inventing a reading. **Real-model accuracy: 29/29 (100%)** on the labelled `document.translation` set with Google `gemini-3.5-flash-lite`, 2026-10-29 ([run](https://github.com/Pactwright/Pactwright-Kit/actions/runs/40897633766)) |
| `services/verifier` HTTP service | Working | `/health`, `/v1/verdicts`, `/v1/envelopes/:sha256`; one verdict per pact and milestone. Envelopes are kept in Postgres, so their links, which point at the service itself, keep resolving after a restart |
| Hosted verifier | Testnet | [`pactwright-verifier.vercel.app`](https://pactwright-verifier.vercel.app/health). A verdict it signed with the real model was accepted by `record_verdict` and settled ([evidence](#the-hosted-verifier)) |
| `@pactwright/seller` refund and settle hooks | Working | `RefundVault.refund` (M0, disputes) and `settle` (M2) sent as real transactions. A refund has been signed by a HashiCorp Vault transit key, so the seller key never leaves the KMS (`pnpm e2e:kms`) |
| `@pactwright/seller` middleware | Testnet | x402 v2 paywall: a valid 402, payments verified and settled by the facilitator before anything is served, `pact_id` derived from the verified payer, signed `X-Pactwright-Delivery`, one serve per pact (Express and Hono). No default payee, delivery key or verifier |
| `@pactwright/agent` accounts | Tested offline | Sponsored agent accounts and top-ups, submitted through RPC; never returns the hash of an unsent transaction |
| `@pactwright/agent` buy | Testnet | x402: reads the 402, refuses terms that differ from the listing or the frozen condition, pays with `exact` (M0) or `pact` (M2), signing only auth entries |
| Facilitator `pact` scheme | Testnet | Merged in Accensa's facilitator ([#651](https://github.com/accensa/x402-facilitator-stellar/pull/651)) and hosted on testnet; the testnet run's x402 rows go through it |
| `@pactwright/mcp`, `@pactwright/cli` | Tested offline | MCP tools and CLI commands; `buy` and `agent-*` inherit the status of the agent rows above |
| Adapters | Partner APIs | Vespi gate and Pollar wallet fail closed when their APIs are unreachable. Partner access is F-08 / F-09 |

**Repository layout.**

| Path | What |
|---|---|
| [`packages/`](../packages) | The publishable libraries listed above |
| [`services/verifier`](../services/verifier) | The verifier service: `server.ts`, `rules/`, `models/`, `pipeline.ts` |
| [`vendor/witness-core`](../vendor/witness-core) | `@witness/core`, vendored unmodified (see [UPSTREAM.md](../vendor/witness-core/UPSTREAM.md)) |
| [`packages/core/test/vectors`](../packages/core/test/vectors) | Conformance vectors: Pactwright's own and Accensa's Merkle vectors |
| [`e2e/testnet`](../e2e/testnet) | The real testnet run of every MVP scenario, and its reports |
| [`examples/`](../examples) | `agent-node`, `seller-express`, `metered-minutes` |
| [`docs/`](../docs) | PRD, architecture, essentials, project structure |

## ⚙️ Supported Versions & Compatibility

The pins below were read from the manifests in this repo: [`package.json`](../package.json),
[`.nvmrc`](../.nvmrc), [`pnpm-workspace.yaml`](../pnpm-workspace.yaml), `packages/*/package.json`,
[`services/verifier/package.json`](../services/verifier/package.json) and the resolved versions in
[`pnpm-lock.yaml`](../pnpm-lock.yaml) (lockfile version 9.0). The manifests are the source of truth for
intent; the lockfile only records a resolution.

| Manifest | Pin |
|---|---|
| [`package.json`](../package.json) | `engines.node` `>=24`, `packageManager` `pnpm@10.34.7` |
| [`.nvmrc`](../.nvmrc) | `24` |
| [`pnpm-workspace.yaml`](../pnpm-workspace.yaml) | `packages/*`, `services/*`, `examples/*`, `vendor/*`, `e2e/*` |
| `packages/*/package.json` | all seven packages at version `0.1.0`, `license` Apache-2.0, `@stellar/stellar-base` `^15.0.0`, `@stellar/stellar-sdk` `^16.4.1`, `@x402/core` and `@x402/stellar` `2.28.0` (exact), `zod` `^4.1.0`, `@modelcontextprotocol/sdk` `^1.32.2`, seller peers `express` `^5.0.0` and `hono` `^4.0.0` (both optional) |
| [`services/verifier/package.json`](../services/verifier/package.json) | `@pactwright/verifier` `0.0.0`, private, `hono` `^4.10.0`, `@hono/node-server` `^1.19.0`, `pg` `^8.23.1` |
| [`pnpm-lock.yaml`](../pnpm-lock.yaml) | resolved: TypeScript `5.9.3`, Vitest `4.1.12`, `@stellar/stellar-sdk` `16.4.1`, `@stellar/stellar-base` `15.0.0`, `@x402/core` `2.28.0`, `zod` `4.6.7`, `hono` `4.13.14`, `pg` `8.23.1`, `express` `5.3.0` |

### What "Supported" means here

A row marked **Supported** means the pin is exercised by a CI gate on every push to `main` or every
pull request:

- [`ci.yml`](../.github/workflows/ci.yml) — `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build` on
  Node from `.nvmrc` with a Postgres service for the envelope store, plus a `verifier-image` job that
  builds [`services/verifier/Dockerfile`](../services/verifier/Dockerfile) and asserts the container
  refuses to start when `VERIFIER_SECRET_KEY` and `DATABASE_URL` are missing.
- [`vectors.yml`](../.github/workflows/vectors.yml) — core hashing against the pinned contracts vectors
  on every pull request.
- [`verifier-eval.yml`](../.github/workflows/verifier-eval.yml) — the rules eval per PR; the real-model
  eval on demand and weekly, failing below 90%.
- [`roadmap-check.yml`](../.github/workflows/roadmap-check.yml) — fails any PR that does not change
  [`ROADMAP.md`](../ROADMAP.md).
- [`e2e-testnet.yml`](../.github/workflows/e2e-testnet.yml) — the testnet run nightly, not per PR; it is
  a scheduled proof, not a merge gate.
- [`scorecard.yml`](../.github/workflows/scorecard.yml) — OpenSSF Scorecard weekly and on `main`.

Verified by hand rather than continuously: the testnet and KMS runs of 2026-10-29 recorded in
[`e2e/testnet/results`](../e2e/testnet/results), the hosted-verifier run of the same date, the real-model
eval of 2026-10-29 ([run](https://github.com/Pactwright/Pactwright-Kit/actions/runs/40897633766)), and
the live checks of the three hosted services and the OpenSSF Scorecard on 2026-10-30, when this
repository scored **6.4/10** at `main` commit `b39e236` (Pinned-Dependencies, Token-Permissions,
Security-Policy and Dangerous-Workflow all 10; Code-Review 0 because `enforce_admins` is off on
`main`, which no amount of code can fix).

| Area | State |
|---|---|
| Core, contract client, verifier, seller hooks | Working, proven on testnet |
| Nightly testnet e2e | Runs every night against testnet (K-16). Testnet occasionally fails to confirm a transaction in time; a re-run then passes |
| Hosted verifier | Live on testnet; a verdict it signed was accepted on-chain (V-10) |
| Real-model accuracy | 29/29 on the labelled translation set (V-12) |
| Agent x402 payment | Working on testnet (K-08, K-09) |
| Facilitator `pact` scheme | Merged and hosted on testnet (X-01…X-08, L-08) |
| npm release | Not yet (K-17) |

## 📊 Measurements

This README quotes as few numbers as it can. The figures are recorded in files, not in memory:
testnet transactions and contract and account addresses in the run reports under
[`e2e/testnet/results/`](../e2e/testnet/results) —
[`2026-10-29.json`](../e2e/testnet/results/2026-10-29.json) for the MVP scenarios,
[`kms-2026-10-29.json`](../e2e/testnet/results/kms-2026-10-29.json) for the KMS-signed refund and
[`hosted-verifier-2026-10-29.json`](../e2e/testnet/results/hosted-verifier-2026-10-29.json) for the
hosted-verifier pact — real-model accuracy in the `real-model` job of
[`verifier-eval.yml`](../.github/workflows/verifier-eval.yml) (the run that produced 29/29 is
[40897633766](https://github.com/Pactwright/Pactwright-Kit/actions/runs/40897633766)), and the
supply-chain score in the Scorecard results published by [`scorecard.yml`](../.github/workflows/scorecard.yml).
Test counts, cold-start timings and the Scorecard reading quoted above were measured on 2026-10-30;
[`ROADMAP.md`](../ROADMAP.md) dates every one of them in its Update log.

### What Apache-2.0 means for you

| You may | You must | You get no |
|---|---|---|
| Use the code in open or closed-source projects, commercially or not | Include a copy of the license with any copy you distribute | Warranty of any kind |
| Modify it and distribute your changes | Mark files you changed with a notice that you changed them | Liability from the authors for losses, including funds lost through a bug |
| Sublicense and sell it | Keep the copyright, patent and attribution notices, including [NOTICE](../NOTICE) | Right to use the Pactwright name or logo to endorse your product |
| Use any patents contributors hold on their contributions (explicit grant) | | Patent license if you sue anyone claiming the code infringes a patent (it ends) |

The no-warranty clause matters here because this code moves money and decides who gets paid. If you
run it, the risk is yours.

### Why Apache-2.0 and not MIT

The kit includes Witness core in [`vendor/witness-core`](../vendor/witness-core), which is licensed under
Apache-2.0. Keeping the whole kit under Apache-2.0 means a single set of terms covers everything in
the repo, and it adds an explicit patent grant. That matters for an SDK that other companies build
products on. The contracts and Studio repos contain no Apache-2.0 code, so they use MIT — which is
also why this repo is Apache-2.0 while [Pactwright-contracts](https://github.com/Pactwright/Pactwright-contracts)
is MIT.

| Repository | License |
|---|---|
| [Pactwright-contracts](https://github.com/Pactwright/Pactwright-contracts) | MIT |
| Pactwright-Kit (this repo) | Apache-2.0 |
| [Pactwright-studio](https://github.com/Pactwright/Pactwright-studio) | MIT |

### Third-party code and licenses

| Component | How it is used | License |
|---|---|---|
| [`@witness/core`](https://github.com/fabian416/witness) (commit `1f9a8e2`) | Vendored unmodified in `vendor/witness-core`. It has its own LICENSE and NOTICE, and [UPSTREAM.md](../vendor/witness-core/UPSTREAM.md) records the exact source | Apache-2.0 |
| Accensa Merkle conformance vectors | Test data in `packages/core/test/vectors/accensa` | MIT |
| `@accensa/sdk` | Vendored in `vendor/accensa-sdk`; the seller's settle hook | MIT |
| Accensa `refund_vault.wasm` v0.2.0 | Test fixture in [`e2e/testnet/fixtures`](../e2e/testnet/fixtures), hash-checked; deployed fresh by each testnet run | MIT |
| [zod](https://www.npmjs.com/package/zod) 4 | Schemas and validation | MIT |
| [hono](https://www.npmjs.com/package/hono), [@hono/node-server](https://www.npmjs.com/package/@hono/node-server) | The verifier's HTTP server | MIT |
| [@stellar/stellar-base](https://www.npmjs.com/package/@stellar/stellar-base) 15 | Keys and signatures (via Witness core) | Apache-2.0 |
| [@stellar/stellar-sdk](https://www.npmjs.com/package/@stellar/stellar-sdk) 16 | RPC, transactions and the contract client | Apache-2.0 |
| [@x402/core](https://www.npmjs.com/package/@x402/core), [@x402/stellar](https://www.npmjs.com/package/@x402/stellar) | x402 v2 headers and facilitator client (seller); x402 client and the `exact` scheme (agent) | Apache-2.0 |
| TypeScript, Vitest, ESLint, Prettier, Changesets | Development only, not shipped | Apache-2.0 / MIT |

Ideas used without copying code (Ficha, Vespi, BookerBob) and the Pollar integration (public SDK
only; Pollar Studio has no license, so none of its code is used) are credited in [NOTICE](../NOTICE).

### Contributing under this license

Under section 5 of the license, anything you submit in a pull request is licensed under Apache-2.0,
the same as the rest of the repo. There is no separate contributor license agreement.
