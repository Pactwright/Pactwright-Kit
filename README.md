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
  <a href="https://github.com/Pactwright/Pactwright-Kit/actions/workflows/ci.yml"><img src="https://img.shields.io/badge/tests-364_passing-2DD4BF?style=for-the-badge&labelColor=0B1220" alt="364 tests passing"></a>
  <a href="#testnet-evidence"><img src="https://img.shields.io/badge/testnet_e2e-7_scenarios-2DD4BF?style=for-the-badge&labelColor=0B1220" alt="Every MVP scenario run on testnet"></a>
  <a href="https://github.com/Pactwright/Pactwright-contracts"><img src="https://img.shields.io/badge/contract-testnet-6366F1?style=for-the-badge&labelColor=0B1220" alt="Contract on testnet"></a>
  <a href="#license"><img src="https://img.shields.io/badge/license-Apache--2.0-94A3B8?style=for-the-badge&labelColor=0B1220" alt="Apache-2.0 license"></a>
</p>

<p align="center">
  <a href="https://pactwright.github.io/docs/"><b>Documentation</b></a> ·
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
> **Testnet only, not published yet.** Every MVP scenario runs as real Stellar testnet
> transactions through the Kit's own code, including full x402 purchases through Accensa's
> facilitator, and a verdict from the hosted verifier has been accepted on-chain
> ([evidence](#testnet-evidence)). [What works today](#what-works-today) shows each piece. Nothing is on npm yet.
> The full documentation is at **[pactwright.github.io/docs](https://pactwright.github.io/docs/)**.

## Contents

1. [In 60 seconds](#in-60-seconds)
2. [Why this exists](#why-this-exists)
3. [How the pieces fit](#how-the-pieces-fit)
4. [What works today](#what-works-today)
5. [Testnet evidence](#testnet-evidence)
6. [Packages](#packages)
7. [The verifier](#the-verifier)
8. [The core library](#the-core-library)
9. [Clone, build and test](#clone-build-and-test)
10. [Configuration](#configuration)
11. [Layout](#layout)
12. [Project status](#project-status)
13. [FAQ](#faq)
14. [Built on](#built-on)
15. [Contributing](#contributing)
16. [License](#license)

## In 60 seconds

- **What a pact is.** An AI agent's purchase held in escrow on Stellar. The buyer locks a cap, a verifier checks the delivery against a condition frozen before payment, and the seller is paid only what the verdict allows. The rest returns to the buyer. The contract is in [Pactwright-contracts](https://github.com/Pactwright/Pactwright-contracts) and runs on testnet.
- **What this repo is.** The off-chain code around that contract. It covers the agent that buys, the seller that sells, and the verifier that judges.
- **What runs today.** Hashing that matches the contract byte for byte, the verifier's rules, receipt checks and signing, the contract client, and the seller's on-chain refund and settle hooks. All seven MVP scenarios, plus two full x402 purchases, have run end to end on testnet: 18 real transactions, [linked below](#testnet-evidence).
- **How it's checked.** 364 tests of the Kit's own code run in CI (3 of them need Postgres, which CI provides), plus the 57 tests that ship with the vendored Witness core and Accensa SDK. Merkle proofs are tested against Accensa's conformance vectors. A nightly workflow repeats the testnet run.

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
| `@pactwright/core` | ✅ Working | Schemas, exact amounts, Merkle proofs matching `ReceiptAnchor`, network config, and hashing (`pactId`, condition hash, signed messages) that matches the contract. The testnet run checks the Kit's `pact_id` against the contract's on every `open` |
| `@pactwright/contracts-client` | ✅ Working | Generated from the contract's bindings; used by the testnet run for `open`, `record_verdict` and `release` |
| `services/verifier` rules and signing | ✅ Working | `document.translation` and `code.review` rules, verdict-v1 envelopes, one attestation per pact. The contract accepts its signatures on testnet |
| `services/verifier` receipt checks | ✅ Working | Verifies the seller's ed25519 signature over the pact and body hash, and that the body is in the evidence |
| `services/verifier` model reading | ✅ Real model | Provider-neutral adapter (OpenAI-compatible API), with timeouts and bounded retries. Fails closed: with no provider, model and key configured, it refuses rather than inventing a reading. **Real-model accuracy: 29/29 (100%)** on the labelled `document.translation` set with Google `gemini-3.5-flash-lite`, 2026-10-29 ([run](https://github.com/Pactwright/Pactwright-Kit/actions/runs/40897633766)) |
| `services/verifier` HTTP service | ✅ Working | `/health`, `/v1/verdicts`, `/v1/envelopes/:sha256`; one verdict per pact and milestone. Envelopes are kept in Postgres, so their links (which point at the service itself) keep resolving after a restart |
| Hosted verifier | ✅ Testnet | [`pactwright-verifier-testnet.onrender.com`](https://pactwright-verifier-testnet.onrender.com/health). A verdict it signed with the real model was accepted by `record_verdict` and settled ([evidence](#the-hosted-verifier)) |
| `@pactwright/seller` refund and settle hooks | ✅ Working | `RefundVault.refund` (M0, disputes) and `settle` (M2) sent as real transactions. A refund has been signed by a HashiCorp Vault transit key, so the seller key never leaves the KMS (`pnpm e2e:kms`) |
| `@pactwright/seller` middleware | ✅ Testnet | x402 v2 paywall: a valid 402, payments verified and settled by the facilitator before anything is served, `pact_id` derived from the verified payer, signed `X-Pactwright-Delivery`, one serve per pact (Express and Hono). No default payee, delivery key or verifier |
| `@pactwright/agent` accounts | 🧪 Tested offline | Sponsored agent accounts and top-ups, submitted through RPC; never returns the hash of an unsent transaction |
| `@pactwright/agent` buy | ✅ Testnet | x402: reads the 402, refuses terms that differ from the listing or the frozen condition, pays with `exact` (M0) or `pact` (M2), signing only auth entries |
| Facilitator `pact` scheme | ✅ Testnet | Merged in Accensa's facilitator ([#651](https://github.com/accensa/x402-facilitator-stellar/pull/651)) and hosted at `pactwright-facilitator-testnet.onrender.com`; the testnet run's x402 rows go through it |
| `@pactwright/mcp`, `@pactwright/cli` | 🧪 Tested offline | MCP tools and CLI commands; `buy` and `agent-*` inherit the status of the agent rows above |
| Adapters | ⚙️ Partner APIs | Vespi gate and Pollar wallet fail closed when their APIs are unreachable. Partner access is F-08 / F-09 |

## Testnet evidence

On 2026-10-29, every MVP scenario ran on Stellar testnet against the deployed
[`pact` contract](https://stellar.expert/explorer/testnet/contract/CDUXJJUNYFILEYHE3LITANJEKCDFERNAABOSG75OWATFVM776BCMFEV6) with real
testnet USDC and a fresh Accensa `RefundVault` ([`CCOYYFVZ…`](https://stellar.expert/explorer/testnet/contract/CCOYYFVZG3KA4JDPDZORTPR64QJWXO2YU2RORQ4ARA4W24YEVMG5GT3C)).
The Kit's own code did the work: core hashing, the verifier's rules and signing, the contract client,
and the seller's refund and settle hooks.

The two **x402** rows are the full purchase flow:
1. The Kit agent requests a resource from the Kit's `pact()` seller middleware and gets a 402.
2. The agent pays with its built-in x402 payment, signing only auth entries.
3. Accensa's x402 facilitator, hosted on testnet at `https://pactwright-facilitator-testnet.onrender.com` with the [`pact` scheme](https://github.com/accensa/x402-facilitator-stellar/pull/651), verifies the payment, pays the fee and settles it.
4. The seller serves the content with a delivery receipt, which is then checked like the verifier checks it.

For M2, the verdict and the seller's settle also go through the facilitator's `/pact/submit`.

| Scenario | Outcome | Step | Transaction |
|---|---|---|---|
| **M0 ALLOW** | ALLOW, seller keeps 1 | x402 exact payment to seller | [`38509ae3…`](https://stellar.expert/explorer/testnet/tx/38509ae3c467052fe517a7303543efc69e8fc9e1ae32022d31e729df3613b398) |
| **M0 DENY** | DENY, 1 refunded | x402 exact payment to seller | [`1b639eab…`](https://stellar.expert/explorer/testnet/tx/1b639eab020686ab11cf02961c53ae5aa2dc8dbd8afeab7aafc935a76f192bfb) |
|  |  | RefundVault.refund | [`2bc4f53d…`](https://stellar.expert/explorer/testnet/tx/2bc4f53d42160e6b03bdd53e818824c8a8634ad904f4ea2608f99510dbf579a3) |
| **M0 non-delivery** | DENY, 0.5 refunded | x402 exact payment to seller | [`b3b37888…`](https://stellar.expert/explorer/testnet/tx/b3b378880ea29951cd3185354e6542d6d6c6ec5dcfbe15a5fcdb263373e66441) |
|  |  | RefundVault.refund | [`d9b68052…`](https://stellar.expert/explorer/testnet/tx/d9b68052f92b3c108578d979e7625b9478c4934ca84e213838009100162794bc) |
| **M2 ALLOW** | ALLOW 0.75 of 1, settled | open (1 USDC locked in escrow) | [`a774fa79…`](https://stellar.expert/explorer/testnet/tx/a774fa79daa77a4eca3946aa52e137041b2743568ee2f96c9c0ceec1bbe10b6f) |
|  |  | record_verdict (ALLOW 0.75, verifier-signed) | [`15263e7c…`](https://stellar.expert/explorer/testnet/tx/15263e7cfd4b206b350aa3fc97e200e76984f07b7fde4b0dc5ed54d41c009dec) |
|  |  | settle (0.75 to seller, 0.25 back to buyer) | [`18ea30d9…`](https://stellar.expert/explorer/testnet/tx/18ea30d9838dbbaa774aeffc44c55abc91e79fc69659fcc81b73fda4f2b05496) |
| **M2 DENY** | DENY, full refund | open (1 USDC locked in escrow) | [`9a49c8fa…`](https://stellar.expert/explorer/testnet/tx/9a49c8fa14469a8ce788133d42b6d01d1b8091598ff8b13a9d45fe55a43768ce) |
|  |  | record_verdict (DENY, verifier-signed) | [`d53cc633…`](https://stellar.expert/explorer/testnet/tx/d53cc6336940ff01b7af6caab8f39dc8bd12ab43fda8eee76d52e355809e096a) |
|  |  | release (1 USDC back to buyer) | [`eae7c711…`](https://stellar.expert/explorer/testnet/tx/eae7c7118268818c9ff700a724647c0713295bd74e945f89f9c1aece572c7bcc) |
| **M2 silence** | no verdict, refunded by silence policy | open (1 USDC locked in escrow) | [`105581ce…`](https://stellar.expert/explorer/testnet/tx/105581cea5979e0c03a3bc635c2f55ffe8efe5f62a58a078004a597bab621d03) |
|  |  | release after the verdict deadline (silence = Refund) | [`2a4c579d…`](https://stellar.expert/explorer/testnet/tx/2a4c579d95861cbd4d6ae39e3d6d7956f5083fe5e16df20ee0a1d6224aee84fb) |
| **Dispute refund** | dispute-1: 2 of 4 pages, 0.5 refunded | RefundVault.refund (dispute-1) | [`79d22019…`](https://stellar.expert/explorer/testnet/tx/79d22019715f76cd500b85c1581415cad02878ec44d623fd5d35666a83b014b6) |
| **x402 M0 (exact)** | paid over x402, receipt verified | x402 exact payment (facilitator-paid fee) | [`f59c4181…`](https://stellar.expert/explorer/testnet/tx/f59c4181d418da5723255e61a8acdd37f11cdb40e9a3d3c5b07850ee7dce91be) |
| **x402 M2 (pact)** | ALLOW 1, settled; every fee paid by the facilitator | x402 pact.open (facilitator-paid fee) | [`a33591a1…`](https://stellar.expert/explorer/testnet/tx/a33591a1768b548516f1222d34167a37c17069eb377073f50e07f26cef8071b5) |
|  |  | record_verdict via /pact/submit | [`9d63a621…`](https://stellar.expert/explorer/testnet/tx/9d63a621dda5573a36a8eb2e8aab0f2715a14674e9804691799b0ca1b82fe895) |
|  |  | settle via /pact/submit (seller-signed) | [`51d659e4…`](https://stellar.expert/explorer/testnet/tx/51d659e4ee18c066088ec922202b3380d179909d2f8745f09b25f5878a2cb073) |

What isn't real here: the model's reading of each delivery is a fixture, so the verdict depends
only on the deterministic rules. The non-x402 rows send payments directly. The full report, with
buyer, seller and receipt leaves, is [`e2e/testnet/results/2026-10-29.json`](e2e/testnet/results/2026-10-29.json).

Run it yourself. The nightly workflow runs it too, x402 rows included, against the hosted facilitator:

```bash
E2E_VERIFIER_SECRET=S… E2E_FACILITATOR_URL=https://pactwright-facilitator-testnet.onrender.com pnpm e2e:testnet
```

### The hosted verifier

On 2026-10-29 the hosted verifier judged a real purchase with its real model (Google
`gemini-3.5-flash-lite`), and the contract accepted its signature. The script opened an escrow pact
with fresh accounts, committed the source and the delivered Portuguese translation to the public
[evidence store](https://github.com/Pactwright/pactwright-evidence), asked
`pactwright-verifier-testnet.onrender.com` for a verdict, then recorded it and settled. The script
never holds the verifier key, so the contract accepting the attestation shows the hosted service
signed it.

| Step | Ledger | Transaction |
|---|---|---|
| `open` (1 USDC locked) | 5453755 | [`b0103116…`](https://stellar.expert/explorer/testnet/tx/b01031165b23c378d3fa9f5c9befbee0b1a733d944a89e1ce13e17ff290d1a5d) |
| verdict: ALLOW 1 USDC, signed by the hosted verifier | issued at 5453756 | |
| `record_verdict` | 5453761 | [`0225f78b…`](https://stellar.expert/explorer/testnet/tx/0225f78b5c3e9b321e1fd5311bc54a61ca9904fa82dbd2b4aeb9f379bc8650db) |
| `settle` (1 USDC to the seller) | 5453762 | [`1f4ab38c…`](https://stellar.expert/explorer/testnet/tx/1f4ab38c3881892633c2dcf8d7c99c22bc49831d09512eb1b700e62e23e44924) |

The pact in Studio: [`40725564…5c55`](https://pactwright-studio-testnet.onrender.com/pact/4072556402d709463f7cb888a4a9e03b061d906f0b7ca5c49ebb2eec4e7d5c55).
Run it yourself (it needs write access to the evidence store) with
`GITHUB_TOKEN=… pnpm e2e:hosted-verifier --reporter=verbose`.

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
pnpm test           # 364 Kit tests + 57 vendored Witness and Accensa SDK tests
                    # (3 Postgres-store tests run when TEST_DATABASE_URL is set, as in CI)
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
| Seller | `SELLER_ADDRESS`, `SELLER_DELIVERY_KEY`, `VERIFIER_PUBLIC_KEY`, `VERIFIER_URL`, `SELLER_REFUND_VAULT_ID`; the signing key through `KMS_KEY_ID` (with `VAULT_ADDR`, `VAULT_TOKEN`), or `SELLER_SECRET_KEY` for development |
| Verifier | `VERIFIER_SECRET_KEY`, `VERIFIER_PROVIDER`, `VERIFIER_MODEL`, `VERIFIER_EFFORT`, `VERIFIER_LLM_API_KEY`, `LLM_BASE_URL`, `EVIDENCE_BUCKET_URL`, `STELLAR_RPC_URL`, `VERIFIER_PUBLIC_URL`, `DATABASE_URL` |

Every variable is explained in the [configuration reference](https://pactwright.github.io/docs/reference/configuration/). The testnet contract addresses are in [Pactwright-contracts/DEPLOYMENTS.md](https://github.com/Pactwright/Pactwright-contracts/blob/main/DEPLOYMENTS.md).
The verifier's model provider is configurable, and the provider, model ID and effort are recorded in
every envelope.

## Layout

| Path | What |
|---|---|
| [`packages/`](packages) | The publishable libraries listed above |
| [`services/verifier`](services/verifier) | The verifier service: `server.ts`, `rules/`, `models/`, `pipeline.ts` |
| [`vendor/witness-core`](vendor/witness-core) | `@witness/core`, vendored unmodified (see [UPSTREAM.md](vendor/witness-core/UPSTREAM.md)) |
| [`packages/core/test/vectors`](packages/core/test/vectors) | Conformance vectors: Pactwright's own and Accensa's Merkle vectors |
| [`e2e/testnet`](e2e/testnet) | The real testnet run of every MVP scenario, and its reports |
| [`examples/`](examples) | `agent-node`, `seller-express`, `metered-minutes` (filled in as the packages land) |
| [`docs/`](docs) | PRD, architecture, essentials, project structure |

## Project status

| Area | State |
|---|---|
| Core, contract client, verifier, seller hooks | Working, proven on testnet |
| Nightly testnet e2e | Runs every night against testnet (K-16). Testnet occasionally fails to confirm a transaction in time; a re-run then passes |
| Hosted verifier | Live on testnet; a verdict it signed was accepted on-chain (V-10) |
| Real-model accuracy | 29/29 on the labelled translation set (V-12) |
| Agent x402 payment | Working on testnet (K-08, K-09) |
| Facilitator `pact` scheme | Merged and hosted on testnet (X-01…X-08, L-08) |
| npm release | Not yet (K-17) |

[ROADMAP.md](ROADMAP.md) tracks every task and its progress. Every pull request updates it.

## FAQ

**Can I use this today?** On testnet, from this repo: the agent, the seller middleware, the verifier,
the contract client and the core library all work, as the [testnet evidence](#testnet-evidence) shows.
The hosted testnet facilitator at `pactwright-facilitator-testnet.onrender.com` speaks the `pact` scheme. Nothing is on
npm yet.

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
| `@accensa/sdk` | Vendored in `vendor/accensa-sdk`; the seller's settle hook | MIT |
| Accensa `refund_vault.wasm` v0.2.0 | Test fixture in `e2e/testnet/fixtures`, hash-checked; deployed fresh by each testnet run | MIT |
| [zod](https://www.npmjs.com/package/zod) 4 | Schemas and validation | MIT |
| [hono](https://www.npmjs.com/package/hono), [@hono/node-server](https://www.npmjs.com/package/@hono/node-server) | The verifier's HTTP server | MIT |
| [@stellar/stellar-base](https://www.npmjs.com/package/@stellar/stellar-base) 15 | Keys and signatures (via Witness core) | Apache-2.0 |
| [@stellar/stellar-sdk](https://www.npmjs.com/package/@stellar/stellar-sdk) 16 | RPC, transactions and the contract client | Apache-2.0 |
| [@x402/core](https://www.npmjs.com/package/@x402/core), [@x402/stellar](https://www.npmjs.com/package/@x402/stellar) | x402 v2 headers and facilitator client (seller); x402 client and the `exact` scheme (agent) | Apache-2.0 |
| TypeScript, Vitest, ESLint, Prettier, Changesets | Development only, not shipped | Apache-2.0 / MIT |

Ideas used without copying code (Ficha, Vespi, BookerBob) and the Pollar integration (public SDK
only; Pollar Studio has no license, so none of its code is used) are credited in [NOTICE](NOTICE).

### Contributing under this license

Under section 5 of the license, anything you submit in a pull request is licensed under Apache-2.0,
the same as the rest of the repo. There is no separate contributor license agreement.
