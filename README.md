<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="brand/pactwright-logo-dark.svg">
    <img alt="Pactwright" src="brand/pactwright-logo-light.svg" width="460">
  </picture>
</p>

<p align="center">
  <b>The TypeScript side of Pactwright: SDK, seller middleware, MCP tools and the verifier.</b><br>
  Everything an agent or a seller needs to use pacts, the escrow for AI-agent purchases on Stellar.
</p>

<p align="center">
  <a href="https://github.com/Pactwright/Pactwright-Kit/actions/workflows/ci.yml"><img src="https://img.shields.io/badge/tests-179_passing-2DD4BF?style=for-the-badge&labelColor=0B1220" alt="179 tests passing"></a>
  <a href="#what-works-today"><img src="https://img.shields.io/badge/status-early-F59E0B?style=for-the-badge&labelColor=0B1220" alt="Early stage"></a>
  <a href="https://github.com/Pactwright/Pactwright-contracts"><img src="https://img.shields.io/badge/contract-testnet-6366F1?style=for-the-badge&labelColor=0B1220" alt="Contract on testnet"></a>
  <a href="#license"><img src="https://img.shields.io/badge/license-Apache--2.0-94A3B8?style=for-the-badge&labelColor=0B1220" alt="Apache-2.0 license"></a>
</p>

<p align="center">
  <a href="#in-60-seconds"><b>In 60 seconds</b></a> ·
  <a href="#how-the-pieces-fit"><b>How the pieces fit</b></a> ·
  <a href="#what-works-today"><b>What works today</b></a> ·
  <a href="#the-verifier"><b>The verifier</b></a> ·
  <a href="#license"><b>License</b></a> ·
  <a href="https://github.com/Pactwright/Pactwright-contracts">Contracts</a> ·
  <a href="https://github.com/Pactwright/Pactwright-studio">Studio</a>
</p>

<p align="center">
  <a href="https://scorecard.dev/viewer/?uri=github.com/Pactwright/Pactwright-Kit"><img src="https://api.scorecard.dev/projects/github.com/Pactwright/Pactwright-Kit/badge" alt="OpenSSF Scorecard"></a>
</p>

