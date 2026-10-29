import { describe, it, expect, beforeEach } from "vitest";
import { Keypair } from "@stellar/stellar-base";
import { handleDisputeRefund } from "../src/hooks/dispute.ts";
import { clearRefundedRefs } from "../src/hooks/refund.ts";

describe("Dispute Refunds (P7-06)", () => {
  const pactId = "66".repeat(32);
  const buyer = Keypair.random().publicKey();

  const refundOptions = {
    refundVaultId: "CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA",
    submit: async () => ({ txHash: "cd".repeat(32), ledger: 200 }),
  };

  beforeEach(() => {
    clearRefundedRefs();
  });

  it("triggers refund on DENY and produces a valid Refunded receipt leaf", async () => {
    const res = await handleDisputeRefund({
      pactId,
      buyer,
      price: "1.00",
      verdict: "deny",
      envelopeHash: "77".repeat(32),
      ledger: 105,
    }, refundOptions);

    expect(res.refunded).toBe(true);
    expect(res.txHash).toBe("cd".repeat(32));
    expect(parseFloat(res.refundAmount)).toBe(1.0);
    expect(res.receiptLeaf).toMatch(/^[0-9a-fA-F]{64}$/);
  });

  it("triggers partial refund on partial verdict and produces leaf", async () => {
    const res = await handleDisputeRefund({
      pactId: "67".repeat(32),
      buyer,
      price: "1.00",
      verdict: "deny",
      allowedAmount: "0.40",
      envelopeHash: "88".repeat(32),
      ledger: 110,
    }, refundOptions);

    expect(res.refunded).toBe(true);
    expect(parseFloat(res.refundAmount)).toBe(0.6);
    expect(res.receiptLeaf).toMatch(/^[0-9a-fA-F]{64}$/);
  });
});
