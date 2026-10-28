/**
 * Shared data model. Mirrors the Rust types in pactwright-contracts/contracts/pact/src/types.rs
 * and ARCHITECTURE.md §7.2. Change both together.
 *
 * TypeScript ↔ Rust field map (on-chain types only):
 *
 * | TypeScript                      | Rust (`types.rs`)                 | Notes                          |
 * |---------------------------------|-----------------------------------|--------------------------------|
 * | VerdictAttestation.pactId       | VerdictAttestation.pact_id        | BytesN<32> ↔ lowercase hex     |
 * | VerdictAttestation.conditionHash| VerdictAttestation.condition_hash | BytesN<32> ↔ hex               |
 * | VerdictAttestation.envelopeHash | VerdictAttestation.envelope_hash  | BytesN<32> ↔ hex               |
 * | VerdictAttestation.verdict      | VerdictAttestation.verdict        | "ALLOW"/"DENY" ↔ Allow=1/Deny=2|
 * | VerdictAttestation.amount       | VerdictAttestation.amount         | i128 stroops ↔ decimal string  |
 * | VerdictAttestation.issuedLedger | VerdictAttestation.issued_ledger  | u32                            |
 * | UsageVoucher.pactId             | UsageVoucher.pact_id              | BytesN<32> ↔ hex               |
 * | UsageVoucher.units              | UsageVoucher.units                | u32 (cumulative)               |
 * | PactTerms.cap                   | Pact.cap / OpenParams.cap         | i128 stroops ↔ decimal USDC    |
 * | PactTerms.nonce                 | OpenParams.nonce                  | u64 ↔ decimal string           |
 * | PactTerms.metered               | Pact.meter                        | Metering::Units(_) ↔ true      |
 * | PactTerms.silence               | Pact.silence                      | "refund"/"pay" ↔ Refund=1/Pay=2|
 * | PactTerms.verdictDeadline       | Pact.verdict_deadline             | u32 ledger                     |
 * | PactTerms.settleDeadline        | Pact.settle_deadline              | u32 ledger                     |
 * | PactTerms.verifier              | Pact.verifier                     | ed25519 public key, hex        |
 */
import { z } from "zod";

// ---------- primitives ----------
export const Hex64 = z.string().regex(/^[0-9a-f]{64}$/, "expected a lowercase sha256 hex digest");
/** G… account or C… contract address. */
export const StellarAddress = z.string().regex(/^[GC][A-Z2-7]{55}$/, "expected a Stellar address");
/** Decimal token amount as a string, up to 7 decimals (USDC SAC). */
export const DecimalAmount = z.string().regex(/^\d+(\.\d{1,7})?$/, "expected a decimal amount");
/** Stroops (i128 on-chain) as a base-10 string. */
export const Stroops = z.string().regex(/^-?\d+$/, "expected an integer amount in stroops");
/** Ledger sequence (u32 on-chain). */
export const LedgerSeq = z.number().int().nonnegative().max(4_294_967_295);

// ---------- enums ----------
export const ModeSchema = z.enum(["exact-refund", "escrow"]);
export const PactStateSchema = z.enum([
  "funded", "paid", "allowed", "denied", "settled", "released", "refunded",
]);
export const TransitionSchema = z.enum(["paid", "settled", "released", "refunded"]);
export const VerdictSchema = z.enum(["ALLOW", "DENY"]);
export const SilenceSchema = z.enum(["refund", "pay"]);

/** Numeric codes used on-chain and in receipt leaves. */
export const TRANSITION_CODE = { paid: 1, settled: 2, released: 3, refunded: 4 } as const;

// ---------- 402 extension: accepts[i].extra.pactwright ----------
export const PactwrightExtraSchema = z.object({
  version: z.literal(2),
  mode: ModeSchema,
  condition: z.record(z.string(), z.unknown()),
  deliveryKey: Hex64,
  verifier: Hex64,
  verifierUrl: z.string().url(),
  verify: z.object({ minAmount: DecimalAmount }).optional(),
  pactContract: StellarAddress.optional(),
  silence: SilenceSchema.optional(),
  deadlines: z
    .object({ verdictLedgers: z.number().int().positive(), settleLedgers: z.number().int().positive() })
    .optional(),
  refundVault: StellarAddress.optional(),
  refundWindowLedgers: z.number().int().nonnegative(),
  meter: z.object({ unit: z.string(), unitPrice: DecimalAmount }).optional(),
});

// ---------- pact terms (off-chain view of a pact, both modes) ----------
export const PactTermsSchema = z.object({
  pactId: Hex64,
  mode: ModeSchema,
  buyer: StellarAddress,
  seller: StellarAddress,
  resourceUrl: z.string().url(),
  cap: DecimalAmount,
  nonce: z.string().regex(/^\d+$/),
  conditionHash: Hex64,
  condition: z.record(z.string(), z.unknown()),
  verifier: Hex64,
  metered: z.boolean(),
  silence: SilenceSchema.optional(),
  verdictDeadline: LedgerSeq.optional(),
  settleDeadline: LedgerSeq.optional(),
  refundWindowLedgers: z.number().int().nonnegative(),
});

// ---------- signed messages (match the Rust structs) ----------
export const VerdictAttestationSchema = z.object({
  pactId: Hex64,
  conditionHash: Hex64,
  envelopeHash: Hex64,
  verdict: VerdictSchema,
  amount: Stroops,
  issuedLedger: LedgerSeq,
});

export const UsageVoucherSchema = z.object({
  pactId: Hex64,
  units: z.number().int().nonnegative().max(4_294_967_295),
});

/** Parsed `X-Pactwright-Delivery` header: `sha256=<body hash>; sig=<ed25519 base64>`. */
export const DeliveryReceiptSchema = z.object({
  pactId: Hex64,
  bodySha256: Hex64,
  signature: z.string().min(1),
});

// ---------- certificate ----------
export const CertificateSchema = z.object({
  pactId: Hex64,
  transition: TransitionSchema,
  toSeller: DecimalAmount,
  toBuyer: DecimalAmount,
  envelopeHash: Hex64.optional(),
  leaf: Hex64,
  status: z.enum(["pending", "anchored"]),
  proof: z.array(Hex64).optional(),
  shardId: z.number().int().optional(),
  batchId: z.number().int().optional(),
  root: Hex64.optional(),
  receiptAnchor: StellarAddress,
  txs: z.array(z.object({ stage: z.string(), hash: z.string() })),
});

export type Mode = z.infer<typeof ModeSchema>;
export type PactState = z.infer<typeof PactStateSchema>;
export type Transition = z.infer<typeof TransitionSchema>;
export type Verdict = z.infer<typeof VerdictSchema>;
export type Silence = z.infer<typeof SilenceSchema>;
export type PactwrightExtra = z.infer<typeof PactwrightExtraSchema>;
export type PactTerms = z.infer<typeof PactTermsSchema>;
export type VerdictAttestation = z.infer<typeof VerdictAttestationSchema>;
export type UsageVoucher = z.infer<typeof UsageVoucherSchema>;
export type DeliveryReceipt = z.infer<typeof DeliveryReceiptSchema>;
export type Certificate = z.infer<typeof CertificateSchema>;
