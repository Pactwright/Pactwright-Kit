# pactwright-kit

**SDK, MCP server, CLI and verifier for Pactwright — accountable AI-agent purchases on Stellar.**

[![ci](https://github.com/Pactwright/Pactwright-Kit/actions/workflows/ci.yml/badge.svg)](https://github.com/Pactwright/Pactwright-Kit/actions/workflows/ci.yml)
[![OpenSSF Scorecard](https://api.scorecard.dev/projects/github.com/Pactwright/Pactwright-Kit/badge)](https://scorecard.dev/viewer/?uri=github.com/Pactwright/Pactwright-Kit)

> Status: scaffold. See [`ROADMAP.md`](ROADMAP.md).

| Package | Purpose |
|---|---|
| `@pactwright/core` | Schemas, hashing, Merkle, amounts, network config |
| `@pactwright/contracts-client` | Generated `pact` contract bindings |
| `@pactwright/agent` | Buyer runtime: find → buy → await → certificate |
| `@pactwright/seller` | `pact(options)` middleware for x402 sellers |
| `@pactwright/mcp` | MCP tools for agents |
| `@pactwright/adapters` | Discovery, reputation, gate, wallet, verifier adapters |
| `@pactwright/cli` | `pactwright verify | pact | agent-create | agent-topup` |
| `services/verifier` | Witness-compatible verifier |

## Quickstart
```bash
pnpm install
pnpm typecheck
pnpm test
```

## Contributing
Read [`CONTRIBUTING.md`](CONTRIBUTING.md). **Every PR updates [`ROADMAP.md`](ROADMAP.md).**
