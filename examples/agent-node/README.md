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

The buyer agent will request the protected endpoint, process the 402 challenge, create and sign the payment pact, verify the delivery receipt, and output the completed pact summary.
