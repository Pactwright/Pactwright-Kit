# agent-node example

Smallest working autonomous buyer using `@pactwright/agent` (ROADMAP K-15).

Initiates an automated pact purchase against a seller endpoint, generates deterministic nonces and `pact_id`, sends payment credentials, verifies the returned `X-Pactwright-Delivery` receipt, and tracks the pact lifecycle.

## Prerequisites

1. An agent account funded with testnet USDC.
   - You can create and fund an agent account using the CLI:
     ```bash
     pnpm --filter @pactwright/cli run pactwright agent-create --sponsor-secret <sponsor-secret>
     ```

## Configuration

Set the environment variables (e.g., in `.env`):

```bash
AGENT_SECRET_KEY=S...                 # Agent Stellar signing secret
SELLER_URL=http://localhost:4000/translate?to=es
STELLAR_NETWORK=testnet
FACILITATOR_URL=https://testnet.facilitator.stellar.org
```

## Running the Buyer Agent

1. Ensure the seller service is running (e.g., `examples/seller-express`).
2. Run the agent:

```bash
pnpm --filter @pactwright/example-agent-node run start
```

Or directly:
```bash
node examples/agent-node/src/index.ts
```

The buyer agent requests the protected endpoint, processes the 402 challenge, pays through the configured payment provider, checks the returned delivery receipt, and prints the pact summary.

> **Payments.** By default `buy` pays with the agent's wallet over x402: a signed USDC transfer
> for M0 (`exact`) or a signed `pact.open` for M2 (`pact`). The agent signs only auth entries; the
> seller's facilitator pays the fee. Pass `payment` to `runAgentBuyer` to use your own provider.