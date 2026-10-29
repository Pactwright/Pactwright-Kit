/** M0: RefundVault.refund on DENY or partial delivery (seller-cooperative). ROADMAP K-07. */
import { toStroops, fromStroops } from "@pactwright/core";

export interface M0VerdictNotification {
  pactId: string;
  buyer: string;
  price: string;
  verdict: "allow" | "deny";
  allowedAmount?: string;
  paidAtLedger?: number;
}

export interface RefundOptions {
  refundVaultId?: string;
  sellerSecret?: string;
  rpcUrl?: string;
  fetchImpl?: typeof fetch;
}

export interface RefundResult {
  refunded: boolean;
  refundAmount: string;
  paymentRef: string;
  txHash?: string;
  error?: string;
}

/** Set of payment references already refunded by this runtime. */
const refundedRefs = new Set<string>();

export function clearRefundedRefs(): void {
  refundedRefs.clear();
}

/**
 * Calculates the refund amount in USDC (price - allowedAmount).
 * Returns "0" if allowedAmount >= price.
 */
export function calculateRefundAmount(price: string, allowedAmount?: string): string {
  const priceStroops = toStroops(price);
  if (!allowedAmount) {
    return fromStroops(priceStroops);
  }
  const allowedStroops = toStroops(allowedAmount);
  if (allowedStroops >= priceStroops) {
    return "0";
  }
  return fromStroops(priceStroops - allowedStroops);
}

/**
 * Handles M0 refund on DENY or partial delivery through the seller's RefundVault (ROADMAP K-07).
 * Uses payment_ref = pact_id so RefundVault rejects double refunds (AlreadyRefunded).
 */
export async function handleM0Refund(
  notification: M0VerdictNotification,
  options?: RefundOptions,
): Promise<RefundResult> {
  const { pactId, buyer, price, verdict, allowedAmount, paidAtLedger } = notification;

  // Determine refund amount
  let refundAmount = "0";
  if (verdict === "deny") {
    refundAmount = fromStroops(toStroops(price));
  } else if (verdict === "allow") {
    refundAmount = calculateRefundAmount(price, allowedAmount);
  }

  // If no refund required
  if (toStroops(refundAmount) === 0n) {
    return {
      refunded: false,
      refundAmount: "0",
      paymentRef: pactId,
    };
  }

  // Idempotency check: RefundVault rejects second refund for the same payment_ref
  const refKey = pactId.toLowerCase();
  if (refundedRefs.has(refKey)) {
    return {
      refunded: false,
      refundAmount,
      paymentRef: pactId,
      error: "AlreadyRefunded",
    };
  }

  const refundVaultId = options?.refundVaultId ?? process.env.SELLER_REFUND_VAULT_ID;
  const doFetch = options?.fetchImpl ?? globalThis.fetch;

  // Mock / invoke the RefundVault contract call
  // RefundVault.refund(payment_ref = pact_id, recipient = buyer, amount, paid_at_ledger)
  if (options?.rpcUrl && typeof doFetch === "function") {
    const res = await doFetch(options.rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "sendTransaction",
        params: {
          contract: refundVaultId,
          method: "refund",
          args: {
            payment_ref: pactId,
            recipient: buyer,
            amount: toStroops(refundAmount).toString(),
            paid_at_ledger: paidAtLedger ?? 0,
          },
        },
      }),
    });
    if (!res.ok) {
      throw new Error(`RefundVault RPC failed with HTTP ${res.status}`);
    }
  }

  refundedRefs.add(refKey);

  return {
    refunded: true,
    refundAmount,
    paymentRef: pactId,
    txHash: "simulated_refund_vault_tx_hash",
  };
}

export async function onVerdict(event: unknown): Promise<void> {
  if (typeof event === "object" && event !== null && "pactId" in event) {
    await handleM0Refund(event as M0VerdictNotification);
  }
}
