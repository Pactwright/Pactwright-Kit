# Metered-Minutes Example (Pay-Per-Minute Streaming)

This example demonstrates pay-per-minute streaming usage vouchers in Pactwright, crediting **Ficha** for the fundamental design idea: pay per unit used and refund the rest via signed usage vouchers (ADR-010, FR-X1, PRD §6).

## Architecture

1. **Buyer Agent** opens a metered pact with an upfront cap (e.g. 1.00 USDC cap at 0.05 USDC / minute).
2. The agent runs `startMeterLoop` in the background, emitting signed cumulative `UsageVoucher`s (`units: 1, 2, 3...`) as service is delivered.
3. The **Seller Service** uses `createMeterHook` to verify each voucher signature and keep the latest valid voucher.
4. When the session terminates (or cap is reached), the seller calls `closeMeter`, which executes `pact.close_meter` on Soroban via the facilitator `/pact/submit`.
5. The seller receives payment for the actual minutes served, and the remaining unspent deposit is automatically released back to the buyer!

## Running the Demo

```bash
# Run standalone demo
pnpm --filter @pactwright/example-metered-minutes start
```

## Credits
Special credit to the **Ficha** project for pioneering micro-metered signed usage vouchers on Soroban.
