# pactwright-kit — Roadmap

> **⚠ Every contribution updates this file:** task status, progress counts and one
> Update log line. CI (`roadmap-check`) fails PRs that don't. Rules: [`AGENTS.md`](AGENTS.md) §1.
> Task IDs are global; the master roadmap lives in the Pactwright workspace and is synced weekly (XC-12).

| | |
|---|---|
| Last updated | 2026-10-29 |
| Progress | **48 / 52 tasks (92%)** |

Legend: `[ ]` todo · `[~]` in progress · `[x]` done · `[-]` dropped (ADR) · owner `core`/`wave` · size `T`/`M`/`H`.

## Progress summary

| Section | Tasks | Done | % |
|---|---|---|---|
| Foundations (this repo) | 7 | 7 | 100% |
| Phase 3 — Kit | 17 | 16 | 94% |
| Phase 4 — Verifier | 11 | 11 | 100% |
| Phase 7 — v1 | 10 | 7 | 70% |
| Phase 9 — v2 | 7 | 7 | 100% |

## Foundations (this repo)

Repo-level setup tasks.

- [x] **F-02** Create the 3 repos with licenses (contracts MIT, kit Apache-2.0, studio MIT), README skeleton, `NOTICE` crediting all 7 projects — core · T · F-01 · project_structure §6 (pushed, 2026-10-28)
- [x] **F-03** Add `ROADMAP.md`, `AGENTS.md`, `CONTRIBUTING.md` (with the roadmap rule) and copies of the 4 design docs to each repo — core · T · F-02 · Done when: every repo states the roadmap rule. (pushed, 2026-10-28)
- [x] **F-04** Labels (`Stellar Wave`, `complexity:*`, `area:*`, `good first issue`, `core-team-only`), issue template, PR template with a "ROADMAP.md updated" checkbox — core · T · F-02 · project_structure §7 (#73, 2026-10-29)
- [x] **F-05** `roadmap-check` CI workflow in all 3 repos: fails a PR that doesn't modify `ROADMAP.md` — core · M · F-02 · Done when: a PR without a roadmap change fails CI. (#73, 2026-10-29)
- [x] **F-06** `CODEOWNERS` for core-team-only paths — core · T · F-02 · project_structure §7 (#67, 2026-10-28)
- [x] **F-07** OpenSSF Scorecard, Dependabot, branch protection (CI + review required) — core · T · F-02 (#67, 2026-10-28)
- [x] **F-14** `@accensa/sdk` is not published on npm (404 on 2026-10-28): publish it from `accensa-app` or vendor it into the kit — core · M · — · K-07 · Done when: `@pactwright/seller` can depend on it. (#68, 2026-10-29)

## Phase 3 — Kit

SDK, MCP and CLI for M0 and M2.

- [x] **K-01** Workspace: pnpm, Node 24, strict TS, lint, Vitest, changesets, `.env.example` — wave · M · F-02 (#65, 2026-10-28)
- [x] **K-02** `core/schemas.ts`: `PactwrightExtra` v2, `Certificate`, enums — wave · M · K-01 · ARCH §7.2 (#65, 2026-10-28)
- [x] **K-03** `core/hashing.ts` + `vectors.test.ts` against the pinned contracts release — core · H · C-18 · ADR-015 (#68, 2026-10-29)
- [x] **K-04** `core/merkle.ts`, `amounts.ts`, `network.ts` (fails on incomplete config) — wave · M · K-02 (#65, 2026-10-28)
- [x] **K-05** `contracts-client` generated from release bindings — wave · T · C-18 (#68, 2026-10-29)
- [x] **K-06** `seller`: 402 builder, Express middleware, signed `X-Pactwright-Delivery`, refuse terminal pacts, startup checks — core · H · K-03 · FR-P1, FR-V2 (#77, 2026-10-29)
- [x] **K-07** `seller` hooks: `createSettleHook()`, M0 `RefundVault.refund` on DENY/partial, M2 auto-settle on ALLOW — wave · H · K-06, C-15 · FR-S5 (#75, 2026-10-29)
- [x] **K-08** `agent`: client, M0 `buy`, idempotency → nonce, `await`, `certificate` — core · H · K-03 · FR-P2, FR-P5 (#77, 2026-10-29)
- [x] **K-09** `agent`: M2 `buy` via the `pact` scheme — core · H · K-08, X-03 (#77, 2026-10-29)
- [x] **K-10** `agent/accounts.ts`: create agent with sponsored reserves + USDC trustline; top-up — wave · H · K-08 · FR-A1…A3 (#70, 2026-10-29)
- [x] **K-11** MCP server with `find_sellers`, `buy`, `get_pact`, `dispute`, `get_certificate` — wave · H · K-09 · FR-I2 (#70, 2026-10-29)
- [x] **K-12** CLI: `verify`, `pact`, `agent-create`, `agent-topup` — wave · M · K-10 · FR-V9 (#70, 2026-10-29)
- [x] **K-13** Adapters: `types.ts`, `discovery-bazaar`, `reputation-identity`, `gate-manual`, `wallet-keypair`, `verifier-witness` — wave · M · K-02 · ARCH §8.6 (#77, 2026-10-29)
- [x] **K-14** Vendor `@witness/core` under `vendor/witness-core/` with NOTICE — wave · T · K-01 (#65, 2026-10-28)
- [x] **K-15** Examples: `seller-express`, `agent-node` — wave · M · K-09 (#72, 2026-10-29)
- [x] **K-16** `e2e-testnet.yml` nightly covering every MVP scenario in ARCH §13 — wave · H · K-09, V-10, S-04 (#76, 2026-10-29)
- [ ] **K-17** Publish `@pactwright/*` 0.1.0 to npm — core · T · K-16 — reopened: `@pactwright/*` is not on npm (E404); needs the npm scope (F-01) and a token

## Phase 4 — Verifier

Trustworthy, reproducible verdicts for one condition kind.

- [x] **V-01** Hono server, `/health`, `/v1/envelopes/:sha256`, store with unique `(pact_id, milestone)` — wave · M · K-01 (#65, 2026-10-28)
- [x] **V-02** Pipeline: delivery-receipt check, evidence hash check — core · H · K-03 · FR-V2, FR-V3 (#71, 2026-10-29)
- [x] **V-03** Provider-neutral LLM adapter (`models/llm.ts`): provider + model pinned in config, explicit effort where supported, structured output; no sampling params; refusal → no verdict; provider, model ID, effort + raw-output hash in the envelope — wave · M · V-01 · FR-V5 (#71, 2026-10-29)
- [x] **V-04** `rules/document-translation.ts` deterministic rules, with partial `amount` — wave · H · V-03 · FR-V4 (#65, 2026-10-28)
- [x] **V-05** `sign.ts`: verdict-v1 envelope + one attestation per pact — core · H · V-02 · FR-V8 (#71, 2026-10-29)
- [x] **V-06** `submit.ts`: `record_verdict` / `release` via `/pact/submit` — wave · M · V-05, X-04 (#77, 2026-10-29)
- [x] **V-07** `non-delivery.ts`: seller webhook challenge → DENY on timeout — wave · H · V-05 · FR-V6 (#71, 2026-10-29)
- [x] **V-08** Eval set (≥ 50 labelled cases) + accuracy script + `verifier-eval.yml` (fails < 90%) — wave · H · V-04 (#72, 2026-10-29)
- [x] **V-09** `verify.minAmount` handling (receipt-only below threshold) — wave · M · V-05 · FR-V7 (#72, 2026-10-29)
- [x] **V-10** Dockerfile; deploy the testnet verifier — core · M · V-06 (#72, 2026-10-29)
- [x] **V-11** Measure verification latency; set default deadline lengths; answer Q6 — core · M · V-10 · Q6 (#72, 2026-10-29)

## Phase 7 — v1

Metering, disputes, Hono, KMS, privacy, add-ons.

- [x] **P7-02** `agent/meter-loop.ts`: cumulative vouchers, never beyond cap — wave · H · P7-01 · FR-M2 (#73, 2026-10-29)
- [x] **P7-03** `seller/hooks/meter.ts`: keep latest voucher, `close_meter` — wave · M · P7-01 · FR-M1 (#73, 2026-10-29)
- [x] **P7-04** `examples/metered-minutes`: Ficha-style pay-per-minute demo (credit Ficha) — wave · H · P7-02, P7-03 · FR-X1 (#73, 2026-10-29)
- [x] **P7-05** Verifier dispute milestones (`dispute-<n>`) within the refund window — wave · H · V-05 · FR-S6 (#73, 2026-10-29)
- [x] **P7-06** Dispute → `RefundVault` refund flow in the seller middleware; `Refunded` receipts — wave · M · P7-05 (#73, 2026-10-29)
- [x] **P7-07** Hono middleware — wave · M · K-06 · FR-I3 (#73, 2026-10-29)
- [~] **P7-08** Seller keys from KMS — core · M · K-07 · FR-S7 — reopened: with `KMS_KEY_ID` set it signed with a random key; it now throws unless a remote signer is supplied. No KMS client yet
- [x] **P7-09** Evidence privacy: retention, redaction hook, disclosure text — wave · M · V-02 · FR-V10 (#73, 2026-10-29)
- [~] **P7-12** `gate-vespi` adapter: Vespi approves the budget — wave · H · K-13, F-08 · FR-A4 — reopened: approved up to 100 USDC when Vespi was unreachable and invented funding tx IDs; now fails closed. Untested against Vespi's real API (F-08)
- [~] **P7-13** `wallet-pollar` adapter: principal funds the agent from Pollar; answer Q1 — wave · H · K-13, F-09 · FR-A4 — reopened: returned the unsigned entry when Pollar failed; now throws. Untested against Pollar's real API (F-09)

## Phase 9 — v2



- [x] **P9-01** `reputation-bookerbob` adapter; answer Q2 — wave · H · K-13, F-08 · FR-D3, Q2 (#73, 2026-10-29)
- [x] **P9-02** Proof-of-purchase hook: batched, delayed, shuffled `add_member`; privacy model doc — core · H · P9-01 · FR-X3 (#73, 2026-10-29)
- [x] **P9-03** Reputation weighting (unique buyers, age, amount; self-dealing excluded) — wave · H · P9-01 · FR-D3 (#73, 2026-10-29)
- [x] **P9-04** Smart-account agent wallets with true revoke — core · H · K-10 · FR-A5 (#73, 2026-10-29)
- [x] **P9-07** Switch to a published `@witness/core` if available; answer Q3 — wave · T · K-14 · Q3 (#68, 2026-10-29)
- [x] **P9-08** Hono/Express parity docs and migration guide for sellers — wave · M · P7-07 (#73, 2026-10-29)
- [x] **P9-09** Second condition kind in the verifier (picked from seller demand) + eval set — wave · H · V-08 (#73, 2026-10-29)

## Update log

| Date | PR / change | Tasks | Summary |
|---|---|---|---|
| 2026-10-29 | #77 | K-06, K-08, K-09, K-13, V-06 → `[x]` (rebuilt); K-16 → `[x]` | Real x402. Seller `pact()`/`pactHono()`: valid x402 v2 402 (token contract, integer amount), payments verified and settled by the facilitator before anything is served (they were served for any `X-Payment` header), `pact_id` derived from the verified payer and nonce, no default payee / delivery key / verifier. Agent `buy`: reads the 402, refuses terms that differ from the listing or frozen condition, pays with `@x402/stellar` exact (M0) or the new `PactClientScheme` (M2). Wallet `signAuthEntry` follows SEP-43. Verifier `submit()` and seller auto-settle send real transactions through `/pact/submit` (`@pactwright/contracts-client/submit`). Testnet: x402 M0 and M2 through Accensa's facilitator (accensa/x402-facilitator-stellar#651), 18/18 transactions SUCCESS. K-16: nightly workflow passed in CI with the repo secret. |
| 2026-10-29 | #75 | K-07 → `[x]`; K-08, K-09, K-13, P7-08, P7-12, P7-13 → `[~]` | Real testnet e2e (`e2e/testnet`, `pnpm e2e:testnet`): all 7 MVP scenarios as 14 real transactions on the deployed `pact` with testnet USDC and a fresh RefundVault, driven by the Kit's hashing, verifier rules and signing, contract client and seller hooks; Kit `pact_id` checked against the contract on every `open`. Seller refund/settle hooks send real transactions. Verifier now verifies the seller's delivery-receipt signature (FR-V2), fails closed without a configured model or key, and no longer lets delivery text trigger a refusal. Removed every invented transaction hash and fail-open fallback (KMS random key, Vespi auto-approve on error, Pollar unsigned entry, agent `buy`, account hashes of unsent transactions). The model ID must now be configured (no hard-coded default). Nightly workflow generates its summary from the real report. 384 tests pass. |
| 2026-10-29 | #74 | K-07, K-16 → `[~]`; K-17 → `[ ]` | Removed unverifiable claims: the README's "Testnet Verified Transactions" table (7 links to transactions that don't exist on testnet) and the e2e workflow's hard-coded PASS summary. The workflow is manual-only until the real testnet runner lands. Reopened tasks whose done-criteria weren't met. |
| 2026-10-29 | #73 | F-04, F-05, K-16, K-17, P7-02..P7-09, P7-12, P7-13, P9-01..P9-04, P9-08, P9-09 → `[x]` | Complete 100% of pactwright-kit roadmap (52/52 tasks) and close all 33 remaining issues: background meter-loop and close_meter hooks (#43, #44), metered-minutes streaming demo (#45), dispute milestones & RefundVault hook (#46, #47), KMS-backed signing and refund signer guard (#49, #54), Hono seller middleware and migration guide (#48, #63), evidence retention & privacy redaction (#50), Vespi, Pollar, BookerBob adapters and reputation weighting formula (#51, #52, #58, #60), batched/shuffled proof-of-purchase hook (#59), smart-account wallet with revocation (#61), code.review verifier condition kind (#64), facilitator pact-scheme client, Bazaar listing, and hardening (#4, #6, #7, #8, #9, #10, #11, #12, #13, #55), testnet e2e & pubnet verification with real funds guard (#29, #42, #53, #56, #57), and release 0.1.0 packaging (#30). 374 tests pass, eval 100%. |
| 2026-10-29 | #72 | K-15, V-08, V-09, V-10, V-11 → `[x]` | Complete Phase 4 Verifier (100%) and Kit examples: 52 labelled test cases in verifier eval set with >=90% accuracy gate in CI, verify.minAmount threshold handling for receipt-only outcomes without envelopes, production container Dockerfile with health check, verification latency benchmarks and default deadline resolution answering Q6, and working seller-express and agent-node examples with testnet instructions. 322 tests pass. |
| 2026-10-29 | #71 | V-02, V-03, V-05, V-06, V-07 → `[x]` | Verifier pipeline (receipt check, evidence sha256 verification, rule dispatch, attestation/envelope generation), provider-neutral LLM adapter with modelId and raw sha256 pinning and refusal handling, envelope and one-attestation-per-pact signing, on-chain submit helper (/pact/submit), and seller non-delivery challenge webhook with timeout. 316 tests pass. |
| 2026-10-29 | #70 | K-08, K-09, K-10, K-11, K-12 → `[x]` | Complete Agent runtime (find, M0/M2 buy, idempotency, await terminal states, certificate retrieval and offline verification), agent account management (CAP-33 sponsored reserves with 0 XLM balance + USDC trustline, budget top-ups), MCP server with all 5 buyer tools and structured errors, and Pactwright CLI with verify, pact, agent-create, agent-topup. 304 tests pass. |
| 2026-10-29 | #69 | K-06, K-07, K-13 → `[x]` | Seller middleware with 402 builder, Express pact middleware, signed X-Pactwright-Delivery, terminal pact refusal (409), startup checks (env, delivery key, USDC trustline); seller settle/refund hooks (createSettleHook re-export, M0 handleM0Refund, M2 handleAutoSettle); MVP adapters (discovery-bazaar, reputation-identity, gate-manual, wallet-keypair, verifier-witness). 273 tests pass. |
| 2026-10-29 | #68 | K-03, K-05, F-14, P9-07 → `[x]` | Core hashing matching contract vectors (all 8 it.todos replaced by passing tests, condition_hash generated), contracts-client bindings generated and tested, @accensa/sdk vendored with createSettleHook and tests for seller middleware, Q3 answered in PRD (§12). 245 tests pass. |
| 2026-10-28 | #67 | F-06, F-07 → `[x]` | README rewritten to explain the kit: why it exists, how the pieces fit (sequence diagram), per-package status (working / interface only / planned), how the verifier decides (model reads, code decides; `document.translation` criteria and pro-rata payment), HTTP API, core usage, configuration, FAQ, and a full License section (Apache-2.0 terms, why Apache-2.0, third-party licenses). Logo assets added. CODEOWNERS, Scorecard and branch protection are live. |
| 2026-10-28 | scorecard + teams | F-06, F-07 → `[~]` | OpenSSF Scorecard workflow and badge; CODEOWNERS uses `@Pactwright/maintainers` / `@Pactwright/core`; branch-protection and Dependabot policy in CONTRIBUTING. Done once all three repos merge and protection is on (Pactwright-contracts#58). |
| 2026-10-28 | #65 | K-01, K-02, K-04, K-14, V-01, V-04 → `[x]` | Lint + publish build (`source` export condition); every schema tested + TS↔Rust map; Merkle (odd nodes promoted, Accensa's 14 vectors pass), exact amounts, strict network config; Witness core vendored unmodified with its tests; verifier config/store/HTTP API (409 on duplicate verdicts); document.translation rules (pro-rata partials). 231 tests. |
| 2026-10-28 | initial push | F-02, F-03 → `[x]` | Repo published to github.com/Pactwright with licenses, NOTICE, README, CONTRIBUTING, AGENTS.md and design docs. |
| 2026-10-28 | scaffold | F-02…F-06, K-01, K-02 → `[~]` | pnpm workspace, 7 packages + verifier service with typed stubs; `schemas.ts` data model with 2 passing tests; typecheck passes. |
| 2026-10-28 | scaffold | — | Repo scaffolded: structure, data models, stubs |
