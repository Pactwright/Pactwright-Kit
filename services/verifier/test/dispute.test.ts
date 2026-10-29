import { describe, it, expect } from "vitest";
import { Keypair, type PactTerms } from "@pactwright/core";
import { runPipeline } from "../src/pipeline.ts";
import { clearIssuedAttestations } from "../src/sign.ts";

describe("Verifier Dispute Milestones (P7-05, FR-S6)", () => {
  const sellerKey = Keypair.random();
  const verifierKey = Keypair.random();
  const pactId = "55".repeat(32);

  const baseTerms: PactTerms = {
    pactId,
    mode: "escrow",
    buyer: Keypair.random().publicKey(),
    seller: sellerKey.publicKey(),
    cap: "1.00",
    condition: { kind: "document.translation", sourceText: "hello", targetLang: "es" },
    conditionHash: "aa".repeat(32),
    verdictDeadline: 1000,
    settleDeadline: 2000,
    refundWindowLedgers: 50,
  };

  it("produces a new envelope without producing a new on-chain attestation", async () => {
    clearIssuedAttestations();

    const result = await runPipeline(
      {
        terms: baseTerms,
        evidence: [
          {
            type: "document" as const,
            uri: "dispute://reason",
            sha256: "00".repeat(32),
            mimeType: "application/json",
            uploader: verifierKey.publicKey(),
            createdAt: new Date().toISOString(),
          },
        ],
        milestone: "dispute-1",
      },
      {
        verifierKey,
        ledgerSeq: 120,
        settledLedger: 100,
      },
    );

    expect(result).not.toBe("no-verdict");
    if (result === "no-verdict") return;

    expect(result.envelope).toBeDefined();
    expect(result.envelope.milestoneId).toBe("dispute-1");
    // Disputes produce new envelopes, never new attestations!
    expect(result.attestation).toBeUndefined();
  });

  it("denies dispute when submitted after refund window closed", async () => {
    const result = await runPipeline(
      {
        terms: baseTerms,
        evidence: [
          {
            type: "document" as const,
            uri: "dispute://reason",
            sha256: "00".repeat(32),
            mimeType: "application/json",
            uploader: verifierKey.publicKey(),
            createdAt: new Date().toISOString(),
          },
        ],
        milestone: "dispute-2",
      },
      {
        verifierKey,
        ledgerSeq: 200, // settledLedger (100) + refundWindowLedgers (50) = 150 < 200
        settledLedger: 100,
      },
    );

    expect(result).not.toBe("no-verdict");
    if (result === "no-verdict") return;

    expect(result.envelope.verdict.decision).toBe("DENY");
    expect(result.envelope.verdict.reasons).toContain("EVIDENCE_OUT_OF_WINDOW");
  });
});
