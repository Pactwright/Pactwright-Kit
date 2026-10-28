/**
 * Verdict envelope types. Mirror of Witness `VerificationEnvelopeSchema` (verdict-v1),
 * used unchanged; replaced by the vendored @witness/core import in ROADMAP K-14.
 */
export interface EvidenceItem {
  type: string;
  uri: string;
  sha256: string;
  mimeType: string;
  uploader: string;
  createdAt: string;
}

export interface CriterionResult {
  id: string;
  passed: boolean;
  score?: number;
  reason?: string;
}

export interface VerdictEnvelope {
  /** = pactId */
  agreementId: string;
  /** "delivery" | "dispute-<n>" */
  milestoneId: string;
  verifier: string;
  verifierType: string;
  criteria: CriterionResult[];
  evidence: EvidenceItem[];
  proofHash: string;
  signature: string;
  verdict: "ALLOW" | "DENY";
  timestamp: string;
  conditionHash: string;
}
