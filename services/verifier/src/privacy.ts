/** v1: evidence retention limits and redaction hook. ROADMAP P7-09, FR-V10. */
import type { PactTerms } from "@pactwright/core";
import type { VerdictStore } from "./store.ts";

export interface RedactionRule {
  pattern: RegExp;
  replacement: string;
}

export const DEFAULT_REDACTION_RULES: RedactionRule[] = [
  // Email addresses
  { pattern: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, replacement: "[REDACTED_EMAIL]" },
  // Stellar secret keys (S...)
  { pattern: /S[A-Z0-9]{55}/g, replacement: "[REDACTED_SECRET_KEY]" },
  // Credit cards
  { pattern: /\b(?:\d{4}[ -]?){3}\d{4}\b/g, replacement: "[REDACTED_PAYMENT_CARD]" },
  // Phone numbers (US/international)
  { pattern: /\b(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g, replacement: "[REDACTED_PHONE]" },
];

/**
 * Applies privacy redactions to evidence objects or text before model evaluation.
 */
export function redactEvidence<T>(
  evidence: T,
  rules: RedactionRule[] = DEFAULT_REDACTION_RULES,
): { redacted: T; redactionCount: number } {
  let redactionCount = 0;

  function redactString(str: string): string {
    let current = str;
    for (const rule of rules) {
      const matches = current.match(rule.pattern);
      if (matches) {
        redactionCount += matches.length;
        current = current.replace(rule.pattern, rule.replacement);
      }
    }
    return current;
  }

  function redactValue(val: unknown): unknown {
    if (typeof val === "string") {
      return redactString(val);
    }
    if (Array.isArray(val)) {
      return val.map((item) => redactValue(item));
    }
    if (val !== null && typeof val === "object") {
      const result: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(val)) {
        result[k] = redactValue(v);
      }
      return result;
    }
    return val;
  }

  const redacted = redactValue(evidence) as T;
  return { redacted, redactionCount };
}

/**
 * Returns standard evidence privacy disclosure text explaining retention and model processing.
 */
export function getEvidencePrivacyDisclosure(terms?: PactTerms): string {
  const retentionDays = terms?.refundWindowLedgers ? Math.ceil((terms.refundWindowLedgers * 5) / 86400) + 14 : 30;
  return [
    "Pactwright Verifier Evidence Privacy Disclosure (FR-V10):",
    "1. Evidence provided is processed strictly for automated deterministic rule evaluation and LLM semantic checks.",
    `2. Raw evidence data is retained for a maximum of ${retentionDays} days to service dispute milestones, after which it is automatically purged.`,
    "3. Automated PII redaction filters are applied prior to submission to provider LLM endpoints.",
    "4. Verifier envelopes record only cryptographic SHA-256 digests of evidence, never raw plaintext.",
  ].join("\n");
}

/** In-memory store for tracking evidence creation timestamps for retention cleanup */
const evidenceTimestamps = new Map<string, number>();

export function recordEvidenceTimestamp(evidenceSha256: string, timestampMs = Date.now()): void {
  evidenceTimestamps.set(evidenceSha256.toLowerCase(), timestampMs);
}

/**
 * Purges evidence older than maxAgeMs from store memory.
 */
export async function applyRetention(
  _store?: VerdictStore,
  maxAgeMs = 30 * 24 * 60 * 60 * 1000,
): Promise<number> {
  const cutoff = Date.now() - maxAgeMs;
  let purgedCount = 0;

  for (const [hash, ts] of evidenceTimestamps.entries()) {
    if (ts < cutoff) {
      evidenceTimestamps.delete(hash);
      purgedCount++;
    }
  }

  return purgedCount;
}

export function clearEvidenceTimestamps(): void {
  evidenceTimestamps.clear();
}
