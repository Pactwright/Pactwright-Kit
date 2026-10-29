/** Submits record_verdict / release through the facilitator's /pact/submit. ROADMAP V-06. */
import type { VerdictAttestation } from "@pactwright/core";

export interface SubmitOptions {
  facilitatorUrl?: string;
  apiKey?: string;
  fetchImpl?: typeof fetch;
  attestation?: VerdictAttestation;
  signature?: string;
}

export async function submit(
  pactId: string,
  call: "record_verdict" | "release",
  options?: SubmitOptions,
): Promise<string> {
  const facilitatorBase = (options?.facilitatorUrl ?? process.env.FACILITATOR_URL ?? "https://facilitator.pactwright.dev").replace(/\/$/, "");
  const url = `${facilitatorBase}/pact/submit`;
  const doFetch = options?.fetchImpl ?? globalThis.fetch;

  const payload = {
    pactId,
    call,
    attestation: options?.attestation,
    signature: options?.signature,
  };

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  const key = options?.apiKey ?? process.env.FACILITATOR_API_KEY;
  if (key) {
    headers["Authorization"] = `Bearer ${key}`;
  }

  let res: Response;
  try {
    res = await doFetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });
  } catch (err) {
    console.error(`[submit] Network failure submitting ${call} for pact ${pactId}: ${String(err)}`);
    throw new Error(`Failed to submit ${call} for pact ${pactId}: ${String(err)}`);
  }

  if (!res.ok) {
    const errorBody = await res.text().catch(() => "");
    console.error(`[submit] Failed submitting ${call} for pact ${pactId} HTTP ${res.status}: ${errorBody}`);
    throw new Error(`Facilitator /pact/submit failed for pact ${pactId} with HTTP ${res.status}`);
  }

  interface SubmitResponse {
    txHash?: string;
    tx?: string;
  }

  const data = (await res.json().catch(() => ({}))) as SubmitResponse;
  const txHash = data.txHash ?? data.tx;
  if (!txHash) throw new Error(`Facilitator accepted ${call} for pact ${pactId} but returned no transaction hash`);
  return txHash;
}
