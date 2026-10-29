import { describe, it, expect, beforeEach } from "vitest";
import {
  redactEvidence,
  getEvidencePrivacyDisclosure,
  applyRetention,
  recordEvidenceTimestamp,
  clearEvidenceTimestamps,
} from "../src/privacy.ts";

describe("Evidence Privacy & Retention (P7-09, FR-V10)", () => {
  beforeEach(() => {
    clearEvidenceTimestamps();
  });

  it("redacts sensitive PII (emails, phone numbers, secret keys)", () => {
    const evidence = {
      user: "Contact alice@example.com or call 555-123-4567",
      apiKey: "SDAW3R42JQK2QO2X4Y373B6F2P2F76J2W3R42JQK2QO2X4Y373B6F2P2",
      notes: ["Send invoice to billing@pactwright.dev"],
    };

    const { redacted, redactionCount } = redactEvidence(evidence);
    expect(redactionCount).toBe(4);
    expect(redacted.user).toBe("Contact [REDACTED_EMAIL] or call [REDACTED_PHONE]");
    expect(redacted.apiKey).toBe("[REDACTED_SECRET_KEY]");
    expect(redacted.notes[0]).toBe("Send invoice to [REDACTED_EMAIL]");
  });

  it("produces standard privacy disclosure text", () => {
    const disclosure = getEvidencePrivacyDisclosure();
    expect(disclosure).toContain("Evidence Privacy Disclosure");
    expect(disclosure).toContain("cryptographic SHA-256 digests");
  });

  it("purges evidence older than the retention cutoff", async () => {
    const now = Date.now();
    const oldHash = "aa".repeat(32);
    const freshHash = "bb".repeat(32);

    // Old evidence: 40 days ago
    recordEvidenceTimestamp(oldHash, now - 40 * 24 * 60 * 60 * 1000);
    // Fresh evidence: 5 days ago
    recordEvidenceTimestamp(freshHash, now - 5 * 24 * 60 * 60 * 1000);

    const purged = await applyRetention(undefined, 30 * 24 * 60 * 60 * 1000);
    expect(purged).toBe(1);
  });
});
