/**
 * delivery receipt → evidence hash check → model reads (structured output) → rules decide
 * → envelope (+ attestation for escrow). ROADMAP V-02. Core-team-only path.
 *
 * A model refusal (stop_reason "refusal") yields no verdict: the pact falls back to its
 * silence policy rather than guessing.
 */
import { createHash } from "node:crypto";
import { toStroops, type PactTerms } from "@pactwright/core";
import { Keypair } from "@witness/core";
import type { EvidenceItem, VerdictEnvelope } from "./types.ts";
import { getRuleSet } from "./rules/index.ts";
import { llmAdapter } from "./models/llm.ts";
import type { ModelAdapter } from "./models/types.ts";
import { signVerdict } from "./sign.ts";
import type { RuleDecision } from "./rules/types.ts";
import { challengeNonDelivery } from "./non-delivery.ts";

export interface PipelineInput {
  terms: PactTerms;
  evidence: EvidenceItem[];
  deliveryReceipt?: string;
  milestone: "delivery" | `dispute-${number}`;
  minAmount?: string;
}

export interface PipelineResult {
  envelope?: VerdictEnvelope;
  /** `verdict-v1 sha256=<hex> uri=<uri>` */
  envelopeRef?: string;
  /** Escrow only: base64 XDR attestation + signature. */
  attestation?: { xdr: string; signature: string };
  /** Stroops owed to the seller (partial delivery). */
  amount: bigint;
  /** True when pact is below verify.minAmount threshold (receipt only, no envelope). */
  receiptOnly?: boolean;
}

export interface PipelineOptions {
  verifierKey?: Keypair;
  modelAdapter?: ModelAdapter;
  fetchImpl?: typeof fetch;
  evidenceLoader?: (item: EvidenceItem) => Promise<Uint8Array>;
  ledgerSeq?: number;
  settledLedger?: number;
}

export function parseDeliveryHeader(header: string): { bodySha256: string; signature: string } | null {
  const match = header.match(/sha256=([0-9a-fA-F]{64});\s*sig=([A-Za-z0-9+/=]+)/);
  if (!match || !match[1] || !match[2]) return null;
  return { bodySha256: match[1].toLowerCase(), signature: match[2] };
}

