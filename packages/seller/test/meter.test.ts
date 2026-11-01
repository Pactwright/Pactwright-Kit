import { describe, it, expect } from "vitest";
import { Keypair } from "@stellar/stellar-base";
import { usageMessage } from "@pactwright/core";
import { createMeterHook } from "../src/hooks/meter.ts";

describe("MeterHook (P7-03)", () => {
  const pactId = "22".repeat(32);
  const buyer = Keypair.random();

  it("records and updates highest valid voucher", async () => {
    const hook = createMeterHook();

    const voucher1 = { pactId, units: 10 };
    const sig1 = buyer.sign(Buffer.from(usageMessage(voucher1))).toString("base64");

    const stored1 = await hook.onUsageVoucher(pactId, { units: 10, signature: sig1 }, buyer.publicKey());
    expect(stored1.units).toBe(10);
    expect(hook.getLatestVoucher(pactId)?.units).toBe(10);

    const voucher2 = { pactId, units: 25 };
    const sig2 = buyer.sign(Buffer.from(usageMessage(voucher2))).toString("base64");

    const stored2 = await hook.onUsageVoucher(pactId, { units: 25, signature: sig2 }, buyer.publicKey());
    expect(stored2.units).toBe(25);
    expect(hook.getLatestVoucher(pactId)?.units).toBe(25);
  });

  it("rejects invalid signature", async () => {
    const hook = createMeterHook();
    const wrongBuyer = Keypair.random();
    const sig = wrongBuyer.sign(Buffer.from("invalid")).toString("base64");

    await expect(
      hook.onUsageVoucher(pactId, { units: 10, signature: sig }, buyer.publicKey()),
    ).rejects.toThrow(/Invalid voucher signature/);
  });

  it("rejects non-increasing units", async () => {
    const hook = createMeterHook();
    const voucher = { pactId, units: 10 };
    const sig = buyer.sign(Buffer.from(usageMessage(voucher))).toString("base64");

    await hook.onUsageVoucher(pactId, { units: 10, signature: sig }, buyer.publicKey());

    // Send 10 again
    await expect(
      hook.onUsageVoucher(pactId, { units: 10, signature: sig }, buyer.publicKey()),
    ).rejects.toThrow(/must strictly increase/);
  });

  it("closes meter via facilitator", async () => {
    let calledUrl = "";
    let calledBody: unknown = null;

    const mockFetch: typeof fetch = async (url, init) => {
      calledUrl = String(url);
      calledBody = JSON.parse(String(init?.body));
      return new Response(JSON.stringify({ tx_hash: "tx_mock_closed" }), { status: 200 });
    };

    const hook = createMeterHook({
      facilitatorUrl: "https://test-facilitator.local",
      fetchImpl: mockFetch,
    });

    const voucher = { pactId, units: 42 };
    const sig = buyer.sign(Buffer.from(usageMessage(voucher))).toString("base64");
    await hook.onUsageVoucher(pactId, { units: 42, signature: sig }, buyer.publicKey());

    const result = await hook.closeMeter(pactId);
    expect(result.closed).toBe(true);
    expect(result.txHash).toBe("tx_mock_closed");
    expect(calledUrl).toBe("https://test-facilitator.local/pact/submit");
    expect(calledBody).toEqual({
      action: "close_meter",
      pact_id: pactId,
      units: 42,
      signature: sig,
    });
  });

  it("closes meter via facilitator submit response shape with apiKey", async () => {
    let authHeader: string | undefined;

    const mockFetch: typeof fetch = async (_url, init) => {
      authHeader = (init?.headers as Record<string, string>)?.["Authorization"];
      return new Response(JSON.stringify({ success: true, transaction: "tx_submit_shape" }), { status: 200 });
    };

    const hook = createMeterHook({
      facilitatorUrl: "https://test-facilitator.local",
      fetchImpl: mockFetch,
      apiKey: "secret_seller_key",
    });

    const voucher = { pactId, units: 100 };
    const sig = buyer.sign(Buffer.from(usageMessage(voucher))).toString("base64");
    await hook.onUsageVoucher(pactId, { units: 100, signature: sig }, buyer.publicKey());

    const result = await hook.closeMeter(pactId);
    expect(result.closed).toBe(true);
    expect(result.txHash).toBe("tx_submit_shape");
    expect(authHeader).toBe("Bearer secret_seller_key");
  });
});
