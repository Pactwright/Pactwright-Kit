/**
 * Evidence loader for the hosted verifier. ROADMAP V-10.
 *
 * Fetches evidence blobs only from the configured evidence bucket (`EVIDENCE_BUCKET_URL`), so a
 * request can't make the verifier fetch arbitrary URLs. The pipeline then checks each blob's
 * sha256 against the evidence item before the model reads it.
 */
import type { EvidenceItem } from "@witness/core";

export const DEFAULT_MAX_EVIDENCE_BYTES = 10 * 1024 * 1024;

export class EvidenceFetchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EvidenceFetchError";
  }
}

export interface EvidenceLoaderOptions {
  fetchImpl?: typeof fetch;
  maxBytes?: number;
}

/** Relative URIs resolve under the bucket; anything that resolves outside it is refused. */
export function createEvidenceLoader(
  bucketUrl: string,
  options?: EvidenceLoaderOptions,
): (item: EvidenceItem) => Promise<Uint8Array> {
  const base = new URL(bucketUrl);
  if (base.protocol !== "https:" && base.protocol !== "http:") {
    throw new EvidenceFetchError(`EVIDENCE_BUCKET_URL must be an http(s) URL the verifier can read, got ${base.protocol}`);
  }
  const prefix = base.href.endsWith("/") ? base.href : `${base.href}/`;
  const fetchImpl = options?.fetchImpl ?? globalThis.fetch;
  const maxBytes = options?.maxBytes ?? DEFAULT_MAX_EVIDENCE_BYTES;

  return async (item) => {
    let target: URL;
    try {
      target = new URL(item.uri, prefix);
    } catch {
      throw new EvidenceFetchError(`evidence URI is not a valid URL: ${item.uri}`);
    }
    if (!target.href.startsWith(prefix)) {
      throw new EvidenceFetchError(`evidence URI is outside the evidence bucket: ${item.uri}`);
    }
    const res = await fetchImpl(target, { redirect: "error" });
    if (!res.ok) throw new EvidenceFetchError(`evidence fetch failed: HTTP ${res.status} for ${item.uri}`);
    const declared = Number(res.headers.get("content-length") ?? "0");
    if (declared > maxBytes) throw new EvidenceFetchError(`evidence is larger than ${maxBytes} bytes: ${item.uri}`);
    const data = new Uint8Array(await res.arrayBuffer());
    if (data.byteLength > maxBytes) throw new EvidenceFetchError(`evidence is larger than ${maxBytes} bytes: ${item.uri}`);
    return data;
  };
}