export async function runPipeline(
  input: PipelineInput,
  options?: PipelineOptions,
): Promise<PipelineResult | "no-verdict"> {
  const { terms, evidence, milestone } = input;
  let deliveryReceipt = input.deliveryReceipt;

  // Resolve verifier signing key
  let verifierKey = options?.verifierKey;
  if (!verifierKey) {
    const secret = process.env.VERIFIER_SECRET_KEY;
    verifierKey = secret ? Keypair.fromSecret(secret) : Keypair.random();
  }

  const model = options?.modelAdapter ?? llmAdapter;
  const capStroops = toStroops(terms.cap);

  // Check refund window for disputes (ROADMAP P7-05, FR-S6)
  if (milestone.startsWith("dispute-") && terms.refundWindowLedgers && options?.settledLedger && options?.ledgerSeq) {
    if (options.ledgerSeq > options.settledLedger + terms.refundWindowLedgers) {
      const expiredDecision: RuleDecision = {
        verdict: "DENY",
        amount: 0n,
        criteria: [
          {
            id: "refund_window",
            verifier: verifierKey.publicKey(),
            result: "FAIL",
            code: "EVIDENCE_OUT_OF_WINDOW",
            reason: `Dispute submitted after refund window closed (${options.ledgerSeq} > ${options.settledLedger} + ${terms.refundWindowLedgers})`,
            mandatory: true,
          },
        ],
        reasons: ["EVIDENCE_OUT_OF_WINDOW"],
        policyVersion: "pactwright/dispute@1",
      };

      const signRes = await signVerdict({
        terms,
        decision: expiredDecision,
        evidence,
        verifierKey,
        milestone,
        ledgerSeq: options.ledgerSeq,
      });

      return {
        envelope: signRes.envelope,
        envelopeRef: signRes.envelopeRef,
        amount: 0n,
      };
    }
  }

  // 1. Delivery receipt check
  if (!deliveryReceipt) {
    // Challenge seller for delivery receipt
    const challengeRes = await challengeNonDelivery(terms.pactId, { fetchImpl: options?.fetchImpl });
    if (challengeRes.status === "delivered" && challengeRes.deliveryReceipt) {
      deliveryReceipt = challengeRes.deliveryReceipt;
    } else {
      // Non-delivery or timeout produces DENY
      const denyDecision: RuleDecision = {
        verdict: "DENY",
        amount: 0n,
        criteria: [
          {
            id: "delivery_receipt",
            verifier: verifierKey.publicKey(),
            result: "FAIL",
            code: "TASK_NOT_DONE",
            reason: challengeRes.reason ?? "No delivery receipt provided by seller",
            mandatory: true,
          },
        ],
        reasons: ["TASK_NOT_DONE"],
        policyVersion: "pactwright/delivery@1",
      };

      const signRes = await signVerdict({
        terms,
        decision: denyDecision,
        evidence,
        verifierKey,
        milestone,
        ledgerSeq: options?.ledgerSeq,
      });

      return {
        envelope: signRes.envelope,
        envelopeRef: signRes.envelopeRef,
        attestation: signRes.attestation,
        amount: 0n,
      };
    }
  }

  // Verify delivery receipt format
  const parsedReceipt = parseDeliveryHeader(deliveryReceipt);
  if (!parsedReceipt) {
    const denyDecision: RuleDecision = {
      verdict: "DENY",
      amount: 0n,
      criteria: [
        {
          id: "delivery_receipt",
          verifier: verifierKey.publicKey(),
          result: "FAIL",
          code: "MERCHANT_MISMATCH",
          reason: "Delivery receipt format invalid or signature missing",
          mandatory: true,
        },
      ],
      reasons: ["MERCHANT_MISMATCH"],
      policyVersion: "pactwright/delivery@1",
    };

    const signRes = await signVerdict({
      terms,
      decision: denyDecision,
      evidence,
      verifierKey,
      milestone,
      ledgerSeq: options?.ledgerSeq,
    });

    return {
      envelope: signRes.envelope,
      envelopeRef: signRes.envelopeRef,
      attestation: signRes.attestation,
      amount: 0n,
    };
  }

  // V-09: Below verify.minAmount, skip model verification; return receipt-only outcome.
  const minAmount = input.minAmount ?? terms.verify?.minAmount;
  if (minAmount) {
    const minStroops = toStroops(minAmount);
    if (capStroops < minStroops) {
      return {
        receiptOnly: true,
        amount: capStroops,
      };
    }
  }

  // 2. Evidence hash verification
  const evidencePayloads: { mimeType: string; data: Uint8Array }[] = [];
  for (const item of evidence) {
    if (!/^[0-9a-f]{64}$/i.test(item.sha256)) {
      const denyDecision: RuleDecision = {
        verdict: "DENY",
        amount: 0n,
        criteria: [
          {
            id: "evidence_hash",
            verifier: verifierKey.publicKey(),
            result: "FAIL",
            code: "CONDITION_MISMATCH",
            reason: `Invalid evidence sha256 format for URI ${item.uri}`,
            mandatory: true,
          },
        ],
        reasons: ["CONDITION_MISMATCH"],
        policyVersion: "pactwright/evidence@1",
      };

      const signRes = await signVerdict({
        terms,
        decision: denyDecision,
        evidence,
        verifierKey,
        milestone,
        ledgerSeq: options?.ledgerSeq,
      });

      return {
        envelope: signRes.envelope,
        envelopeRef: signRes.envelopeRef,
        attestation: signRes.attestation,
        amount: 0n,
      };
    }

    if (options?.evidenceLoader) {
      const data = await options.evidenceLoader(item);
      const computedHash = createHash("sha256").update(data).digest("hex");
      if (computedHash.toLowerCase() !== item.sha256.toLowerCase()) {
        const denyDecision: RuleDecision = {
          verdict: "DENY",
          amount: 0n,
          criteria: [
            {
              id: "evidence_hash",
              verifier: verifierKey.publicKey(),
              result: "FAIL",
              code: "CONDITION_MISMATCH",
              reason: `Evidence hash mismatch for ${item.uri}: computed ${computedHash}, expected ${item.sha256}`,
              mandatory: true,
            },
          ],
          reasons: ["CONDITION_MISMATCH"],
          policyVersion: "pactwright/evidence@1",
        };

        const signRes = await signVerdict({
          terms,
          decision: denyDecision,
          evidence,
          verifierKey,
          milestone,
          ledgerSeq: options?.ledgerSeq,
        });

        return {
          envelope: signRes.envelope,
          envelopeRef: signRes.envelopeRef,
          attestation: signRes.attestation,
          amount: 0n,
        };
      }
      evidencePayloads.push({ mimeType: item.mimeType, data });
    } else {
      evidencePayloads.push({
        mimeType: item.mimeType,
        data: Buffer.from(`evidence for ${item.uri}`),
      });
    }
  }

  // 3. Select rule set by condition.kind
  const kind = String(terms.condition["kind"] ?? "document.translation");
  const ruleSet = getRuleSet(kind);
  if (!ruleSet) {
    const denyDecision: RuleDecision = {
      verdict: "DENY",
      amount: 0n,
      criteria: [
        {
          id: "condition_kind",
          verifier: verifierKey.publicKey(),
          result: "FAIL",
          code: "CONDITION_MISMATCH",
          reason: `No verifier rule set registered for condition kind "${kind}"`,
          mandatory: true,
        },
      ],
      reasons: ["CONDITION_MISMATCH"],
      policyVersion: "pactwright/rules@1",
    };

    const signRes = await signVerdict({
      terms,
      decision: denyDecision,
      evidence,
      verifierKey,
      milestone,
      ledgerSeq: options?.ledgerSeq,
    });

    return {
      envelope: signRes.envelope,
      envelopeRef: signRes.envelopeRef,
      attestation: signRes.attestation,
      amount: 0n,
    };
  }

  // 4. Model reads evidence into structured output
  const instructions = `Evaluate delivered evidence for condition ${JSON.stringify(terms.condition)}`;
  const reading = await model.read(ruleSet.modelOutput, instructions, evidencePayloads);

  if (reading === "refusal") {
    // A model refusal yields no verdict (silence policy applies)
    return "no-verdict";
  }

  // 5. Deterministic rule evaluation
  const decision = ruleSet.decide(reading.output, terms.condition, capStroops);

  // 6. Sign envelope and attestation
  const signRes = await signVerdict({
    terms,
    decision,
    evidence,
    verifierKey,
    milestone,
    ledgerSeq: options?.ledgerSeq,
  });

  return {
    envelope: signRes.envelope,
    envelopeRef: signRes.envelopeRef,
    attestation: signRes.attestation,
    amount: decision.amount,
  };
}
