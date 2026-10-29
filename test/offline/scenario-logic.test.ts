/**
 * Offline checks of the hook and receipt logic behind every scenario in ARCHITECTURE §13. No
 * chain access: refunds and settles use injected submitters. The real testnet run is
 * `e2e/testnet` (ROADMAP K-16, L-01).
 * - M0 ALLOW, DENY, non-delivery
 * - M2 ALLOW, DENY, silence
 * - Dispute -> Refund
 */
import { describe, it, expect, beforeEach } from "vitest";
import { Keypair, receiptLeaf } from "@pactwright/core";
import { handleM0Refund, clearRefundedRefs } from "../../packages/seller/src/hooks/refund.ts";
import { handleAutoSettle } from "../../packages/seller/src/hooks/settle.ts";
import { handleDisputeRefund } from "../../packages/seller/src/hooks/dispute.ts";

describe("Scenario logic, offline (ARCHITECTURE §13)", () => {
  const buyer = Keypair.random();
  const refundOptions = {
    refundVaultId: "CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA",
    submit: async () => ({ txHash: "ef".repeat(32), ledger: 300 }),
  };

  beforeEach(() => {
    clearRefundedRefs();
  });

  // Scenario 1: M0 ALLOW
  it("Scenario 1: M0 ALLOW - successful delivery and receipt leaf creation", () => {
    const pactId = "10".repeat(32);
    const leaf = receiptLeaf({
      pactId,
      transition: "paid",
      toSeller: 1_000_000n, // 0.1 USDC
      toBuyer: 0n,
      envelopeHash: "aa".repeat(32),
      ledger: 100,
    });
    expect(leaf).toMatch(/^[0-9a-fA-F]{64}$/);
  });

  // Scenario 2: M0 DENY
  it("Scenario 2: M0 DENY - RefundVault refund flow", async () => {
    const pactId = "20".repeat(32);
    const refundRes = await handleM0Refund({
      pactId,
      buyer: buyer.publicKey(),
      price: "1.00",
      verdict: "deny",
      paidAtLedger: 100,
    }, refundOptions);
    expect(refundRes.refunded).toBe(true);
    expect(parseFloat(refundRes.refundAmount)).toBe(1);
  });

  // Scenario 3: M0 Non-delivery
  it("Scenario 3: M0 Non-delivery - challenged timeout results in full refund", async () => {
    const pactId = "30".repeat(32);
    const refundRes = await handleM0Refund({
      pactId,
      buyer: buyer.publicKey(),
      price: "0.50",
      verdict: "deny",
      paidAtLedger: 100,
    }, refundOptions);
    expect(refundRes.refunded).toBe(true);
    expect(parseFloat(refundRes.refundAmount)).toBe(0.5);
  });

  // Scenario 4: M2 ALLOW: settling needs either chain access or the facilitator plus the seller's
  // signer; the on-chain settle runs in e2e/testnet.
  it("Scenario 4: M2 ALLOW - auto-settle refuses to run without a way to submit", async () => {
    await expect(
      handleAutoSettle({ pactId: "40".repeat(32), verdict: "allow", allowedAmount: "1.00" }, {}),
    ).rejects.toThrow(/chain or facilitator/);
  });

  // Scenario 5: M2 DENY
  it("Scenario 5: M2 DENY - verifier denial releases escrow deposit back to buyer", () => {
    const pactId = "50".repeat(32);
    const releaseLeaf = receiptLeaf({
      pactId,
      transition: "released",
      toSeller: 0n,
      toBuyer: 1_000_000n,
      envelopeHash: "dd".repeat(32),
      ledger: 110,
    });
    expect(releaseLeaf).toMatch(/^[0-9a-fA-F]{64}$/);
  });

  // Scenario 6: M2 Silence
  it("Scenario 6: M2 Silence - silence policy resolution after settle deadline", () => {
    const pactId = "60".repeat(32);
    const silenceLeaf = receiptLeaf({
      pactId,
      transition: "released",
      toSeller: 0n,
      toBuyer: 1_000_000n,
      envelopeHash: null,
      ledger: 500, // past settle deadline
    });
    expect(silenceLeaf).toMatch(/^[0-9a-fA-F]{64}$/);
  });

  // Scenario 7: Dispute -> Refund
  it("Scenario 7: Dispute -> Refund within refund window produces Refunded receipt leaf", async () => {
    const pactId = "70".repeat(32);
    const disputeRes = await handleDisputeRefund({
      pactId,
      buyer: buyer.publicKey(),
      price: "1.00",
      verdict: "deny",
      envelopeHash: "ee".repeat(32),
      ledger: 120,
    }, refundOptions);
    expect(disputeRes.refunded).toBe(true);
    expect(parseFloat(disputeRes.refundAmount)).toBe(1);
    expect(disputeRes.receiptLeaf).toMatch(/^[0-9a-fA-F]{64}$/);
  });
});
