/** v1: Ficha-style pay-per-minute demo (credit: Ficha). ROADMAP P7-04. */
import { Keypair } from "@stellar/stellar-base";
import { createMeteredServer } from "./server.ts";
import { startMeteredClient } from "./client.ts";

export async function runMeteredDemo(): Promise<void> {
  const buyerKeypair = Keypair.random();
  const pactId = "33".repeat(32);

  console.log("=== Pactwright Metered Minutes Demo (credit: Ficha) ===");
  console.log(`Pact ID: ${pactId}`);
  console.log(`Buyer:   ${buyerKeypair.publicKey()}`);

  const server = createMeteredServer(pactId, buyerKeypair.publicKey());

  const client = startMeteredClient(
    pactId,
    buyerKeypair,
    "0.05", // 0.05 USDC per minute
    "0.25", // 0.25 USDC cap = max 5 minutes
    async (signed) => {
      console.log(`-> Voucher emitted: units=${signed.voucher.units}, sig=${signed.signature.slice(0, 16)}...`);
      await server.meterHook.onUsageVoucher(
        pactId,
        { units: signed.voucher.units, signature: signed.signature },
        buyerKeypair.publicKey(),
      );
    },
  );

  console.log("Streaming 3 minutes of service usage...");
  await client.loop.tick(1);
  await client.loop.tick(1);
  await client.loop.tick(1);

  const latest = server.meterHook.getLatestVoucher(pactId);
  console.log(`<- Server recorded highest voucher: ${latest?.units} minutes.`);
  client.loop.stop();
  console.log("Session completed successfully.");
}

if (process.argv[1]?.endsWith("index.ts") || process.argv[1]?.endsWith("index.js")) {
  runMeteredDemo().catch((err: unknown) => {
    console.error("Demo failed:", err);
    process.exit(1);
  });
}
