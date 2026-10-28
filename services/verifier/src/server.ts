/**
 * HTTP API (ROADMAP V-01): `GET /health`, `GET /v1/envelopes/:sha256`, `POST /v1/verdicts`.
 * Dependencies are injected so the app is testable without a network.
 */
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { z } from "zod";
import { NotImplementedError, PactTermsSchema } from "@pactwright/core";
import { EvidenceItemSchema, parseAnchorReference, type Keypair } from "@witness/core";
import type { VerifierConfig } from "./config.ts";
import { runPipeline, type PipelineInput, type PipelineResult } from "./pipeline.ts";
import { DuplicateVerdictError, MemoryVerdictStore, type VerdictStore } from "./store.ts";

export const VerdictRequestSchema = z.object({
  terms: PactTermsSchema,
  evidence: z.array(EvidenceItemSchema).min(1),
  deliveryReceipt: z.string().min(1).optional(),
  milestone: z.union([z.literal("delivery"), z.string().regex(/^dispute-\d+$/)]).default("delivery"),
});

export interface AppDeps {
  verifierKey: Keypair;
  store: VerdictStore;
  pipeline: (input: PipelineInput) => Promise<PipelineResult | "no-verdict">;
}

const SHA256 = /^[0-9a-f]{64}$/;

export function createApp(deps: AppDeps): Hono {
  const app = new Hono();

  app.get("/health", (c) =>
    c.json({
      ok: true,
      verifier: deps.verifierKey.publicKey(),
      verifierHex: deps.verifierKey.rawPublicKey().toString("hex"),
    }),
  );

  app.get("/v1/envelopes/:sha256", async (c) => {
    const sha = c.req.param("sha256");
    if (!SHA256.test(sha)) return c.json({ error: "invalid_sha256" }, 400);
    const envelope = await deps.store.get(sha);
    return envelope ? c.json(envelope) : c.json({ error: "not_found" }, 404);
  });

  app.post("/v1/verdicts", async (c) => {
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
      });
    } catch (e) {
      if (e instanceof NotImplementedError) return c.json({ error: "not_implemented", roadmapTask: e.task }, 501);
      throw e;
    }
    if (result === "no-verdict") return c.json({ verdict: null, reason: "model_refusal" }, 202);

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
  });

  app.onError((err, c) => {
    console.error(JSON.stringify({ level: "error", msg: err.message }));
    return c.json({ error: "internal_error" }, 500);
  });

  return app;
}

/** Starts the verifier with the in-memory store and the real pipeline. */
export function startServer(config: VerifierConfig): ReturnType<typeof serve> {
  const app = createApp({ verifierKey: config.verifierKey, store: new MemoryVerdictStore(), pipeline: runPipeline });
  return serve({ fetch: app.fetch, port: config.port });
}
