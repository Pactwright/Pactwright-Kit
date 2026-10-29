/**
 * Identifiers and signed-message digests. ARCHITECTURE.md §4.3.
 * Must match pactwright-contracts/contracts/pact/src/hashing.rs byte for byte (ADR-015).
 */
import { createHash } from "node:crypto";
import { Address, xdr } from "@stellar/stellar-base";
import { TRANSITION_CODE, type Transition, type UsageVoucher, type VerdictAttestation } from "./schemas.ts";

export const VERDICT_DOMAIN = "pactwright-verdict-v1:";
export const USAGE_DOMAIN = "pactwright-usage-v1:";
export const DELIVERY_DOMAIN = "pactwright-delivery-v1:";
export const RECEIPT_DOMAIN = "pactwright-receipt-v1";

function i128ScVal(amountBigInt: bigint): xdr.ScVal {
  const hi = xdr.Int64.fromString((amountBigInt >> 64n).toString());
  const lo = xdr.Uint64.fromString((amountBigInt & 0xffffffffffffffffn).toString());
  return xdr.ScVal.scvI128(new xdr.Int128Parts({ hi, lo }));
}

/**
 * JSON Canonicalization Scheme (RFC 8785).
 */
export function canonicalize(value: unknown): string {
  if (value === null || typeof value === "boolean" || typeof value === "string") {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError("cannot canonicalize a non-finite number");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return "[" + value.map((v) => canonicalize(v === undefined ? null : v)).join(",") + "]";
  }
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const keys = Object.keys(record)
      .filter((k) => record[k] !== undefined)
      .sort();
    return "{" + keys.map((k) => JSON.stringify(k) + ":" + canonicalize(record[k])).join(",") + "}";
  }
  throw new TypeError(`cannot canonicalize a value of type ${typeof value}`);
}

/** `u64_be(sha256(idempotencyKey)[0..8])` */
export function nonceFromIdempotencyKey(idempotencyKey: string): bigint {
  const hash = createHash("sha256").update(Buffer.from(idempotencyKey, "utf8")).digest();
  return hash.readBigUInt64BE(0);
}

/** `sha256(xdr(buyer) ‖ xdr(seller) ‖ nonce_u64_be ‖ conditionHash)` */
export function pactId(buyer: string, seller: string, nonce: bigint, conditionHash: string): string {
  const buyerXdr = new Address(buyer).toScVal().toXDR();
  const sellerXdr = new Address(seller).toScVal().toXDR();
  const nonceBuf = Buffer.alloc(8);
  nonceBuf.writeBigUInt64BE(nonce, 0);
  const condHashBuf = Buffer.from(conditionHash, "hex");
  const preimage = Buffer.concat([buyerXdr, sellerXdr, nonceBuf, condHashBuf]);
  return createHash("sha256").update(preimage).digest("hex");
}

/** Witness `conditionHash()`: sha256 of canonical JSON. */
export function conditionHash(condition: Record<string, unknown>): string {
  const canonical = canonicalize(condition);
  return createHash("sha256").update(Buffer.from(canonical, "utf8")).digest("hex");
}

/** A `VerdictAttestation` as the contract's `#[contracttype]` struct (a map with sorted keys). */
export function verdictAttestationScVal(attestation: VerdictAttestation): xdr.ScVal {
  const amountBigInt = typeof attestation.amount === "bigint" ? attestation.amount : BigInt(attestation.amount);
  const verdictStr = String(attestation.verdict).toUpperCase();
  const verdictVal = verdictStr === "ALLOW" ? 1 : 2;

  const map = xdr.ScVal.scvMap([
    new xdr.ScMapEntry({
      key: xdr.ScVal.scvSymbol("amount"),
      val: i128ScVal(amountBigInt),
    }),
    new xdr.ScMapEntry({
      key: xdr.ScVal.scvSymbol("condition_hash"),
      val: xdr.ScVal.scvBytes(Buffer.from(attestation.conditionHash, "hex")),
    }),
    new xdr.ScMapEntry({
      key: xdr.ScVal.scvSymbol("envelope_hash"),
      val: xdr.ScVal.scvBytes(Buffer.from(attestation.envelopeHash, "hex")),
    }),
    new xdr.ScMapEntry({
      key: xdr.ScVal.scvSymbol("issued_ledger"),
      val: xdr.ScVal.scvU32(attestation.issuedLedger),
    }),
    new xdr.ScMapEntry({
      key: xdr.ScVal.scvSymbol("pact_id"),
      val: xdr.ScVal.scvBytes(Buffer.from(attestation.pactId, "hex")),
    }),
    new xdr.ScMapEntry({
      key: xdr.ScVal.scvSymbol("verdict"),
      val: xdr.ScVal.scvU32(verdictVal),
    }),
  ]);

  return map;
}

