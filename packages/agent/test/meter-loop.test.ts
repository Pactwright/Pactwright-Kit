import { describe, it, expect } from "vitest";
import { Keypair } from "@stellar/stellar-base";
import { usageMessage } from "@pactwright/core";
import { startMeterLoop } from "../src/meter-loop.ts";

describe("startMeterLoop (P7-02)", () => {
  const pactId = "11".repeat(32);
  const keypair = Keypair.random();

  it("signs cumulative vouchers up to the cap", async () => {
    // 0.10 USDC per unit, 0.30 USDC cap (max 3 units)
    const loop = startMeterLoop(pactId, "0.10", "0.30", {
      signerKeypair: keypair,
    });

    const v1 = await loop.tick(1);
    expect(v1.voucher.units).toBe(1);
    expect(v1.voucher.pactId).toBe(pactId);

    // Verify signature
    const digest = usageMessage(v1.voucher);
    const valid = keypair.verify(Buffer.from(digest), Buffer.from(v1.signature, "base64"));
    expect(valid).toBe(true);

    const v2 = await loop.tick(2); // total 3 units
    expect(v2.voucher.units).toBe(3);
    expect(loop.getUnits()).toBe(3);

    // Further ticks exceed cap and throw
    await expect(loop.tick(1)).rejects.toThrow(/Meter cap exceeded/);
    expect(loop.getUnits()).toBe(3);
  });

  it("triggers onVoucher callback on every tick", async () => {
    const vouchers: number[] = [];
    const loop = startMeterLoop(pactId, "0.05", "0.20", {
      signerKeypair: keypair,
      onVoucher: (v) => {
        vouchers.push(v.voucher.units);
      },
    });

    await loop.tick(1);
    await loop.tick(1);
    expect(vouchers).toEqual([1, 2]);
    loop.stop();
    expect(loop.isActive()).toBe(false);
  });

  it("fires periodically with intervalMs", async () => {
    const vouchers: number[] = [];
    const loop = startMeterLoop(pactId, "0.01", "0.50", {
      signerKeypair: keypair,
      intervalMs: 15,
      onVoucher: (v) => {
        vouchers.push(v.voucher.units);
      },
    });

    await new Promise((r) => setTimeout(r, 65));
    loop.stop();
    expect(vouchers.length).toBeGreaterThanOrEqual(2);
  });

  it("serializes concurrent ticks with inFlight guard", async () => {
    let inFlightCount = 0;
    let maxConcurrent = 0;

    const loop = startMeterLoop(pactId, "0.01", "0.50", {
      signerKeypair: keypair,
      onVoucher: async () => {
        inFlightCount++;
        maxConcurrent = Math.max(maxConcurrent, inFlightCount);
        await new Promise((r) => setTimeout(r, 20));
        inFlightCount--;
      },
    });

    const [v1, v2] = await Promise.all([loop.tick(1), loop.tick(1)]);
    expect(maxConcurrent).toBe(1);
    expect(v1.voucher.units).toBe(1);
    expect(v2.voucher.units).toBe(1);
    loop.stop();
  });
});