> [!IMPORTANT]
> **Early stage.** The core library and the verifier's HTTP service and decision rules work and
> are tested. The buyer runtime, seller middleware, MCP tools and CLI have their interfaces in
> place but are not implemented yet. [What works today](#what-works-today) shows the status of
> each piece. Nothing is published to npm yet.

## Contents

1. [In 60 seconds](#in-60-seconds)
2. [Why this exists](#why-this-exists)
3. [How the pieces fit](#how-the-pieces-fit)
4. [What works today](#what-works-today)
5. [Packages](#packages)
6. [The verifier](#the-verifier)
7. [The core library](#the-core-library)
8. [Clone, build and test](#clone-build-and-test)
9. [Configuration](#configuration)
10. [Layout](#layout)
11. [Project status](#project-status)
12. [FAQ](#faq)
13. [Built on](#built-on)
14. [Contributing](#contributing)
15. [License](#license)

## In 60 seconds

- **What a pact is.** An AI agent's purchase held in escrow on Stellar. The buyer locks a cap, a verifier checks the delivery against a condition frozen before payment, and the seller is paid only what the verdict allows. The rest returns to the buyer. The contract is in [Pactwright-contracts](https://github.com/Pactwright/Pactwright-contracts) and runs on testnet.
- **What this repo is.** The off-chain code around that contract. It covers the agent that buys, the seller that sells, and the verifier that judges.
- **What runs today.**
  - `@pactwright/core`: schemas, exact amount conversion, Merkle proofs that match Accensa's `ReceiptAnchor`, network configuration.
  - `services/verifier`: an HTTP service with one verdict per pact and milestone, plus the deterministic `document.translation` rules, including pro-rata payment for partial delivery.
- **How it's checked.** 179 tests of the Kit's own code run in CI, plus the 52 tests that ship with the vendored Witness core. Merkle proofs are tested against Accensa's own conformance vectors.

## Why this exists

AI agents can already pay over HTTP with [x402](https://developers.stellar.org/docs/build/agentic-payments/x402):
the seller answers `402 Payment Required`, the agent pays in USDC and retries. But once the money
moves, the agent has no way to get it back if the delivery is wrong, partial or missing.

The [`pact` contract](https://github.com/Pactwright/Pactwright-contracts) fixes that on-chain. To use
it, though, an agent, a seller and a verifier each need code that speaks the same formats. They have
to hash the condition the same way, sign the same bytes and agree on what a delivery receipt is.
This kit is that shared code, so neither side has to re-implement the protocol and get a byte wrong.

| Who | What they get from the kit |
|---|---|
| **Agent builders** | `@pactwright/agent` and `@pactwright/mcp`: find a seller, open a pact, wait for the verdict and keep the certificate. Available as a library or as tools an LLM agent can call |
| **Sellers** | `@pactwright/seller`: one middleware call turns an x402 route into a pact-protected route with terms, delivery receipts and settlement |
| **Verifier operators** | `services/verifier`: a model reads the delivery, deterministic rules decide, and every verdict is a signed, re-checkable envelope |
| **Everyone** | `@pactwright/core`: the schemas, hashing, amounts and Merkle code all of the above share |

## How the pieces fit

```mermaid
sequenceDiagram
    autonumber
    participant A as Agent<br/>(@pactwright/agent)
    participant S as Seller<br/>(@pactwright/seller)
    participant V as Verifier<br/>(services/verifier)
    participant P as pact contract<br/>(Pactwright-contracts)
    participant St as Studio<br/>(Pactwright-studio)
    A->>S: request
    S-->>A: 402 + pact terms (condition, verifier, deadlines)
    A->>P: open: lock the cap
    S-->>A: delivery + signed delivery receipt
    A->>V: POST /v1/verdicts with the evidence
    V->>P: record_verdict (signed attestation)
    S->>P: settle (rest returns to the agent)
    P-->>St: events
    St->>St: index, batch receipts, anchor on-chain
    A->>St: fetch the certificate
```

1. The **seller middleware** answers `402` with the pact terms: the condition, the verifier's key and the deadlines.
2. The **agent** checks the terms, freezes the condition hash and opens the pact, which locks the cap in escrow.
3. The **seller** delivers and signs a receipt over the exact bytes delivered.
4. The **verifier** has a model read the delivery, applies deterministic rules, and signs a verdict envelope (Witness format) plus an on-chain attestation.
5. The **contract** pays the seller what the verdict allows and returns the rest.
6. **Studio** indexes the events and anchors a receipt, so the agent gets a certificate anyone can verify.

## What works today

| Piece | Status | What's there |
|---|---|---|
| `@pactwright/core`: schemas | ✅ Working | `PactwrightExtra` (the `402` terms), `PactTerms`, attestations, usage vouchers, delivery receipts, certificates. Zod-validated |
| `@pactwright/core`: amounts | ✅ Working | Exact decimal ↔ stroops conversion, with no floating point anywhere |
| `@pactwright/core`: Merkle | ✅ Working | Sorted-pair SHA-256 trees and proofs, identical to Accensa `ReceiptAnchor` and tested against its vectors |
| `@pactwright/core`: network | ✅ Working | Refuses to start on missing or inconsistent config, so a service can't silently fall back to testnet |
| `@pactwright/core`: hashing | 🚧 Interface only | `pactId`, `conditionHash`, signed-message builders. Must match the contract's [test vectors](https://github.com/Pactwright/Pactwright-contracts/tree/main/test-vectors) byte for byte (K-03) |
| `services/verifier`: HTTP service | ✅ Working | `/health`, `/v1/verdicts`, `/v1/envelopes/:sha256`; one verdict per pact and milestone |
| `services/verifier`: `document.translation` rules | ✅ Working | Language, completeness and page-count checks; pro-rata payment for partial delivery |
| `services/verifier`: model → rules pipeline | 🚧 Interface only | Returns `501 not_implemented` until V-02 lands |
| `@pactwright/seller` | 🚧 Interface only | Route options are defined; middleware is K-05 |
| `@pactwright/agent` | 🚧 Interface only | `find → buy → await → certificate` is K-08 |
| `@pactwright/mcp`, `@pactwright/cli` | 📋 Planned | K-11, K-12 |
| `@pactwright/contracts-client` | 📋 Planned | Generated from the contract's TypeScript bindings |
| `@pactwright/adapters` | 🚧 Interface only | Discovery, reputation (BookerBob), budget gate (Vespi), wallets (keypair, Pollar), verifier |

Every 🚧 and 📋 row has a task in [ROADMAP.md](ROADMAP.md), and most are open Drips Wave issues.

## Packages

| Package | For | Purpose |
|---|---|---|
| [`@pactwright/core`](packages/core) | Everyone | Schemas, hashing, Merkle, amounts, network config |
| [`@pactwright/contracts-client`](packages/contracts-client) | Agent, seller | Typed client for the `pact` contract |
| [`@pactwright/agent`](packages/agent) | Agent builders | Buyer runtime: find → buy → await → certificate, plus metered sessions |
| [`@pactwright/seller`](packages/seller) | Sellers | `pact(options)` middleware for x402 sellers |
| [`@pactwright/mcp`](packages/mcp) | LLM agents | MCP tools: `find_sellers`, `buy`, `get_pact`, `dispute`, `get_certificate` |
| [`@pactwright/adapters`](packages/adapters) | Integrators | Pluggable discovery, reputation, spending gate, wallet and verifier |
| [`@pactwright/cli`](packages/cli) | Operators | `pactwright verify`, `pact`, `agent-create`, `agent-topup` |
| [`services/verifier`](services/verifier) | Verifier operators | The Witness-compatible verifier service |

## The verifier

The verifier answers one question: did the delivery meet the condition the buyer and seller agreed
on before payment? Its design follows one rule from [Witness](https://github.com/fabian416/witness):
**the model reads, code decides.**

1. **The model reads.** An LLM turns the delivered document into a small structured reading, for example `{ detectedLanguage, pageCount, isTranslationOfSource, untranslatedSegments }`. It never decides anything.
2. **Code decides.** A pure rule function turns that reading and the frozen condition into ALLOW or DENY, plus an amount. The same inputs always give the same verdict, so anyone can re-run the rules on the stored reading.
3. **Everything is signed and kept.** The verdict is a Witness `verdict-v1` envelope. It records the criteria, reason codes, model ID and policy version, is signed with the verifier's key, and is retrievable by its hash.
4. **If the model refuses, there is no verdict.** The verifier doesn't guess. The pact falls back to its silence policy, which by default refunds the buyer.

### Example: `document.translation`

Condition, frozen before payment:

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
seller is paid 0.75 USDC and 0.25 USDC returns to the buyer.

### HTTP API

| Method | Path | Returns |
|---|---|---|
| `GET` | `/health` | `ok`, and the verifier's public key as a Stellar address and as hex (the key sellers put in their terms) |
| `POST` | `/v1/verdicts` | `201` with the envelope, its reference, the amount and the attestation. `409` if this pact and milestone already have a verdict. `202` with no verdict if the model refused. `400` on invalid input |
| `GET` | `/v1/envelopes/:sha256` | A stored envelope, so anyone can check a verdict |

`POST /v1/verdicts` takes the pact `terms`, at least one `evidence` item, an optional seller
`deliveryReceipt`, and a `milestone` (`delivery`, or `dispute-<n>` for later disputes).

## The core library

```ts
import { toStroops, fromStroops, buildTree, verifyProof, loadNetworkConfig } from "@pactwright/core";

toStroops("1.25");        // 12500000n  (USDC has 7 decimals)
fromStroops(7500000n);    // "0.75"

const tree = buildTree([leafA, leafB, leafC]);          // 32-byte hex leaves
verifyProof(leafA, tree.proofs.get(leafA)!, tree.root); // true, same result as ReceiptAnchor.verify_receipt

const network = loadNetworkConfig(process.env);         // throws, listing every problem, if incomplete
```

Amounts are decimal strings in TypeScript and `i128` stroops on-chain. They're converted in only
one place, `amounts.ts`, so a rounding bug can't hide anywhere else.

## Clone, build and test

Requires Node.js 24 and pnpm.

```bash
git clone https://github.com/Pactwright/Pactwright-Kit.git && cd Pactwright-Kit
pnpm install
pnpm typecheck      # also builds the vendored Witness core
pnpm test           # 179 Kit tests + 52 vendored Witness tests
pnpm lint
```

## Configuration

Services refuse to start when configuration is missing or inconsistent, and they list every problem
at once. Copy [`.env.example`](.env.example) and fill in what you run:

| Group | Variables |
|---|---|
| Network (all) | `STELLAR_NETWORK`, `STELLAR_NETWORK_PASSPHRASE`, `STELLAR_RPC_URL`, `USDC_SAC_ID`, `PACT_CONTRACT_ID`, `RECEIPT_ANCHOR_ID` |
| Facilitator | `FACILITATOR_URL`, `FACILITATOR_API_KEY` |
| Agent | `AGENT_SECRET_KEY` (testnet only), `SPONSOR_SECRET_KEY` |
| Seller | `SELLER_DELIVERY_KEY`, `SELLER_SIGNING_KEY_REF`, `SELLER_REFUND_VAULT_ID` |
| Verifier | `VERIFIER_SECRET_KEY`, `VERIFIER_PROVIDER`, `VERIFIER_MODEL`, `VERIFIER_EFFORT`, `VERIFIER_LLM_API_KEY`, `EVIDENCE_BUCKET_URL` |

The testnet contract addresses are in [Pactwright-contracts/DEPLOYMENTS.md](https://github.com/Pactwright/Pactwright-contracts/blob/main/DEPLOYMENTS.md).
The verifier's model provider is configurable, and the provider, model ID and effort are recorded in
every envelope.

## Layout

| Path | What |
|---|---|
| [`packages/`](packages) | The publishable libraries listed above |
| [`services/verifier`](services/verifier) | The verifier service: `server.ts`, `rules/`, `models/`, `pipeline.ts` |
| [`vendor/witness-core`](vendor/witness-core) | `@witness/core`, vendored unmodified (see [UPSTREAM.md](vendor/witness-core/UPSTREAM.md)) |
| [`packages/core/test/vectors`](packages/core/test/vectors) | Conformance vectors: Pactwright's own and Accensa's Merkle vectors |
| [`examples/`](examples) | `agent-node`, `seller-express`, `metered-minutes` (filled in as the packages land) |
| [`docs/`](docs) | PRD, architecture, essentials, project structure |

## Project status

| Phase | Done |
|---|---|
| Foundations | Workspace, strict TypeScript, CI, Scorecard, CODEOWNERS |
| Phase 3: Kit | Core schemas, amounts, Merkle, network config, vendored Witness |
| Phase 4: Verifier | HTTP service, verdict store, `document.translation` rules |
| Next | Hashing against the contract's vectors (K-03), seller middleware (K-05), agent runtime (K-08), verifier pipeline (V-02) |

[ROADMAP.md](ROADMAP.md) tracks every task and its progress. Every pull request updates it.

## FAQ

**Can I use this today?** You can use `@pactwright/core` and run the verifier service from this
repo. The agent and seller packages aren't usable yet. The [contract](https://github.com/Pactwright/Pactwright-contracts)
is live on testnet and has its own CLI tool for pact IDs and signatures.

**Why does the verifier use a model at all?** Because "is this a correct Portuguese translation?"
can't be checked by a hash. But the model only *reads*. The decision, and the amount paid, come from
plain rules you can audit and re-run.

**Which model does the verifier use?** It's configurable. The provider, model ID and reasoning effort
are recorded in every envelope, so a verdict can always be traced to what produced it.

**Does the verifier hold anyone's money?** No. It can only sign verdicts. The contract holds the
money, and a missing verdict falls back to the agreed silence policy.

**Why Apache-2.0 here when the contracts are MIT?** See [License](#license).

## Built on

| Project | What the kit uses | How |
|---|---|---|
| [Witness](https://github.com/fabian416/witness) | `verdict-v1` envelopes, criteria and reason codes, "model reads, code decides" | `@witness/core` vendored unmodified in `vendor/witness-core` |
| [Accensa](https://github.com/accensa) | `ReceiptAnchor` Merkle format, `RefundVault`, x402 facilitator | Merkle conformance vectors; M0 refunds and the facilitator `pact` scheme |
| [Vespi](https://github.com/andresanemic/vespi) | Human approval of agent spending | Budget-gate adapter (v1) |
| [BookerBob](https://github.com/hustle1hustle/bookerbob-hackmeridian-2026) | Proven-customer reputation | Reputation adapter (v2) |
| [Ficha](https://github.com/beto-rocha-blockchain/ficha-stellar) | Refunding unused units | Metered sessions with signed usage vouchers |
| [Pollar](https://docs.pollar.xyz) | Seedless wallets | Wallet adapter, through the public SDK only |

## Contributing

Read [CONTRIBUTING.md](CONTRIBUTING.md) and [AGENTS.md](AGENTS.md). Every pull request updates
[ROADMAP.md](ROADMAP.md): task status, progress counts and one Update log line. `main` is protected,
so pull requests need a review and green checks. Verifier signing code and the hashing module are
core-team paths (see `CODEOWNERS`).

## License

Pactwright-Kit is released under the **[Apache License 2.0](LICENSE)**.

```text
Copyright 2026 Pactwright contributors
```

### What Apache-2.0 means for you

| You may | You must | You get no |
|---|---|---|
| Use the code in open or closed-source projects, commercially or not | Include a copy of the license with any copy you distribute | Warranty of any kind |
| Modify it and distribute your changes | Mark files you changed with a notice that you changed them | Liability from the authors for losses, including funds lost through a bug |
| Sublicense and sell it | Keep the copyright, patent and attribution notices, including [NOTICE](NOTICE) | Right to use the Pactwright name or logo to endorse your product |
| Use any patents contributors hold on their contributions (explicit grant) | | Patent license if you sue anyone claiming the code infringes a patent (it ends) |

The no-warranty clause matters here because this code moves money and decides who gets paid. If you
run it, the risk is yours.

### Why Apache-2.0 and not MIT

The kit includes Witness core in [`vendor/witness-core`](vendor/witness-core), which is licensed under
Apache-2.0. Keeping the whole kit under Apache-2.0 means a single set of terms covers everything in
the repo, and it adds an explicit patent grant. That matters for an SDK that other companies build
products on. The contracts and Studio repos contain no Apache-2.0 code, so they use MIT.

| Repository | License |
|---|---|
| [Pactwright-contracts](https://github.com/Pactwright/Pactwright-contracts) | MIT |
| Pactwright-Kit (this repo) | Apache-2.0 |
| [Pactwright-studio](https://github.com/Pactwright/Pactwright-studio) | MIT |

### Third-party code and licenses

| Component | How it is used | License |
|---|---|---|
| [`@witness/core`](https://github.com/fabian416/witness) (commit `1f9a8e2`) | Vendored unmodified in `vendor/witness-core`. It has its own LICENSE and NOTICE, and [UPSTREAM.md](vendor/witness-core/UPSTREAM.md) records the exact source | Apache-2.0 |
| Accensa Merkle conformance vectors | Test data in `packages/core/test/vectors/accensa` | MIT |
| [zod](https://www.npmjs.com/package/zod) 4 | Schemas and validation | MIT |
| [hono](https://www.npmjs.com/package/hono), [@hono/node-server](https://www.npmjs.com/package/@hono/node-server) | The verifier's HTTP server | MIT |
| [@stellar/stellar-base](https://www.npmjs.com/package/@stellar/stellar-base) 15 | Keys and signatures (via Witness core) | Apache-2.0 |
| TypeScript, Vitest, ESLint, Prettier, Changesets | Development only, not shipped | Apache-2.0 / MIT |

Ideas used without copying code (Ficha, Vespi, BookerBob) and the Pollar integration (public SDK
only; Pollar Studio has no license, so none of its code is used) are credited in [NOTICE](NOTICE).

### Contributing under this license

Under section 5 of the license, anything you submit in a pull request is licensed under Apache-2.0,
the same as the rest of the repo. There is no separate contributor license agreement.
