/** Verify an envelope ref or certificate offline (FR-V9). ROADMAP K-12. */
import { readFileSync, existsSync } from "node:fs";
import { verifyEnvelope } from "@witness/core";

export interface VerifyCommandOptions {
  fetchImpl?: typeof fetch;
  readFileImpl?: (path: string) => string;
  verifierUrl?: string;
  log?: (msg: string) => void;
  error?: (msg: string) => void;
}

export async function verify(args: string[], options?: VerifyCommandOptions): Promise<void> {
  const log = options?.log ?? console.log;
  const errorLog = options?.error ?? console.error;

  const target = args[0];
  if (!target) {
    errorLog("usage: pactwright verify <envelope-ref | path-to-envelope.json>");
    process.exitCode = 2;
    return;
  }

  let envelopeData: unknown;

  // 1. Try reading as local file
  const reader = options?.readFileImpl ?? ((p: string) => readFileSync(p, "utf8"));
  if (existsSync(target)) {
    try {
      envelopeData = JSON.parse(reader(target));
    } catch (err) {
      errorLog(`Failed to parse file as JSON: ${String(err)}`);
      process.exitCode = 1;
      return;
    }
  } else if (target.trim().startsWith("{")) {
    try {
      envelopeData = JSON.parse(target);
    } catch (err) {
      errorLog(`Failed to parse target JSON string: ${String(err)}`);
      process.exitCode = 1;
      return;
    }
  } else {
    // 2. Fetch envelope from verifier service
    const verifierBase = (options?.verifierUrl ?? process.env.VERIFIER_URL ?? "https://verifier.pactwright.dev").replace(/\/$/, "");
    const doFetch = options?.fetchImpl ?? globalThis.fetch;
    const url = `${verifierBase}/v1/envelopes/${target}`;

    try {
      const res = await doFetch(url);
      if (!res.ok) {
        errorLog(`Failed to fetch envelope from verifier at ${url}: HTTP ${res.status}`);
        process.exitCode = 1;
        return;
      }
      envelopeData = await res.json();
    } catch (err) {
      errorLog(`Failed to connect to verifier: ${String(err)}`);
      process.exitCode = 1;
      return;
    }
  }

  // 3. Offline verification (signature, proofHash, and schema)
  const result = verifyEnvelope(envelopeData);
  if (!result.ok) {
    errorLog(`✗ Verification failed: ${result.reason}`);
    process.exitCode = 1;
    return;
  }

  const env = envelopeData as {
    verifier: string;
    proofHash: string;
    verdict?: { decision?: string; reasons?: string[] };
  };

  log(`✓ Envelope verified offline`);
  log(`  Verifier:   ${env.verifier}`);
  log(`  Verdict:    ${env.verdict?.decision ?? "UNKNOWN"} (${env.verdict?.reasons?.join(", ") ?? "none"})`);
  log(`  Proof Hash: ${env.proofHash}`);
}
