import { describe, it, expect } from "vitest";
import { Keypair } from "@stellar/stellar-base";
import { createMeteredServer } from "../src/server.ts";
import { startMeteredClient } from "../src/client.ts";

describe("examples/metered-minutes (P7-04)", () => {
  it("runs the full streaming pay-per-minute loop", async () => {
    const pactId = "44".repeat(32);
    const buyerKeypair = Keypair.random();

    const server = createMeteredServer(pactId, buyerKeypair.publicKey());
    const received: number[] = [];

    const client = startMeteredClient(
      pactId,
      buyerKeypair,
      "0.10",
      "0.40", // max 4 units
      async (signed) => {
        received.push(signed.voucher.units);
        try {
          await server.meterHook.onUsageVoucher(pactId, signed, buyerKeypair.publicKey());
        } catch (e) {
          console.error("ON_USAGE_VOUCHER_ERROR:", e);
        }
      },
    );

    await client.loop.tick(1);
    await client.loop.tick(2);

    expect(received).toEqual([1, 3]);
    expect(server.meterHook.getLatestVoucher(pactId)?.units).toBe(3);

    // Stop loop
    client.loop.stop();
    expect(client.loop.isActive()).toBe(false);
  });
});
