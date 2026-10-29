import { describe, expect, it, vi, beforeEach } from "vitest";
import { createHash } from "node:crypto";
import { z } from "zod";
import { Keypair } from "@witness/core";
import { toStroops, type PactTerms } from "@pactwright/core";
import {
  runPipeline,
  signVerdict,
  challengeNonDelivery,
  submit,
  ProviderNeutralLLMAdapter,
} from "../src/index.ts";
import { clearIssuedAttestations } from "../src/sign.ts";

const VALID_BUYER = "GA7QYNF7SOWQ3GLR2BGMZEHXAVIRZA4KVWLTJJFC7MGXUA74P7UJVTOO";
const VALID_SELLER = "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5";

const mockTerms: PactTerms = {
  pactId: "01".repeat(32),
  mode: "exact-refund",
  buyer: VALID_BUYER,
  seller: VALID_SELLER,
  resourceUrl: "https://seller.test/api/translate",
  cap: "1.00",
  nonce: "1",
  conditionHash: "02".repeat(32),
  condition: {
    kind: "document.translation",
    lang: "es",
    minPages: 1,
    maxUntranslatedSegments: 0,
  },
  verifier: "03".repeat(32),
  metered: false,
  refundWindowLedgers: 17280,
};

const validEvidence = [
  {
    type: "document" as const,
    uri: "https://blob.test/doc.pdf",
    sha256: "04".repeat(32),
    mimeType: "text/plain",
    uploader: VALID_BUYER,
    createdAt: new Date().toISOString(),
  },
];

