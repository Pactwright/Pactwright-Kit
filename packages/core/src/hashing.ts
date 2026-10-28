/**
 * Identifiers and signed-message digests. ARCHITECTURE.md §4.3.
 * Must match pactwright-contracts/contracts/pact/src/hashing.rs byte for byte (ADR-015).
 */
import { notImplemented } from "./errors.ts";
import type { Transition, UsageVoucher, VerdictAttestation } from "./schemas.ts";

export const VERDICT_DOMAIN = "pactwright-verdict-v1:";
export const USAGE_DOMAIN = "pactwright-usage-v1:";
export const DELIVERY_DOMAIN = "pactwright-delivery-v1:";
export const RECEIPT_DOMAIN = "pactwright-receipt-v1";

/** `u64_be(sha256(idempotencyKey)[0..8])` */
export function nonceFromIdempotencyKey(_idempotencyKey: string): bigint {
  return notImplemented("K-03");
}

/** `sha256(xdr(buyer) ‖ xdr(seller) ‖ nonce_u64_be ‖ conditionHash)` */
export function pactId(_buyer: string, _seller: string, _nonce: bigint, _conditionHash: string): string {
  return notImplemented("K-03");
}

/** Witness `conditionHash()`: sha256 of canonical JSON. */
export function conditionHash(_condition: Record<string, unknown>): string {
  return notImplemented("K-03");
}

export function verdictMessage(_attestation: VerdictAttestation): Uint8Array {
  return notImplemented("K-03");
}

export function usageMessage(_voucher: UsageVoucher): Uint8Array {
  return notImplemented("K-03");
}

export function deliveryMessage(_pactId: string, _bodySha256: string): Uint8Array {
  return notImplemented("K-03");
}

export interface ReceiptLeafInput {
  pactId: string;
  transition: Transition;
  /** Stroops. */
  toSeller: bigint;
  /** Stroops. */
  toBuyer: bigint;
  envelopeHash?: string;
  ledger: number;
}

export function receiptLeaf(_input: ReceiptLeafInput): string {
  return notImplemented("K-03");
}
