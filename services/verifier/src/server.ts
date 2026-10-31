/**
 * HTTP API (ROADMAP V-01): `GET /health`, `GET /v1/envelopes/:sha256`, `POST /v1/verdicts`.
 * `GET /health` also carries the verdict counters that feed the ops error-rate probe (XC-03).
 * Dependencies are injected so the app is testable without a network.
 */
import { serve } from "@hono/node-server";
import { Hono, type Context } from "hono";
import { z } from "zod";
import { NotImplementedError, PactTermsSchema } from "@pactwright/core";
import { EvidenceItemSchema, parseAnchorReference, type Keypair } from "@witness/core";
import type { VerifierConfig } from "./config.ts";
import { createEvidenceLoader } from "./evidence.ts";
import { VerdictMetrics } from "./metrics.ts";
import { ProviderNeutralLLMAdapter } from "./models/llm.ts";
import { runPipeline, type PipelineInput, type PipelineResult } from "./pipeline.ts";
import { DuplicateVerdictError, MemoryVerdictStore, PostgresVerdictStore, type VerdictStore } from "./store.ts";

export const VerdictRequestSchema = z.object({
  terms: PactTermsSchema,
  evidence: z.array(EvidenceItemSchema).min(1),
  deliveryReceipt: z.string().min(1).optional(),
  minAmount: z.string().optional(),
  milestone: z.union([z.literal("delivery"), z.string().regex(/^dispute-\d+$/)]).default("delivery"),
});

export interface AppDeps {
  verifierKey: Keypair;
  store: VerdictStore;
  /** Reported on /health so a deployment that would lose envelopes is visible. */
  storeKind?: "postgres" | "memory";
  pipeline: (input: PipelineInput) => Promise<PipelineResult | "no-verdict">;
}

const SHA256 = /^[0-9a-f]{64}$/;

export function createApp(deps: AppDeps): Hono {
  const app = new Hono();
  const metrics = new VerdictMetrics();

  app.get("/health", (c) =>
    c.json({
      ok: true,
      verifier: deps.verifierKey.publicKey(),
      verifierHex: deps.verifierKey.rawPublicKey().toString("hex"),
      ...(deps.storeKind ? { store: deps.storeKind } : {}),
      verdictRequests: metrics.verdictRequests,
      verdictFailures: metrics.verdictFailures,
    }),
  );

  app.get("/v1/envelopes/:sha256", async (c) => {
    const sha = c.req.param("sha256");
    if (!SHA256.test(sha)) return c.json({ error: "invalid_sha256" }, 400);
    const envelope = await deps.store.get(sha);
    return envelope ? c.json(envelope) : c.json({ error: "not_found" }, 404);
  });

  app.post("/v1/verdicts", (c) => metrics.track(() => verdict(c, deps)));

  app.onError((err, c) => {
    console.error(JSON.stringify({ level: "error", msg: err.message }));
    return c.json({ error: "internal_error" }, 500);
  });

  return app;
}

/** One verdict request: validate, refuse a second verdict for the same milestone, run the pipeline, store the envelope. */
async function verdict(c: Context, deps: AppDeps): Promise<Response> {
  const body = await c.req.json().catch(() => undefined);
  const parsed = VerdictRequestSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: "invalid_request", issues: parsed.error.issues }, 400);
  const request = parsed.data;

  const existing = await deps.store.find(request.terms.pactId, request.milestone);
  if (existing) return c.json({ error: "verdict_exists", envelopeSha256: existing }, 409);

  let result: PipelineResult | "no-verdict";
  try {
    result = await deps.pipeline({
      terms: request.terms,
      evidence: request.evidence,
      milestone: request.milestone as PipelineInput["milestone"],
      ...(request.deliveryReceipt ? { deliveryReceipt: request.deliveryReceipt } : {}),
      ...(request.minAmount ? { minAmount: request.minAmount } : {}),
    });
  } catch (e) {
    if (e instanceof NotImplementedError) return c.json({ error: "not_implemented", roadmapTask: e.task }, 501);
    throw e;
  }
  if (result === "no-verdict") return c.json({ verdict: null, reason: "model_refusal" }, 202);

  if (result.receiptOnly || !result.envelope) {
    return c.json(
      { receiptOnly: true, amount: result.amount.toString(), envelope: null, envelopeRef: null, attestation: result.attestation ?? null },
      200,
    );
  }

  if (!result.envelopeRef) throw new Error("pipeline returned no envelope reference");
  const ref = parseAnchorReference(result.envelopeRef);
  if (!ref) throw new Error("pipeline returned a malformed envelope reference");
  try {
    await deps.store.put(result.envelope, ref.sha256);
  } catch (e) {
    if (e instanceof DuplicateVerdictError) return c.json({ error: "verdict_exists", envelopeSha256: e.existing }, 409);
    throw e;
  }
  return c.json(
    { envelope: result.envelope, envelopeRef: result.envelopeRef, amount: result.amount.toString(), attestation: result.attestation ?? null },
    201,
  );
}

/**
 * Starts the verifier with the real pipeline: the configured model, evidence fetched from the
 * evidence bucket, and envelopes in Postgres (memory only when no database is configured).
 * Throws if the bucket can't be read over http(s) or the database can't be reached.
 */
export async function startServer(config: VerifierConfig): Promise<ReturnType<typeof serve>> {
  const modelAdapter = new ProviderNeutralLLMAdapter({
    provider: config.provider,
    modelId: config.model,
    apiKey: config.llmApiKey,
    ...(config.effort ? { effort: config.effort } : {}),
    ...(config.llmBaseUrl ? { baseUrl: config.llmBaseUrl } : {}),
  });
  const evidenceLoader = createEvidenceLoader(config.evidenceBucketUrl);
  const store = config.databaseUrl ? await PostgresVerdictStore.connect(config.databaseUrl) : new MemoryVerdictStore();
  const app = createApp({
    verifierKey: config.verifierKey,
    store,
    storeKind: config.databaseUrl ? "postgres" : "memory",
    pipeline: async (input) =>
      runPipeline(input, {
        verifierKey: config.verifierKey,
        modelAdapter,
        evidenceLoader,
        ledgerSeq: await currentLedger(config.rpcUrl),
        envelopeBaseUrl: config.publicUrl,
      }),
  });
  return serve({ fetch: app.fetch, port: config.port });
}

/** The network's latest ledger, stamped into attestations as `issued_ledger`. */
export async function currentLedger(rpcUrl: string, fetchImpl: typeof fetch = globalThis.fetch): Promise<number> {
  const res = await fetchImpl(rpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getLatestLedger" }),
    signal: AbortSignal.timeout(10_000),
  });
  const body = (await res.json().catch(() => ({}))) as { result?: { sequence?: number } };
  const sequence = body.result?.sequence;
  if (!res.ok || typeof sequence !== "number") throw new Error(`could not read the latest ledger from ${rpcUrl}`);
  return sequence;
}
