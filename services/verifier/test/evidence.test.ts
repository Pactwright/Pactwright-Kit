import { describe, expect, it } from "vitest";
import { createEvidenceLoader, EvidenceFetchError } from "../src/evidence.ts";

const item = (uri: string) => ({
  type: "document" as const, uri, sha256: "a".repeat(64), mimeType: "text/plain",
  uploader: "G", createdAt: "2026-10-29T00:00:00.000Z",
});

function recordingFetch(body = "hola") {
  const urls: string[] = [];
  const fetchImpl = (async (input: URL | string) => {
    urls.push(String(input));
    return new Response(body);
  }) as typeof fetch;
  return { urls, fetchImpl };
}

describe("createEvidenceLoader", () => {
  it("fetches absolute and relative URIs inside the bucket", async () => {
    const { urls, fetchImpl } = recordingFetch();
    const load = createEvidenceLoader("https://evidence.example/pactwright", { fetchImpl });
    expect(new TextDecoder().decode(await load(item("https://evidence.example/pactwright/a.txt")))).toBe("hola");
    await load(item("b.txt"));
    expect(urls).toEqual(["https://evidence.example/pactwright/a.txt", "https://evidence.example/pactwright/b.txt"]);
  });

  it("refuses URIs outside the bucket, including traversal and lookalike prefixes", async () => {
    const { urls, fetchImpl } = recordingFetch();
    const load = createEvidenceLoader("https://evidence.example/pactwright/", { fetchImpl });
    for (const uri of [
      "https://attacker.example/x",
      "../secret",
      "https://evidence.example/pactwright-other/x",
      "http://169.254.169.254/latest/meta-data",
    ]) {
      await expect(load(item(uri))).rejects.toBeInstanceOf(EvidenceFetchError);
    }
    expect(urls).toEqual([]);
  });

  it("refuses failed fetches and oversized blobs", async () => {
    const notFound = (async () => new Response("", { status: 404 })) as typeof fetch;
    await expect(createEvidenceLoader("https://e.example/", { fetchImpl: notFound })(item("x"))).rejects.toThrow(/HTTP 404/);
    const { fetchImpl } = recordingFetch("x".repeat(11));
    await expect(createEvidenceLoader("https://e.example/", { fetchImpl, maxBytes: 10 })(item("x"))).rejects.toThrow(/larger/);

    // declared content-length > maxBytes
    const declaredOversized = (async () => new Response("short", { headers: { "content-length": "200" } })) as typeof fetch;
    await expect(createEvidenceLoader("https://e.example/", { fetchImpl: declaredOversized, maxBytes: 10 })(item("x"))).rejects.toThrow(/larger than 10 bytes/);

    // malformed content-length does not throw NaN error
    const malformedHeader = (async () => new Response("short", { headers: { "content-length": "invalid-nan" } })) as typeof fetch;
    const loaded = await createEvidenceLoader("https://e.example/", { fetchImpl: malformedHeader, maxBytes: 100 })(item("x"));
    expect(new TextDecoder().decode(loaded)).toBe("short");
  });

  it("times out on stalled evidence fetch", async () => {
    const stalledFetch: typeof fetch = async (_input, init) => {
      return new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          const err = new Error("aborted");
          err.name = "TimeoutError";
          reject(err);
        });
      });
    };
    const loader = createEvidenceLoader("https://e.example/", { fetchImpl: stalledFetch, timeoutMs: 25 });
    await expect(loader(item("slow.txt"))).rejects.toThrow(/timed out/);
  });

  it("refuses a bucket it can't read over http(s)", () => {
    expect(() => createEvidenceLoader("s3://evidence")).toThrow(EvidenceFetchError);
  });
});
