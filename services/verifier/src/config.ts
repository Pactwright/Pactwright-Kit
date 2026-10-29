/** Verifier configuration. Startup fails, listing every problem, if anything is missing. ROADMAP V-01. */
import { Keypair } from "@witness/core";

export interface VerifierConfig {
  /** LLM provider used by models/llm.ts. Recorded in every envelope. */
  provider: string;
  /** Pinned model ID. Recorded in every envelope. */
  model: string;
  /** Explicit reasoning effort, where the provider supports it. Recorded in every envelope. */
  effort?: string;
  /** API key for the model provider. Required: the verifier never invents a reading. */
  llmApiKey: string;
  /** OpenAI-compatible base URL of the provider; the adapter's default when unset. */
  llmBaseUrl?: string;
  /** Signs envelopes (Witness) and attestations (escrow). Same ed25519 key. */
  verifierKey: Keypair;
  facilitatorUrl: string;
  evidenceBucketUrl: string;
  /** Stellar RPC: the current ledger goes into every escrow attestation. */
  rpcUrl: string;
  /** Where this service is reachable; envelope references point at `<publicUrl>/v1/envelopes/<sha256>`. */
  publicUrl: string;
  /** Postgres for envelopes. Required in production so they survive restarts; memory otherwise. */
  databaseUrl?: string;
  /** Seconds a seller has to answer a non-delivery challenge. */
  nonDeliveryTimeoutSec: number;
  port: number;
}

export class VerifierConfigError extends Error {
  readonly problems: string[];
  constructor(problems: string[]) {
    super(`invalid verifier configuration:\n- ${problems.join("\n- ")}`);
    this.problems = problems;
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
  const llmApiKey = required("VERIFIER_LLM_API_KEY");
  const llmBaseUrl = env.LLM_BASE_URL?.trim() || undefined;
  if (llmBaseUrl) url(llmBaseUrl, "LLM_BASE_URL", problems);
  const secret = required("VERIFIER_SECRET_KEY");
  const facilitatorUrl = required("FACILITATOR_URL");
  const evidenceBucketUrl = required("EVIDENCE_BUCKET_URL");
  const rpcUrl = required("STELLAR_RPC_URL");
  if (facilitatorUrl) url(facilitatorUrl, "FACILITATOR_URL", problems);
  if (evidenceBucketUrl) url(evidenceBucketUrl, "EVIDENCE_BUCKET_URL", problems);
  if (rpcUrl) url(rpcUrl, "STELLAR_RPC_URL", problems);
  // Render injects RENDER_EXTERNAL_URL; VERIFIER_PUBLIC_URL wins when both are set.
  const publicUrl = (env.VERIFIER_PUBLIC_URL?.trim() || env.RENDER_EXTERNAL_URL?.trim() || "").replace(/\/+$/, "");
  if (!publicUrl) problems.push("VERIFIER_PUBLIC_URL is not set (the URL envelope references point at)");
  else url(publicUrl, "VERIFIER_PUBLIC_URL", problems);
  const databaseUrl = env.VERIFIER_DATABASE_URL?.trim() || env.DATABASE_URL?.trim() || undefined;
  if (!databaseUrl && env.NODE_ENV === "production") {
    problems.push("DATABASE_URL is not set (production keeps envelopes in Postgres so they survive restarts)");
  }
  const nonDeliveryTimeoutSec = positiveInt(env.NON_DELIVERY_TIMEOUT_SEC, 300, "NON_DELIVERY_TIMEOUT_SEC", problems);
  // Hosts such as Render inject PORT; VERIFIER_PORT wins when both are set.
  const portVar = env.VERIFIER_PORT?.trim() ? "VERIFIER_PORT" : "PORT";
  const port = positiveInt(env[portVar], 8787, portVar, problems);

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
    llmApiKey,
    ...(llmBaseUrl ? { llmBaseUrl } : {}),
    verifierKey,
    facilitatorUrl,
    evidenceBucketUrl,
    rpcUrl,
    publicUrl,
    ...(databaseUrl ? { databaseUrl } : {}),
    nonDeliveryTimeoutSec,
    port,
  };
}
