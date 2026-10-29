/** Signs the verdict-v1 envelope and, for escrow, exactly one VerdictAttestation per pact. Core-team-only path. ROADMAP V-05. */
import {
  conditionHash as computeConditionHash,
  verdictMessage,
  type PactTerms,
  type VerdictAttestation,
} from "@pactwright/core";
import {
  computeProofHash,
  signEnvelope,
  type Keypair,
  type UnsignedEnvelope,
} from "@witness/core";
import type { EvidenceItem, VerdictEnvelope } from "./types.ts";
import type { RuleDecision } from "./rules/types.ts";

/** Invariant: Exactly one attestation per pact_id. */
const issuedAttestations = new Set<string>();

export function hasIssuedAttestation(pactId: string): boolean {
  return issuedAttestations.has(pactId.toLowerCase());
}

export function clearIssuedAttestations(): void {
  issuedAttestations.clear();
}

export interface SignPipelineParams {
  terms: PactTerms;
  decision: RuleDecision;
  evidence: EvidenceItem[];
  verifierKey: Keypair;
  milestone: "delivery" | `dispute-${number}`;
  ledgerSeq?: number;
}

export interface SignPipelineResult {
  envelope: VerdictEnvelope;
  envelopeRef: string;
  envelopeSha256: string;
  attestation?: {
    attestation: VerdictAttestation;
    signature: string;
    xdr: string;
  };
}

export async function signVerdict(params: SignPipelineParams): Promise<SignPipelineResult> {
  const { terms, decision, evidence, verifierKey, milestone, ledgerSeq = 100 } = params;

  const condHash = terms.conditionHash || computeConditionHash(terms.condition);

  const unsigned: UnsignedEnvelope = {
    agreementId: terms.pactId,
    milestoneId: milestone,
    verifier: verifierKey.publicKey(),
    verifierType: "automated_agent",
    criteria: decision.criteria,
    evidence,
    verdict: {
      decision: decision.verdict,
      reasons: decision.reasons,
      policyVersion: decision.policyVersion,
    },
    timestamp: new Date().toISOString(),
    conditionHash: condHash,
  };

  const envelope = signEnvelope(unsigned, verifierKey);
  const proofHash = computeProofHash(condHash, evidence);
  const envelopeSha256 = proofHash;
  const envelopeRef = `verdict-v1 sha256=${envelopeSha256} uri=https://verifier.pactwright.dev/v1/envelopes/${envelopeSha256}`;

  let attestationResult: SignPipelineResult["attestation"];

  // Escrow pacts require exactly one on-chain VerdictAttestation (delivery milestone only).
  // Disputes produce new envelopes, never new attestations (ROADMAP P7-05, FR-S6).
  if (terms.mode === "escrow" && milestone === "delivery") {
    const pactIdLower = terms.pactId.toLowerCase();
    if (issuedAttestations.has(pactIdLower)) {
      throw new Error(`Attestation already issued for pact ${terms.pactId}. Only one attestation per pact allowed.`);
    }

    const attestation: VerdictAttestation = {
      pactId: terms.pactId,
      conditionHash: condHash,
      envelopeHash: envelopeSha256,
      verdict: decision.verdict,
      amount: decision.amount.toString(),
      issuedLedger: ledgerSeq,
    };

    const msgBytes = verdictMessage(attestation);
    const signatureBytes = verifierKey.sign(Buffer.from(msgBytes));
    const signature = Buffer.from(signatureBytes).toString("base64");

    issuedAttestations.add(pactIdLower);

    attestationResult = {
      attestation,
      signature,
      xdr: signature,
    };
  }

  return {
    envelope,
    envelopeRef,
    envelopeSha256,
    attestation: attestationResult,
  };
}
