/** M0: RefundVault.refund on DENY or partial delivery (seller-cooperative). ROADMAP K-07. */
import { toStroops, fromStroops } from "@pactwright/core";
import { invokeContract, scv, type ChainOptions, type SubmittedCall } from "../chain.ts";

export interface M0VerdictNotification {
  pactId: string;
  buyer: string;
  price: string;
  verdict: "allow" | "deny";
  allowedAmount?: string;
  paidAtLedger?: number;
}

/** The `RefundVault.refund` call, as sent on-chain. */
export interface RefundCall {
  refundVaultId: string;
  paymentRef: string;
  recipient: string;
  amountStroops: bigint;
  paidAtLedger: number;
}

export interface RefundOptions {
  refundVaultId?: string;
  /** Sends the refund as a real transaction signed by the vault merchant (the seller). */
  chain?: ChainOptions;
  /** Replaces the chain submission, for tests or custom signing pipelines. */
  submit?: (call: RefundCall) => Promise<SubmittedCall>;
}

export interface RefundResult {
  /** True only when a refund transaction landed on-chain. */
  refunded: boolean;
  refundAmount: string;
  paymentRef: string;
  txHash?: string;
  ledger?: number;
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
    refundAmount = allowedAmount ? calculateRefundAmount(price, allowedAmount) : fromStroops(toStroops(price));
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
  const submit =
    options?.submit ??
    (options?.chain
      ? (call: RefundCall) =>
          invokeContract(options.chain!, call.refundVaultId, "refund", [
            scv.bytes32(call.paymentRef),
            scv.address(call.recipient),
            scv.i128(call.amountStroops),
            scv.u32(call.paidAtLedger),
          ])
      : undefined);
  if (!refundVaultId || !submit) {
    return { refunded: false, refundAmount, paymentRef: pactId, error: "not_submitted: no refund vault or chain configured" };
  }
  if (paidAtLedger === undefined) {
    return { refunded: false, refundAmount, paymentRef: pactId, error: "not_submitted: paidAtLedger is required" };
  }

  // RefundVault.refund(payment_ref = pact_id, recipient = buyer, amount, paid_at_ledger)
  const sent = await submit({
    refundVaultId,
    paymentRef: pactId,
    recipient: buyer,
    amountStroops: toStroops(refundAmount),
    paidAtLedger,
  });

  refundedRefs.add(refKey);

  return {
    refunded: true,
    refundAmount,
    paymentRef: pactId,
    txHash: sent.txHash,
    ledger: sent.ledger,
  };
}

export async function onVerdict(event: unknown): Promise<void> {
  if (typeof event === "object" && event !== null && "pactId" in event) {
    await handleM0Refund(event as M0VerdictNotification);
  }
}
