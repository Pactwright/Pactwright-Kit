/** Fetches a certificate (pending | anchored) and verifies it offline. ROADMAP K-08. */
import { CertificateSchema, verifyProof, type Certificate } from "@pactwright/core";
import type { PactwrightConfig } from "./client.ts";

export interface CertificateOptions {
  certificateData?: Certificate;
  fetchImpl?: typeof fetch;
}

export async function getCertificate(
  config: PactwrightConfig,
  pactId: string,
  options?: CertificateOptions,
): Promise<Certificate> {
  let cert: Certificate;

  if (options?.certificateData) {
    cert = options.certificateData;
  } else {
    const doFetch = options?.fetchImpl ?? config.fetchImpl ?? globalThis.fetch;
    const base = (config.facilitatorUrl ?? "https://studio.pactwright.dev").replace(/\/$/, "");
    const res = await doFetch(`${base}/api/certificates/${pactId}`);
    if (!res.ok) {
      throw new Error(`Failed to fetch certificate for pact ${pactId}: HTTP ${res.status}`);
    }
    cert = (await res.json()) as Certificate;
  }

  const parsed = CertificateSchema.parse(cert);

  if (parsed.status === "anchored") {
    if (!parsed.proof || !parsed.root) {
      throw new Error("Anchored certificate missing proof or root");
    }
    const isValid = verifyProof(parsed.leaf, parsed.proof, parsed.root);
    if (!isValid) {
      throw new Error("Certificate Merkle proof verification failed");
    }
  }

  return parsed;
}