export function verdictMessage(attestation: VerdictAttestation): Uint8Array {
  const xdrBytes = verdictAttestationScVal(attestation).toXDR();
  const domain = Buffer.from(VERDICT_DOMAIN, "utf8");
  return new Uint8Array(createHash("sha256").update(Buffer.concat([domain, xdrBytes])).digest());
}

export function usageMessage(voucher: UsageVoucher): Uint8Array {
  const map = xdr.ScVal.scvMap([
    new xdr.ScMapEntry({
      key: xdr.ScVal.scvSymbol("pact_id"),
      val: xdr.ScVal.scvBytes(Buffer.from(voucher.pactId, "hex")),
    }),
    new xdr.ScMapEntry({
      key: xdr.ScVal.scvSymbol("units"),
      val: xdr.ScVal.scvU32(voucher.units),
    }),
  ]);

  const xdrBytes = map.toXDR();
  const domain = Buffer.from(USAGE_DOMAIN, "utf8");
  return new Uint8Array(createHash("sha256").update(Buffer.concat([domain, xdrBytes])).digest());
}

export function deliveryMessage(pactIdHex: string, bodySha256: string): Uint8Array {
  const domain = Buffer.from(DELIVERY_DOMAIN, "utf8");
  const pactIdBuf = Buffer.from(pactIdHex, "hex");
  const bodyBuf = Buffer.from(bodySha256, "hex");
  return new Uint8Array(createHash("sha256").update(Buffer.concat([domain, pactIdBuf, bodyBuf])).digest());
}

export interface ReceiptLeafInput {
  pactId: string;
  transition: Transition | number;
  /** Stroops. */
  toSeller: bigint | string;
  /** Stroops. */
  toBuyer: bigint | string;
  envelopeHash?: string | null;
  ledger: number;
}

export function receiptLeaf(input: ReceiptLeafInput): string {
  const domain = Buffer.from(RECEIPT_DOMAIN, "utf8");
  const pactIdBuf = Buffer.from(input.pactId, "hex");
  const transCode =
    typeof input.transition === "number"
      ? input.transition
      : TRANSITION_CODE[input.transition as Transition];
  const transBuf = Buffer.alloc(4);
  transBuf.writeUInt32BE(transCode, 0);

  const toSeller = typeof input.toSeller === "bigint" ? input.toSeller : BigInt(input.toSeller);
  const sellerBuf = Buffer.alloc(16);
  sellerBuf.writeBigInt64BE(toSeller >> 64n, 0);
  sellerBuf.writeBigUInt64BE(toSeller & 0xffffffffffffffffn, 8);

  const toBuyer = typeof input.toBuyer === "bigint" ? input.toBuyer : BigInt(input.toBuyer);
  const buyerBuf = Buffer.alloc(16);
  buyerBuf.writeBigInt64BE(toBuyer >> 64n, 0);
  buyerBuf.writeBigUInt64BE(toBuyer & 0xffffffffffffffffn, 8);

  const envBuf = input.envelopeHash ? Buffer.from(input.envelopeHash, "hex") : Buffer.alloc(32, 0);
  const ledgerBuf = Buffer.alloc(4);
  ledgerBuf.writeUInt32BE(input.ledger, 0);

  return createHash("sha256")
    .update(Buffer.concat([domain, pactIdBuf, transBuf, sellerBuf, buyerBuf, envBuf, ledgerBuf]))
    .digest("hex");
}
