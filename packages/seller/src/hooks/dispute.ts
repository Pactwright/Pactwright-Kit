/** Dispute -> RefundVault refund flow with Refunded receipts. ROADMAP P7-06. */
import { receiptLeaf, toStroops } from "@pactwright/core";
import { handleM0Refund, type RefundOptions } from "./refund.ts";

export interface DisputeNotification {
  pactId: string;
  buyer: string;
  price: string;
  verdict: "allow" | "deny";
  allowedAmount?: string;
  envelopeHash?: string;
  ledger?: number;
}

export interface DisputeRefundResult {
  refunded: boolean;
  refundAmount: string;
  receiptLeaf: string;
  txHash?: string;
  error?: string;
}

export async function handleDisputeRefund(
  notification: DisputeNotification,
  options?: RefundOptions,
): Promise<DisputeRefundResult> {
  const { pactId, buyer, price, verdict, allowedAmount, envelopeHash, ledger = 100 } = notification;

  const refundRes = await handleM0Refund(
    {
      pactId,
      buyer,
      price,
      verdict,
      allowedAmount,
      paidAtLedger: ledger,
    },
    options,
  );

  const refundStroops = toStroops(refundRes.refundAmount);

  // Generates the Refunded receipt leaf (ROADMAP P7-06)
  const leaf = receiptLeaf({
    pactId,
    transition: "refunded",
    toSeller: 0n,
    toBuyer: refundStroops,
    envelopeHash: envelopeHash ?? null,
    ledger,
  });

  return {
    refunded: refundRes.refunded,
    refundAmount: refundRes.refundAmount,
    receiptLeaf: leaf,
    txHash: refundRes.txHash,
    error: refundRes.error,
  };
}