describe("Verifier Engine Pipeline", () => {
  const verifierKey = Keypair.random();

  beforeEach(() => {
    clearIssuedAttestations();
  });

  describe("V-02: Pipeline delivery receipt & evidence checks", () => {
    it("runs pipeline and allows when receipt and evidence are valid", async () => {
      const evidenceData = Buffer.from("Hola mundo, esta es una traducción al español");
      const sha256 = createHash("sha256").update(evidenceData).digest("hex");
      const evidence = [
        {
          type: "document" as const,
          uri: "https://blob.test/doc.pdf",
          sha256,
          mimeType: "text/plain",
          uploader: VALID_BUYER,
          createdAt: new Date().toISOString(),
        },
      ];

      const deliveryReceipt = "sha256=" + sha256 + "; sig=validBase64Sig==";

      const res = await runPipeline(
        {
          terms: mockTerms,
          evidence,
          deliveryReceipt,
          milestone: "delivery",
        },
        {
          verifierKey,
          evidenceLoader: async () => evidenceData,
        },
      );

      expect(res).not.toBe("no-verdict");
      if (res !== "no-verdict") {
        expect(res.envelope.verdict.decision).toBe("ALLOW");
        expect(res.amount).toBe(toStroops("1.00"));
        expect(res.envelopeRef).toContain("verdict-v1");
      }
    });

    it("denies when delivery receipt is malformed or invalid", async () => {
      const badReceipt = "invalid_receipt_header_without_sha256";

      const res = await runPipeline(
        {
          terms: mockTerms,
          evidence: validEvidence,
          deliveryReceipt: badReceipt,
          milestone: "delivery",
        },
        { verifierKey },
      );

      expect(res).not.toBe("no-verdict");
      if (res !== "no-verdict") {
        expect(res.envelope.verdict.decision).toBe("DENY");
        expect(res.envelope.verdict.reasons).toContain("MERCHANT_MISMATCH");
        expect(res.amount).toBe(0n);
      }
    });

    it("denies when evidence hash check fails", async () => {
      const deliveryReceipt = "sha256=11".padEnd(71, "a") + "; sig=validBase64Sig==";

      const res = await runPipeline(
        {
          terms: mockTerms,
          evidence: validEvidence,
          deliveryReceipt,
          milestone: "delivery",
        },
        {
          verifierKey,
          evidenceLoader: async () => Buffer.from("tampered evidence content bytes"),
        },
      );

      expect(res).not.toBe("no-verdict");
      if (res !== "no-verdict") {
        expect(res.envelope.verdict.decision).toBe("DENY");
        expect(res.envelope.verdict.reasons).toContain("CONDITION_MISMATCH");
        expect(res.amount).toBe(0n);
      }
    });

    it("returns 'no-verdict' on model refusal so silence policy applies", async () => {
      const deliveryReceipt = "sha256=11".padEnd(71, "a") + "; sig=validBase64Sig==";
      const refusalModel = new ProviderNeutralLLMAdapter({ mockReading: "refusal" });

      const res = await runPipeline(
        {
          terms: mockTerms,
          evidence: validEvidence,
          deliveryReceipt,
          milestone: "delivery",
        },
        {
          verifierKey,
          modelAdapter: refusalModel,
        },
      );

      expect(res).toBe("no-verdict");
    });
  });

  describe("V-03: Provider-neutral LLM adapter", () => {
    const testReadingSchema = z.object({
      detectedLanguage: z.string(),
      pageCount: z.number(),
      isTranslationOfSource: z.boolean(),
      untranslatedSegments: z.number(),
      notes: z.string().optional(),
    });

    it("returns typed reading with modelId and rawSha256", async () => {
      const adapter = new ProviderNeutralLLMAdapter();
      const reading = await adapter.read(
        testReadingSchema,
        "instructions",
        [{ mimeType: "text/plain", data: Buffer.from("Hola gracias") }],
        {
          mockOutput: {
            detectedLanguage: "es",
            pageCount: 1,
            isTranslationOfSource: true,
            untranslatedSegments: 0,
            notes: "all good",
          },
        },
      );

      expect(reading).not.toBe("refusal");
      if (reading !== "refusal") {
        expect(reading.modelId).toBeDefined();
        expect(reading.rawSha256).toMatch(/^[0-9a-f]{64}$/);
        expect(reading.output.detectedLanguage).toBe("es");
      }
    });

    it("returns refusal when instructed to refuse", async () => {
      const adapter = new ProviderNeutralLLMAdapter();
      const reading = await adapter.read(
        testReadingSchema,
        "REFUSE_SERVICE instructions",
        [],
      );
      expect(reading).toBe("refusal");
    });
  });

  describe("V-05: Envelope and attestation signing", () => {
    it("signs envelope and exactly one VerdictAttestation for escrow pacts", async () => {
      const escrowTerms: PactTerms = { ...mockTerms, mode: "escrow" };

      const res = await signVerdict({
        terms: escrowTerms,
        decision: {
          verdict: "ALLOW",
          amount: toStroops("1.00"),
          criteria: [
            {
              id: "c1",
              verifier: verifierKey.publicKey(),
              result: "PASS",
              code: "OK",
              reason: "Translation matches",
              mandatory: true,
            },
          ],
          reasons: ["OK"],
          policyVersion: "1",
        },
        evidence: validEvidence,
        verifierKey,
        milestone: "delivery",
      });

      expect(res.envelope.signature).toBeTruthy();
      expect(res.attestation).toBeDefined();
      expect(res.attestation?.attestation.pactId).toBe(escrowTerms.pactId);
      expect(res.attestation?.signature).toBeTruthy();
    });

    it("enforces invariant: rejects a second attestation for the same pact_id", async () => {
      const escrowTerms: PactTerms = { ...mockTerms, mode: "escrow" };

      await signVerdict({
        terms: escrowTerms,
        decision: {
          verdict: "ALLOW",
          amount: toStroops("1.00"),
          criteria: [],
          reasons: ["OK"],
          policyVersion: "1",
        },
        evidence: validEvidence,
        verifierKey,
        milestone: "delivery",
      });

      // Second attempt must throw
      await expect(
        signVerdict({
          terms: escrowTerms,
          decision: {
            verdict: "ALLOW",
            amount: toStroops("1.00"),
            criteria: [],
            reasons: ["OK"],
            policyVersion: "1",
          },
          evidence: validEvidence,
          verifierKey,
          milestone: "delivery",
        }),
      ).rejects.toThrow("Only one attestation per pact allowed");
    });
  });

  describe("V-06: Facilitator /pact/submit", () => {
    it("submits record_verdict and returns txHash idempotently", async () => {
      const mockFetch = vi.fn<typeof fetch>(async () =>
        new Response(JSON.stringify({ txHash: "tx_mock_hash_12345" }), { status: 200 }),
      );

      const tx = await submit("01".repeat(32), "record_verdict", {
        facilitatorUrl: "https://mock.facilitator.dev",
        fetchImpl: mockFetch,
      });

      expect(tx).toBe("tx_mock_hash_12345");
      expect(mockFetch).toHaveBeenCalledOnce();
    });

    it("logs failure with pact_id on submission error", async () => {
      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const mockFetch = vi.fn<typeof fetch>(async () =>
        new Response("Facilitator rate limit exceeded", { status: 429 }),
      );

      await expect(
        submit("01".repeat(32), "release", {
          facilitatorUrl: "https://mock.facilitator.dev",
          fetchImpl: mockFetch,
        }),
      ).rejects.toThrow("Facilitator /pact/submit failed");

      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });

  describe("V-07: Non-delivery challenge", () => {
    it("returns 'delivered' when seller webhook provides a valid delivery receipt", async () => {
      const validReceipt = "sha256=" + "09".repeat(32) + "; sig=dGVzdF9zaWduYXR1cmU=";
      const mockFetch = vi.fn<typeof fetch>(async () =>
        new Response(JSON.stringify({ deliveryReceipt: validReceipt }), { status: 200 }),
      );

      const res = await challengeNonDelivery("01".repeat(32), {
        sellerWebhookUrl: "https://seller.test/webhook",
        fetchImpl: mockFetch,
      });

      expect(res.status).toBe("delivered");
      expect(res.deliveryReceipt).toBe(validReceipt);
    });

    it("returns 'deny' on seller silence / timeout / failure", async () => {
      const mockFetch = vi.fn<typeof fetch>(async () =>
        new Response(JSON.stringify({ error: "No delivery available" }), { status: 404 }),
      );

      const res = await challengeNonDelivery("01".repeat(32), {
        sellerWebhookUrl: "https://seller.test/webhook",
        fetchImpl: mockFetch,
      });

      expect(res.status).toBe("deny");
    });
  });

  describe("V-09: Threshold handling (verify.minAmount)", () => {
    it("returns receipt-only outcome without envelope when cap is below verify.minAmount", async () => {
      const evidenceData = Buffer.from("Hola mundo!");
      const evidenceHash = createHash("sha256").update(evidenceData).digest("hex");
      const deliveryReceipt = `sha256=${evidenceHash}; sig=${Buffer.from("receipt-sig").toString("base64")}`;

      const res = await runPipeline(
        {
          terms: {
            ...mockTerms,
            cap: "0.05",
            verify: { minAmount: "0.10" },
          },
          evidence: [
            {
              ...validEvidence[0],
              sha256: evidenceHash,
            },
          ],
          deliveryReceipt,
          milestone: "delivery",
        },
        {
          verifierKey,
          evidenceLoader: async () => evidenceData,
        },
      );

      expect(res).not.toBe("no-verdict");
      if (res !== "no-verdict") {
        expect(res.receiptOnly).toBe(true);
        expect(res.amount).toBe(500_000n); // 0.05 USDC in stroops
        expect(res.envelope).toBeUndefined();
        expect(res.envelopeRef).toBeUndefined();
      }
    });

    it("evaluates full model pipeline when cap is at or above verify.minAmount", async () => {
      const evidenceData = Buffer.from("Hola mundo!");
      const evidenceHash = createHash("sha256").update(evidenceData).digest("hex");
      const deliveryReceipt = `sha256=${evidenceHash}; sig=${Buffer.from("receipt-sig").toString("base64")}`;

      const res = await runPipeline(
        {
          terms: {
            ...mockTerms,
            cap: "0.50",
            verify: { minAmount: "0.10" },
          },
          evidence: [
            {
              ...validEvidence[0],
              sha256: evidenceHash,
            },
          ],
          deliveryReceipt,
          milestone: "delivery",
        },
        {
          verifierKey,
          evidenceLoader: async () => evidenceData,
        },
      );

      expect(res).not.toBe("no-verdict");
      if (res !== "no-verdict") {
        expect(res.receiptOnly).toBeUndefined();
        expect(res.envelope).toBeDefined();
        expect(res.envelope?.verdict.decision).toBe("ALLOW");
      }
    });
  });
});
