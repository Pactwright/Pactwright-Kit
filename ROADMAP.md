# pactwright-kit — Roadmap

> **⚠ Every contribution updates this file:** task status, progress counts and one
> Update log line. CI (`roadmap-check`) fails PRs that don't. Rules: [`AGENTS.md`](AGENTS.md) §1.
> Task IDs are global; the master roadmap lives in the Pactwright workspace and is synced weekly (XC-12).

| | |
|---|---|
| Last updated | 2026-10-28 |
| Progress | **10 / 52 tasks (19%)** |

Legend: `[ ]` todo · `[~]` in progress · `[x]` done · `[-]` dropped (ADR) · owner `core`/`wave` · size `T`/`M`/`H`.

## Progress summary

| Section | Tasks | Done | % |
|---|---|---|---|
| Foundations (this repo) | 7 | 4 | 57% |
| Phase 3 — Kit | 17 | 4 | 24% |
| Phase 4 — Verifier | 11 | 2 | 18% |
| Phase 7 — v1 | 10 | 0 | 0% |
| Phase 9 — v2 | 7 | 0 | 0% |

## Foundations (this repo)

Repo-level setup tasks.

- [x] **F-02** Create the 3 repos with licenses (contracts MIT, kit Apache-2.0, studio MIT), README skeleton, `NOTICE` crediting all 7 projects — core · T · F-01 · project_structure §6 (pushed, 2026-10-28)
- [x] **F-03** Add `ROADMAP.md`, `AGENTS.md`, `CONTRIBUTING.md` (with the roadmap rule) and copies of the 4 design docs to each repo — core · T · F-02 · Done when: every repo states the roadmap rule. (pushed, 2026-10-28)
- [~] **F-04** Labels (`Stellar Wave`, `complexity:*`, `area:*`, `good first issue`, `core-team-only`), issue template, PR template with a "ROADMAP.md updated" checkbox — core · T · F-02 · project_structure §7
- [~] **F-05** `roadmap-check` CI workflow in all 3 repos: fails a PR that doesn't modify `ROADMAP.md` — core · M · F-02 · Done when: a PR without a roadmap change fails CI.
- [x] **F-06** `CODEOWNERS` for core-team-only paths — core · T · F-02 · project_structure §7 (#67, 2026-10-28)
- [x] **F-07** OpenSSF Scorecard, Dependabot, branch protection (CI + review required) — core · T · F-02 (#67, 2026-10-28)
- [ ] **F-14** `@accensa/sdk` is not published on npm (404 on 2026-10-28): publish it from `accensa-app` or vendor it into the kit — core · M · — · K-07 · Done when: `@pactwright/seller` can depend on it.

## Phase 3 — Kit

SDK, MCP and CLI for M0 and M2.

- [x] **K-01** Workspace: pnpm, Node 24, strict TS, lint, Vitest, changesets, `.env.example` — wave · M · F-02 (#65, 2026-10-28)
- [x] **K-02** `core/schemas.ts`: `PactwrightExtra` v2, `Certificate`, enums — wave · M · K-01 · ARCH §7.2 (#65, 2026-10-28)
- [ ] **K-03** `core/hashing.ts` + `vectors.test.ts` against the pinned contracts release — core · H · C-18 · ADR-015
- [x] **K-04** `core/merkle.ts`, `amounts.ts`, `network.ts` (fails on incomplete config) — wave · M · K-02 (#65, 2026-10-28)
- [ ] **K-05** `contracts-client` generated from release bindings — wave · T · C-18
- [ ] **K-06** `seller`: 402 builder, Express middleware, signed `X-Pactwright-Delivery`, refuse terminal pacts, startup checks — core · H · K-03 · FR-P1, FR-V2
- [ ] **K-07** `seller` hooks: `createSettleHook()`, M0 `RefundVault.refund` on DENY/partial, M2 auto-settle on ALLOW — wave · H · K-06, C-15 · FR-S5
- [ ] **K-08** `agent`: client, M0 `buy`, idempotency → nonce, `await`, `certificate` — core · H · K-03 · FR-P2, FR-P5
- [ ] **K-09** `agent`: M2 `buy` via the `pact` scheme — core · H · K-08, X-03
- [ ] **K-10** `agent/accounts.ts`: create agent with sponsored reserves + USDC trustline; top-up — wave · H · K-08 · FR-A1…A3
- [ ] **K-11** MCP server with `find_sellers`, `buy`, `get_pact`, `dispute`, `get_certificate` — wave · H · K-09 · FR-I2
- [ ] **K-12** CLI: `verify`, `pact`, `agent-create`, `agent-topup` — wave · M · K-10 · FR-V9
- [ ] **K-13** Adapters: `types.ts`, `discovery-bazaar`, `reputation-identity`, `gate-manual`, `wallet-keypair`, `verifier-witness` — wave · M · K-02 · ARCH §8.6
- [x] **K-14** Vendor `@witness/core` under `vendor/witness-core/` with NOTICE — wave · T · K-01 (#65, 2026-10-28)
- [ ] **K-15** Examples: `seller-express`, `agent-node` — wave · M · K-09
- [ ] **K-16** `e2e-testnet.yml` nightly covering every MVP scenario in ARCH §13 — wave · H · K-09, V-10, S-04
- [ ] **K-17** Publish `@pactwright/*` 0.1.0 to npm — core · T · K-16

## Phase 4 — Verifier

Trustworthy, reproducible verdicts for one condition kind.

- [x] **V-01** Hono server, `/health`, `/v1/envelopes/:sha256`, store with unique `(pact_id, milestone)` — wave · M · K-01 (#65, 2026-10-28)
- [ ] **V-02** Pipeline: delivery-receipt check, evidence hash check — core · H · K-03 · FR-V2, FR-V3
- [ ] **V-03** Provider-neutral LLM adapter (`models/llm.ts`): provider + model pinned in config, explicit effort where supported, structured output; no sampling params; refusal → no verdict; provider, model ID, effort + raw-output hash in the envelope — wave · M · V-01 · FR-V5
- [x] **V-04** `rules/document-translation.ts` deterministic rules, with partial `amount` — wave · H · V-03 · FR-V4 (#65, 2026-10-28)
- [ ] **V-05** `sign.ts`: verdict-v1 envelope + one attestation per pact — core · H · V-02 · FR-V8
- [ ] **V-06** `submit.ts`: `record_verdict` / `release` via `/pact/submit` — wave · M · V-05, X-04
- [ ] **V-07** `non-delivery.ts`: seller webhook challenge → DENY on timeout — wave · H · V-05 · FR-V6
- [ ] **V-08** Eval set (≥ 50 labelled cases) + accuracy script + `verifier-eval.yml` (fails < 90%) — wave · H · V-04
- [ ] **V-09** `verify.minAmount` handling (receipt-only below threshold) — wave · M · V-05 · FR-V7
- [ ] **V-10** Dockerfile; deploy the testnet verifier — core · M · V-06
- [ ] **V-11** Measure verification latency; set default deadline lengths; answer Q6 — core · M · V-10 · Q6

## Phase 7 — v1

Metering, disputes, Hono, KMS, privacy, add-ons.

- [ ] **P7-02** `agent/meter-loop.ts`: cumulative vouchers, never beyond cap — wave · H · P7-01 · FR-M2
- [ ] **P7-03** `seller/hooks/meter.ts`: keep latest voucher, `close_meter` — wave · M · P7-01 · FR-M1
- [ ] **P7-04** `examples/metered-minutes`: Ficha-style pay-per-minute demo (credit Ficha) — wave · H · P7-02, P7-03 · FR-X1
- [ ] **P7-05** Verifier dispute milestones (`dispute-<n>`) within the refund window — wave · H · V-05 · FR-S6
- [ ] **P7-06** Dispute → `RefundVault` refund flow in the seller middleware; `Refunded` receipts — wave · M · P7-05
- [ ] **P7-07** Hono middleware — wave · M · K-06 · FR-I3
- [ ] **P7-08** Seller keys from KMS — core · M · K-07 · FR-S7
- [ ] **P7-09** Evidence privacy: retention, redaction hook, disclosure text — wave · M · V-02 · FR-V10
- [ ] **P7-12** `gate-vespi` adapter: Vespi approves the budget — wave · H · K-13, F-08 · FR-A4
- [ ] **P7-13** `wallet-pollar` adapter: principal funds the agent from Pollar; answer Q1 — wave · H · K-13, F-09 · FR-A4

## Phase 9 — v2



- [ ] **P9-01** `reputation-bookerbob` adapter; answer Q2 — wave · H · K-13, F-08 · FR-D3, Q2
- [ ] **P9-02** Proof-of-purchase hook: batched, delayed, shuffled `add_member`; privacy model doc — core · H · P9-01 · FR-X3
- [ ] **P9-03** Reputation weighting (unique buyers, age, amount; self-dealing excluded) — wave · H · P9-01 · FR-D3
- [ ] **P9-04** Smart-account agent wallets with true revoke — core · H · K-10 · FR-A5
- [ ] **P9-07** Switch to a published `@witness/core` if available; answer Q3 — wave · T · K-14 · Q3
- [ ] **P9-08** Hono/Express parity docs and migration guide for sellers — wave · M · P7-07
- [ ] **P9-09** Second condition kind in the verifier (picked from seller demand) + eval set — wave · H · V-08

## Update log

| Date | PR / change | Tasks | Summary |
|---|---|---|---|
| 2026-10-28 | #67 | F-06, F-07 → `[x]` | README rewritten to explain the kit: why it exists, how the pieces fit (sequence diagram), per-package status (working / interface only / planned), how the verifier decides (model reads, code decides; `document.translation` criteria and pro-rata payment), HTTP API, core usage, configuration, FAQ, and a full License section (Apache-2.0 terms, why Apache-2.0, third-party licenses). Logo assets added. CODEOWNERS, Scorecard and branch protection are live. |
| 2026-10-28 | scorecard + teams | F-06, F-07 → `[~]` | OpenSSF Scorecard workflow and badge; CODEOWNERS uses `@Pactwright/maintainers` / `@Pactwright/core`; branch-protection and Dependabot policy in CONTRIBUTING. Done once all three repos merge and protection is on (Pactwright-contracts#58). |
| 2026-10-28 | #65 | K-01, K-02, K-04, K-14, V-01, V-04 → `[x]` | Lint + publish build (`source` export condition); every schema tested + TS↔Rust map; Merkle (odd nodes promoted, Accensa's 14 vectors pass), exact amounts, strict network config; Witness core vendored unmodified with its tests; verifier config/store/HTTP API (409 on duplicate verdicts); document.translation rules (pro-rata partials). 231 tests. |
| 2026-10-28 | initial push | F-02, F-03 → `[x]` | Repo published to github.com/Pactwright with licenses, NOTICE, README, CONTRIBUTING, AGENTS.md and design docs. |
| 2026-10-28 | scaffold | F-02…F-06, K-01, K-02 → `[~]` | pnpm workspace, 7 packages + verifier service with typed stubs; `schemas.ts` data model with 2 passing tests; typecheck passes. |
| 2026-10-28 | scaffold | — | Repo scaffolded: structure, data models, stubs |
