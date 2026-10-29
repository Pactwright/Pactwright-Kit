/**
 * Sends `record_verdict` / `release` through the facilitator's `POST /pact/submit`, which pays
 * the fee (accensa/x402-facilitator-stellar, docs/scheme_pact_stellar.md §6). ROADMAP V-06.
 * Neither call needs anyone's authorization: the verdict carries the verifier's signature.
 */
import { verdictAttestationScVal, type VerdictAttestation } from "@pactwright/core";
import { xdr } from "@stellar/stellar-base";
import { submitPactCall, type PactSubmitOptions } from "@pactwright/contracts-client/submit";

export interface SubmitOptions extends Omit<PactSubmitOptions, "signer"> {
  /** Required for `record_verdict`. */
  attestation?: VerdictAttestation;
  /** Base64 ed25519 signature over the attestation message. Required for `record_verdict`. */
  signature?: string;
}

/** Returns the transaction hash. */
export async function submit(pactId: string, call: "record_verdict" | "release", options: SubmitOptions): Promise<string> {
  const id = xdr.ScVal.scvBytes(Buffer.from(pactId, "hex"));
  let args: xdr.ScVal[];
  if (call === "record_verdict") {
    if (!options.attestation || !options.signature) throw new Error("record_verdict needs the attestation and its signature");
    if (options.attestation.pactId.toLowerCase() !== pactId.toLowerCase()) throw new Error("attestation is for another pact");
    args = [id, verdictAttestationScVal(options.attestation), xdr.ScVal.scvBytes(Buffer.from(options.signature, "base64"))];
  } else {
    args = [id];
  }
  const { attestation: _a, signature: _s, ...pactOptions } = options;
  try {
    return (await submitPactCall(call, args, pactOptions)).transaction;
  } catch (err) {
    console.error(`[submit] ${call} for pact ${pactId} failed: ${err instanceof Error ? err.message : String(err)}`);
    throw err;
  }
}
