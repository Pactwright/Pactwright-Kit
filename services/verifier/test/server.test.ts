import { describe, expect, it } from "vitest";
import { Keypair, type VerificationEnvelope } from "@witness/core";
import { NotImplementedError } from "@pactwright/core";
import { createApp } from "../src/server.ts";
import { DuplicateVerdictError, MemoryVerdictStore } from "../src/store.ts";
import { loadVerifierConfig, type VerifierConfigError } from "../src/config.ts";
import { runPipeline, type PipelineResult } from "../src/pipeline.ts";

const key = Keypair.fromRawEd25519Seed(Buffer.alloc(32, 7));
const hex = "a".repeat(64);
const G = key.publicKey();
const C = "CABQGAYDAMBQGAYDAMBQGAYDAMBQGAYDAMBQGAYDAMBQGAYDAMBQGTV3";
const terms = {
  pactId: hex, mode: "escrow", buyer: G, seller: C, resourceUrl: "https://seller.example/x",
  cap: "1", nonce: "1", conditionHash: hex, condition: { kind: "document.translation", lang: "pt", minPages: 1 },
  verifier: hex, metered: false, silence: "refund", verdictDeadline: 10, settleDeadline: 20, refundWindowLedgers: 0,
};
const evidence = [{ type: "document", uri: "s3://bucket/x", sha256: hex, mimeType: "application/pdf", uploader: G, createdAt: "2026-10-28T00:00:00.000Z" }];

function envelopeFor(milestone: string): VerificationEnvelope {
  return { agreementId: hex, milestoneId: milestone, verifier: G, verifierType: "automated_agent", criteria: [], evidence: [],
    proofHash: hex, signature: "c2ln", verdict: { decision: "ALLOW", reasons: ["OK"], policyVersion: "1" }, timestamp: "2026-10-28T00:00:00.000Z",
    conditionHash: hex } as unknown as VerificationEnvelope;
}

function fakePipeline(sha: string): () => Promise<PipelineResult> {
  return async () => ({ envelope: envelopeFor("delivery"), envelopeRef: `verdict-v1 sha256=${sha} uri=https://v.example/e/${sha}`, amount: 10_000_000n });
}

const post = (app: ReturnType<typeof createApp>, body: unknown) =>
  app.request("/v1/verdicts", { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } });

describe("verifier HTTP API", () => {
  it("GET /health reports the signing key", async () => {
    const app = createApp({ verifierKey: key, store: new MemoryVerdictStore(), pipeline: runPipeline });
    const res = await app.request("/health");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, verifier: G, verifierHex: key.rawPublicKey().toString("hex") });
  });

  it("POST /v1/verdicts stores the envelope, then rejects a second delivery verdict with 409", async () => {
    const store = new MemoryVerdictStore();
    const sha = "b".repeat(64);
    const app = createApp({ verifierKey: key, store, pipeline: fakePipeline(sha) });
    const first = await post(app, { terms, evidence });
    expect(first.status).toBe(201);
    expect((await first.json()).amount).toBe("10000000");

    const second = await post(app, { terms, evidence });
    expect(second.status).toBe(409);
    expect(await second.json()).toEqual({ error: "verdict_exists", envelopeSha256: sha });

    const fetched = await app.request(`/v1/envelopes/${sha}`);
    expect(fetched.status).toBe(200);
  });

  it("a dispute milestone is a separate verdict", async () => {
    const store = new MemoryVerdictStore();
    await store.put(envelopeFor("delivery"), "c".repeat(64));
    const app = createApp({ verifierKey: key, store, pipeline: fakePipeline("d".repeat(64)) });
    expect((await post(app, { terms, evidence, milestone: "delivery" })).status).toBe(409);
    expect(await store.find(hex, "dispute-1")).toBeUndefined();
  });

  it("returns 501 naming the roadmap task while the pipeline is a stub", async () => {
    const stubPipeline = () => { throw new NotImplementedError("V-02"); };
    const app = createApp({ verifierKey: key, store: new MemoryVerdictStore(), pipeline: stubPipeline });
    const res = await post(app, { terms, evidence });
    expect(res.status).toBe(501);
    expect(await res.json()).toEqual({ error: "not_implemented", roadmapTask: "V-02" });
  });

  it("returns 202 with no verdict on a model refusal", async () => {
    const app = createApp({ verifierKey: key, store: new MemoryVerdictStore(), pipeline: async () => "no-verdict" });
    expect((await post(app, { terms, evidence })).status).toBe(202);
  });

  it.each([
    ["missing evidence", { terms }],
    ["bad milestone", { terms, evidence, milestone: "appeal" }],
    ["not JSON", "nope"],
  ])("rejects %s with 400", async (_n, body) => {
    const app = createApp({ verifierKey: key, store: new MemoryVerdictStore(), pipeline: runPipeline });
    expect((await post(app, body)).status).toBe(400);
  });

  it("GET /v1/envelopes validates the hash and returns 404 when unknown", async () => {
    const app = createApp({ verifierKey: key, store: new MemoryVerdictStore(), pipeline: runPipeline });
    expect((await app.request("/v1/envelopes/xyz")).status).toBe(400);
    expect((await app.request(`/v1/envelopes/${"e".repeat(64)}`)).status).toBe(404);
  });
});

describe("MemoryVerdictStore", () => {
  it("enforces one envelope per (pact, milestone)", async () => {
    const store = new MemoryVerdictStore();
    await store.put(envelopeFor("delivery"), "1".repeat(64));
    await expect(store.put(envelopeFor("delivery"), "2".repeat(64))).rejects.toBeInstanceOf(DuplicateVerdictError);
    await store.put(envelopeFor("dispute-1"), "3".repeat(64));
    expect(await store.find(hex, "dispute-1")).toBe("3".repeat(64));
  });
});

describe("loadVerifierConfig", () => {
  const env = {
    VERIFIER_PROVIDER: "example", VERIFIER_MODEL: "model-1", VERIFIER_SECRET_KEY: key.secret(),
    FACILITATOR_URL: "https://facilitator.example", EVIDENCE_BUCKET_URL: "s3://evidence",
  };
  it("loads a complete config with defaults", () => {
    const config = loadVerifierConfig(env);
    expect(config.verifierKey.publicKey()).toBe(G);
    expect(config.port).toBe(8787);
    expect(config.nonDeliveryTimeoutSec).toBe(300);
  });
  it("reports every problem at once", () => {
    try {
      loadVerifierConfig({ VERIFIER_SECRET_KEY: "SNOTVALID", VERIFIER_PORT: "-1" });
      expect.unreachable();
    } catch (e) {
      const problems = (e as VerifierConfigError).problems.join("\n");
      expect(problems).toMatch(/VERIFIER_PROVIDER is not set/);
      expect(problems).toMatch(/VERIFIER_SECRET_KEY is not a valid/);
      expect(problems).toMatch(/VERIFIER_PORT must be a positive integer/);
    }
  });
});
