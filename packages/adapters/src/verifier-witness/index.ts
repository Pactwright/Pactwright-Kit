/** Witness-compatible verifier client (MVP). ROADMAP K-13. */
import { verifyEnvelope as checkWitnessEnvelope, type VerificationEnvelope } from "@witness/core";
import type { Verifier, VerdictInput, VerdictOutput } from "../types.ts";

export interface VerifierWitnessOptions {
  verifierUrl?: string;
  verifierPublicKey?: string;
  fetchImpl?: typeof fetch;
}

export class VerifierWitness implements Verifier {
  private readonly verifierUrl: string;
  private readonly verifierPublicKey?: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options?: VerifierWitnessOptions) {
    this.verifierUrl = options?.verifierUrl ?? process.env.VERIFIER_URL ?? "https://verifier.pactwright.dev";
    this.verifierPublicKey = options?.verifierPublicKey ?? process.env.VERIFIER_PUBLIC_KEY;
    this.fetchImpl = options?.fetchImpl ?? globalThis.fetch;
  }

  async requestVerdict(input: VerdictInput): Promise<VerdictOutput> {
    const url = `${this.verifierUrl.replace(/\/$/, "")}/v1/verdicts`;

    const res = await this.fetchImpl(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        terms: input.terms,
        evidence: input.evidence,
        deliveryReceipt: input.deliveryReceipt,
      }),
    });

    if (!res.ok) {
      throw new Error(`Verifier /v1/verdicts failed with HTTP ${res.status}`);
    }

    interface VerdictResponse {
      verdict: "allow" | "deny" | "ALLOW" | "DENY";
      amount: string;
      envelopeRef?: string;
      envelope?: { hash?: string; proofHash?: string };
    }

    const data = (await res.json()) as VerdictResponse;
    const envelopeRef = data.envelopeRef ?? data.envelope?.hash ?? data.envelope?.proofHash ?? "envelope_ref_placeholder";
    const verdict = data.verdict.toUpperCase() as "ALLOW" | "DENY";

    return {
      verdict,
      amount: data.amount,
      envelopeRef,
    };
  }

  async verifyEnvelope(envelopeRef: string): Promise<boolean> {
    const url = `${this.verifierUrl.replace(/\/$/, "")}/v1/envelopes/${envelopeRef}`;

    let res: Response;
    try {
      res = await this.fetchImpl(url, {
        headers: { Accept: "application/json" },
      });
    } catch {
      return false;
    }

    if (!res.ok) return false;

    try {
      const envelope = (await res.json()) as VerificationEnvelope;
      const check = checkWitnessEnvelope(envelope);
      if (!check.ok) return false;
      if (this.verifierPublicKey && envelope.verifier !== this.verifierPublicKey) {
        return false;
      }
      return true;
    } catch {
      return false;
    }
  }
}
