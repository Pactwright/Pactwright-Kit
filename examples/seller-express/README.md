# seller-express example

Smallest working protected seller endpoint using Express and `@pactwright/seller` (ROADMAP K-15).

Protects a `/translate` route with HTTP 402, verifies `X-PAYMENT` and `X-Pactwright-Pact` headers, and automatically signs the `X-Pactwright-Delivery` receipt over the response body.

## Prerequisites

1. Stellar testnet account for the seller with funded testnet USDC trustline.
2. Seller delivery key (ed25519 seed).

## Configuration

Set the environment variables (e.g., in `.env`):

```bash
PORT=4000
STELLAR_NETWORK=testnet
SELLER_ADDRESS=G...                      # Seller Stellar public address
SELLER_DELIVERY_KEY=<64-hex-or-seed>     # Ed25519 seed for delivery receipts
VERIFIER_URL=https://verifier.pactwright.dev
PACT_CONTRACT_ID=CDUXJJUNMFEV6...        # Deployed testnet pact contract
```

## Running the Seller

```bash
pnpm --filter @pactwright/example-seller-express run start
```

Or directly:
```bash
node examples/seller-express/src/index.ts
```

The seller will listen on `http://localhost:4000`.

## Endpoints

- `GET /health`: Returns `{ ok: true, seller: "G..." }`.
- `GET /translate?to=es&text=Hello`: Protected endpoint.
  - Returns `402 Payment Required` when requested without payment credentials.
  - With valid payment headers, returns `200 OK` with the translated result and `X-Pactwright-Delivery` header.
