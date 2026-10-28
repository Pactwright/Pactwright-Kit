import { describe, expect, it } from "vitest";
import type { z } from "zod";
import {
  CertificateSchema,
  DecimalAmount,
  DeliveryReceiptSchema,
  Hex64,
  LedgerSeq,
  ModeSchema,
  PactStateSchema,
  PactTermsSchema,
  PactwrightExtraSchema,
  SilenceSchema,
  StellarAddress,
  Stroops,
  TRANSITION_CODE,
  TransitionSchema,
  UsageVoucherSchema,
  VerdictAttestationSchema,
  VerdictSchema,
} from "../src/schemas.ts";

const hex = "a".repeat(64);
const G = "GCFIRY65OQE7DFP5KLNS2PF2LVZMUZYJX4OZIEQ36N2IQANUB5XVYOJR";
const C = "CABQGAYDAMBQGAYDAMBQGAYDAMBQGAYDAMBQGAYDAMBQGAYDAMBQGTV3";

const extra = {
  version: 2,
  mode: "escrow",
  condition: { kind: "document.translation", lang: "pt", minPages: 1 },
  deliveryKey: hex,
  verifier: hex,
  verifierUrl: "https://verifier.pactwright.dev",
  pactContract: C,
  silence: "refund",
  deadlines: { verdictLedgers: 120, settleLedgers: 720 },
  refundWindowLedgers: 17280,
};

const terms = {
  pactId: hex,
  mode: "escrow",
  buyer: G,
  seller: C,
  resourceUrl: "https://seller.example/translate",
  cap: "1.25",
  nonce: "18446744073709551615",
  conditionHash: hex,
  condition: { kind: "document.translation" },
  verifier: hex,
  metered: false,
  silence: "pay",
  verdictDeadline: 1120,
  settleDeadline: 1720,
  refundWindowLedgers: 0,
};

const attestation = {
  pactId: hex,
  conditionHash: hex,
  envelopeHash: hex,
  verdict: "ALLOW",
  amount: "7500000",
  issuedLedger: 123456,
};

const certificate = {
  pactId: hex,
  transition: "settled",
  toSeller: "0.75",
  toBuyer: "0.25",
  envelopeHash: hex,
  leaf: hex,
  status: "anchored",
  proof: [hex, hex],
  shardId: 0,
  batchId: 1,
  root: hex,
  receiptAnchor: C,
  txs: [{ stage: "opened", hash: "abc" }],
};

type Case = [name: string, schema: z.ZodType, valid: unknown[], invalid: unknown[]];

const cases: Case[] = [
  ["Hex64", Hex64, [hex, "0".repeat(64)], ["A".repeat(64), "a".repeat(63), "a".repeat(65), "0x" + hex]],
  ["StellarAddress", StellarAddress, [G, C], [G.slice(1), "M" + G.slice(1), G.toLowerCase(), ""]],
  ["DecimalAmount", DecimalAmount, ["0", "1", "1.5", "0.0000001"], ["-1", "1.12345678", "1e5", ".5", ""]],
  ["Stroops", Stroops, ["0", "-5", "170141183460469231731687303715884105727"], ["1.5", "", "abc"]],
  ["LedgerSeq", LedgerSeq, [0, 4_294_967_295], [-1, 1.5, 4_294_967_296]],
  ["ModeSchema", ModeSchema, ["exact-refund", "escrow"], ["allowance", "ESCROW"]],
  ["PactStateSchema", PactStateSchema, ["funded", "paid", "allowed", "denied", "settled", "released", "refunded"], ["expired", "open"]],
  ["TransitionSchema", TransitionSchema, ["paid", "settled", "released", "refunded"], ["funded"]],
  ["VerdictSchema", VerdictSchema, ["ALLOW", "DENY"], ["allow", "PARTIAL"]],
  ["SilenceSchema", SilenceSchema, ["refund", "pay"], ["extend"]],
  ["PactwrightExtraSchema", PactwrightExtraSchema,
    [extra, { ...extra, mode: "exact-refund", pactContract: undefined, silence: undefined, deadlines: undefined, refundVault: C, verify: { minAmount: "0.10" } }],
    [{ ...extra, version: 1 }, { ...extra, mode: "allowance" }, { ...extra, verifierUrl: "not a url" }, { ...extra, deadlines: { verdictLedgers: 0, settleLedgers: 1 } }]],
  ["PactTermsSchema", PactTermsSchema, [terms],
    [{ ...terms, nonce: "-1" }, { ...terms, cap: "1.12345678" }, { ...terms, buyer: "bad" }, { ...terms, settleDeadline: -1 }]],
  ["VerdictAttestationSchema", VerdictAttestationSchema, [attestation, { ...attestation, verdict: "DENY", amount: "0" }],
    [{ ...attestation, amount: "1.5" }, { ...attestation, verdict: "ok" }, { ...attestation, issuedLedger: -1 }]],
  ["UsageVoucherSchema", UsageVoucherSchema, [{ pactId: hex, units: 0 }, { pactId: hex, units: 4_294_967_295 }],
    [{ pactId: hex, units: -1 }, { pactId: hex, units: 4_294_967_296 }, { pactId: "x", units: 1 }]],
  ["DeliveryReceiptSchema", DeliveryReceiptSchema, [{ pactId: hex, bodySha256: hex, signature: "c2ln" }],
    [{ pactId: hex, bodySha256: hex, signature: "" }, { pactId: hex, bodySha256: "x", signature: "c2ln" }]],
  ["CertificateSchema", CertificateSchema,
    [certificate, { ...certificate, status: "pending", proof: undefined, shardId: undefined, batchId: undefined, root: undefined, envelopeHash: undefined }],
    [{ ...certificate, status: "done" }, { ...certificate, transition: "funded" }, { ...certificate, proof: ["x"] }]],
];

describe.each(cases)("%s", (_name, schema, valid, invalid) => {
  it.each(valid.map((v) => [v]))("accepts %j", (value) => {
    expect(schema.safeParse(value).success).toBe(true);
  });
  it.each(invalid.map((v) => [v]))("rejects %j", (value) => {
    expect(schema.safeParse(value).success).toBe(false);
  });
});

describe("TRANSITION_CODE", () => {
  it("matches the on-chain receipt transitions (ARCHITECTURE §4.3)", () => {
    expect(TRANSITION_CODE).toEqual({ paid: 1, settled: 2, released: 3, refunded: 4 });
    for (const t of TransitionSchema.options) expect(TRANSITION_CODE[t]).toBeTypeOf("number");
  });
});
