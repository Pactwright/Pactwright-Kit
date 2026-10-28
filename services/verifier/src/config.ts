/** Verifier configuration. Startup fails, listing every problem, if anything is missing. ROADMAP V-01. */
import { Keypair } from "@witness/core";

export interface VerifierConfig {
  /** LLM provider used by models/llm.ts. Recorded in every envelope. */
  provider: string;
  /** Pinned model ID. Recorded in every envelope. */
  model: string;
  /** Explicit reasoning effort, where the provider supports it. Recorded in every envelope. */
  effort?: string;
  /** Signs envelopes (Witness) and attestations (escrow). Same ed25519 key. */
  verifierKey: Keypair;
  facilitatorUrl: string;
  evidenceBucketUrl: string;
  /** Seconds a seller has to answer a non-delivery challenge. */
  nonDeliveryTimeoutSec: number;
  port: number;
}

export class VerifierConfigError extends Error {
  constructor(public readonly problems: string[]) {
    super(`invalid verifier configuration:\n- ${problems.join("\n- ")}`);
    this.name = "VerifierConfigError";
  }
}

function positiveInt(value: string | undefined, fallback: number, name: string, problems: string[]): number {
  if (value === undefined || value.trim() === "") return fallback;
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) problems.push(`${name} must be a positive integer`);
  return n;
}

function url(value: string, name: string, problems: string[]): void {
  try {
    const u = new URL(value);
    if (u.protocol !== "https:" && u.protocol !== "http:" && u.protocol !== "s3:") throw new Error();
  } catch {
    problems.push(`${name} is not a valid URL`);
  }
}

export function loadVerifierConfig(env: NodeJS.ProcessEnv): VerifierConfig {
  const problems: string[] = [];
  const required = (name: string): string => {
    const value = env[name]?.trim();
    if (!value) problems.push(`${name} is not set`);
    return value ?? "";
  };

  const provider = required("VERIFIER_PROVIDER");
  const model = required("VERIFIER_MODEL");
  const effort = env.VERIFIER_EFFORT?.trim() || undefined;
  const secret = required("VERIFIER_SECRET_KEY");
  const facilitatorUrl = required("FACILITATOR_URL");
  const evidenceBucketUrl = required("EVIDENCE_BUCKET_URL");
  if (facilitatorUrl) url(facilitatorUrl, "FACILITATOR_URL", problems);
  if (evidenceBucketUrl) url(evidenceBucketUrl, "EVIDENCE_BUCKET_URL", problems);
  const nonDeliveryTimeoutSec = positiveInt(env.NON_DELIVERY_TIMEOUT_SEC, 300, "NON_DELIVERY_TIMEOUT_SEC", problems);
  const port = positiveInt(env.VERIFIER_PORT, 8787, "VERIFIER_PORT", problems);

  let verifierKey: Keypair | undefined;
  if (secret) {
    try {
      verifierKey = Keypair.fromSecret(secret);
    } catch {
      problems.push("VERIFIER_SECRET_KEY is not a valid Stellar secret seed (S…)");
    }
  }

  if (problems.length || !verifierKey) throw new VerifierConfigError(problems);
  return {
    provider,
    model,
    ...(effort ? { effort } : {}),
    verifierKey,
    facilitatorUrl,
    evidenceBucketUrl,
    nonDeliveryTimeoutSec,
    port,
  };
}
