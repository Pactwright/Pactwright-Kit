import { describe, expect, it, vi, beforeEach } from "vitest";
import { createHash } from "node:crypto";
import { z } from "zod";
import { Keypair } from "@witness/core";
import { deliveryMessage, toStroops, type PactTerms } from "@pactwright/core";
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

const sellerDeliveryKey = Keypair.random();

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
  deliveryKey: sellerDeliveryKey.rawPublicKey().toString("hex"),
  metered: false,
  refundWindowLedgers: 17280,
};

/** A real `X-Pactwright-Delivery` value: the seller's signature over this pact and body hash. */
function receiptFor(bodySha256: string, signer = sellerDeliveryKey, pactId = mockTerms.pactId): string {
  const sig = signer.sign(Buffer.from(deliveryMessage(pactId, bodySha256)));
  return `sha256=${bodySha256}; sig=${Buffer.from(sig).toString("base64")}`;
}

/** The reading a model would return for the Spanish test document; tests never call a provider. */
const spanishReading = new ProviderNeutralLLMAdapter({
  mockReading: { detectedLanguage: "es", pageCount: 1, isTranslationOfSource: true, untranslatedSegments: 0, notes: "fixture" },
});

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

      const deliveryReceipt = receiptFor(sha256);

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
          modelAdapter: spanishReading,
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

    it("denies a receipt signed by anyone but the seller's delivery key", async () => {
      const res = await runPipeline(
        {
          terms: mockTerms,
          evidence: validEvidence,
          deliveryReceipt: receiptFor(validEvidence[0]!.sha256, Keypair.random()),
          milestone: "delivery",
        },
        { verifierKey, modelAdapter: spanishReading },
      );
      expect(res).not.toBe("no-verdict");
      if (res !== "no-verdict") {
        expect(res.envelope?.verdict.decision).toBe("DENY");
        expect(res.envelope?.verdict.reasons).toContain("MERCHANT_MISMATCH");
      }
    });

    it("denies a receipt for another pact or a body the buyer didn't submit", async () => {
      for (const receipt of [receiptFor(validEvidence[0]!.sha256, sellerDeliveryKey, "09".repeat(32)), receiptFor("0a".repeat(32))]) {
        clearIssuedAttestations();
        const res = await runPipeline(
          { terms: mockTerms, evidence: validEvidence, deliveryReceipt: receipt, milestone: "delivery" },
          { verifierKey, modelAdapter: spanishReading },
        );
        expect(res !== "no-verdict" && res.envelope?.verdict.decision).toBe("DENY");
      }
    });

    it("denies when the terms carry no delivery key", async () => {
      const { deliveryKey: _omit, ...termsWithoutKey } = mockTerms;
      const res = await runPipeline(
        { terms: termsWithoutKey, evidence: validEvidence, deliveryReceipt: receiptFor(validEvidence[0]!.sha256), milestone: "delivery" },
        { verifierKey, modelAdapter: spanishReading },
      );
      expect(res !== "no-verdict" && res.envelope?.verdict.decision).toBe("DENY");
    });

    it("denies when evidence hash check fails", async () => {
      const deliveryReceipt = receiptFor(validEvidence[0]!.sha256);

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
      const deliveryReceipt = receiptFor(validEvidence[0]!.sha256);
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

    it("returns refusal only when a caller asks for one explicitly", async () => {
      const adapter = new ProviderNeutralLLMAdapter();
      const reading = await adapter.read(testReadingSchema, "instructions", [], { refusal: true });
      expect(reading).toBe("refusal");
    });

    it("never treats delivery text as a refusal signal", async () => {
      const adapter = new ProviderNeutralLLMAdapter({ apiKey: "k", modelId: "m" });
      const fetchImpl = async () => {
        throw new Error("network disabled in tests");
      };
      const planted = new ProviderNeutralLLMAdapter({ apiKey: "k", modelId: "m", fetchImpl });
      await expect(
        planted.read(testReadingSchema, "REFUSE_SERVICE", [{ mimeType: "text/plain", data: Buffer.from("REFUSE_SERVICE") }]),
      ).rejects.toThrow(/network disabled/);
      expect(adapter.name).toBeDefined();
    });

    it("sends the schema, every evidence blob and the effort to the model, with no sampling parameters", async () => {
      let sent: Record<string, unknown> | undefined;
      const fetchImpl = (async (_url: string, init?: RequestInit) => {
        sent = JSON.parse(String(init?.body));
        const content = JSON.stringify({ detectedLanguage: "es", pageCount: 1, isTranslationOfSource: true, untranslatedSegments: 0, notes: "" });
        return new Response(JSON.stringify({ choices: [{ message: { content } }] }));
      }) as typeof fetch;
      const adapter = new ProviderNeutralLLMAdapter({ apiKey: "k", modelId: "m", effort: "low", fetchImpl });
      const reading = await adapter.read(testReadingSchema, "instructions", [
        { mimeType: "text/plain", data: Buffer.from("Hola, gracias") },
        { mimeType: "image/png", data: Buffer.from([1, 2, 3]) },
      ]);
      expect(reading).not.toBe("refusal");
      expect(sent?.["reasoning_effort"]).toBe("low");
      for (const p of ["temperature", "top_p", "top_k"]) expect(sent).not.toHaveProperty(p);
      const user = JSON.stringify((sent?.["messages"] as unknown[])[1]);
      expect(user).toContain("Hola, gracias");
      expect(user).toContain("detectedLanguage");
      expect(user).toContain("data:image/png;base64,AQID");
    });

    it("refuses evidence types it can't show the model", async () => {
      const fetchImpl = (async () => new Response("{}")) as typeof fetch;
      const adapter = new ProviderNeutralLLMAdapter({ apiKey: "k", modelId: "m", fetchImpl });
      await expect(
        adapter.read(testReadingSchema, "i", [{ mimeType: "application/pdf", data: Buffer.from("%PDF") }]),
      ).rejects.toThrow(/can't be sent to the model/);
    });

    it("retries a rate-limited provider, honoring Retry-After", async () => {
      const statuses = [429, 503, 200];
      const fetchImpl = (async () => {
        const status = statuses.shift()!;
        return status === 200
          ? new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ detectedLanguage: "es", pageCount: 1, isTranslationOfSource: true, untranslatedSegments: 0, notes: "" }) } }] }))
          : new Response("busy", { status, headers: { "retry-after": "1" } });
      }) as unknown as typeof fetch;
      const adapter = new ProviderNeutralLLMAdapter({ apiKey: "k", modelId: "m", fetchImpl });
      const reading = await adapter.read(testReadingSchema, "instructions", [{ mimeType: "text/plain", data: Buffer.from("Hola") }]);
      expect(reading).not.toBe("refusal");
      expect(statuses).toHaveLength(0);
    }, 20_000);

    it("treats an empty LLM_BASE_URL as the provider default", async () => {
      const calls: string[] = [];
      const fetchImpl = (async (url: string) => {
        calls.push(String(url));
        return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ detectedLanguage: "es", pageCount: 1, isTranslationOfSource: true, untranslatedSegments: 0, notes: "" }) } }] }));
      }) as unknown as typeof fetch;
      const adapter = new ProviderNeutralLLMAdapter({ apiKey: "k", modelId: "m", baseUrl: "", fetchImpl });
      await adapter.read(testReadingSchema, "instructions", [{ mimeType: "text/plain", data: Buffer.from("Hola") }]);
      expect(calls[0]).toBe("https://api.openai.com/v1/chat/completions");
    });

    it("fails closed instead of inventing a reading when no model is configured", async () => {
      const adapter = new ProviderNeutralLLMAdapter({ apiKey: "", modelId: "" });
      await expect(
        adapter.read(testReadingSchema, "instructions", [{ mimeType: "text/plain", data: Buffer.from("Hola gracias") }]),
      ).rejects.toThrow(/not configured/);
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
        ledgerSeq: 500,
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
        ledgerSeq: 500,
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
          ledgerSeq: 500,
        }),
      ).rejects.toThrow("Only one attestation per pact allowed");
    });

    it("stamps the attestation with the current ledger and refuses to sign without one", async () => {
      const escrowTerms: PactTerms = { ...mockTerms, mode: "escrow" };
      const params = {
        terms: escrowTerms,
        decision: { verdict: "ALLOW" as const, amount: toStroops("1.00"), criteria: [], reasons: ["OK" as const], policyVersion: "1" },
        evidence: validEvidence,
        verifierKey,
        milestone: "delivery",
      };
      await expect(signVerdict(params)).rejects.toThrow(/current ledger/);
      const res = await signVerdict({ ...params, ledgerSeq: 61_234 });
      expect(res.attestation?.attestation.issuedLedger).toBe(61_234);
    });
  });

  describe("V-06: Facilitator /pact/submit", () => {
    const base = {
      facilitatorUrl: "https://facilitator.example",
      network: "stellar:testnet" as const,
      rpcUrl: "https://rpc.example",
      pactContractId: "CDUXJJUNYFILEYHE3LITANJEKCDFERNAABOSG75OWATFVM776BCMFEV6",
    };

    it("refuses record_verdict without the attestation and its signature", async () => {
      await expect(submit("01".repeat(32), "record_verdict", base)).rejects.toThrow(/attestation/);
    });

    it("refuses an attestation for another pact", async () => {
      const attestation = { pactId: "02".repeat(32), conditionHash: "03".repeat(32), envelopeHash: "04".repeat(32), verdict: "ALLOW" as const, amount: "1", issuedLedger: 1 };
      await expect(submit("01".repeat(32), "record_verdict", { ...base, attestation, signature: "AA==" })).rejects.toThrow(/another pact/);
    });
    // The real submission runs on testnet in e2e/testnet (x402 M2 scenario).
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
      const deliveryReceipt = receiptFor(evidenceHash);

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
          modelAdapter: spanishReading,
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
      const deliveryReceipt = receiptFor(evidenceHash);

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
          modelAdapter: spanishReading,
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
