/**
 * Real-model verifier eval (ROADMAP V-12). Runs every labelled case in `cases.ts` through the full
 * pipeline (delivery receipt, evidence hash, the configured model, rules, signing) and reports
 * accuracy per condition kind, with the provider, model ID and a hash of every raw output.
 *
 * Costs money: run it from the manual or scheduled `verifier-eval` workflow, never per PR.
 *
 *   VERIFIER_PROVIDER=… VERIFIER_MODEL=… VERIFIER_LLM_API_KEY=… [LLM_BASE_URL=…] [VERIFIER_EFFORT=…] \
 *     node services/verifier/eval/real/run.ts [--out report.json]
 */
import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Keypair, type EvidenceItem } from "@witness/core";
import { deliveryMessage, type PactTerms } from "@pactwright/core";
import { runPipeline } from "../../src/pipeline.ts";
import { ProviderNeutralLLMAdapter } from "../../src/models/llm.ts";
import type { ModelAdapter } from "../../src/models/types.ts";
import { REAL_CASES, type RealCase } from "./cases.ts";

export const ACCURACY_GATE = 0.9;

export interface CaseResult {
  id: string;
  kind: string;
  expected: RealCase["expected"];
  got: { verdict: "ALLOW" | "DENY" | "NO_VERDICT" | "ERROR"; amountStroops?: string };
  pass: boolean;
  /** sha256 of each raw model output for this case (recorded in the envelope too). */
  rawSha256: string[];
  reading?: unknown;
  truth: RealCase["truth"];
  error?: string;
}

export interface RealEvalReport {
  date: string;
  provider: string;
  model: string;
  effort?: string;
  perKind: { kind: string; total: number; passed: number; accuracy: number }[];
  overall: { total: number; passed: number; accuracy: number };
  cases: CaseResult[];
}

const sha256 = (data: Uint8Array) => createHash("sha256").update(data).digest("hex");

const BUYER = "GA7QYNF7SOWQ3GLR2BGMZEHXAVIRZA4KVWLTJJFC7MGXUA74P7UJVTOO";
const SELLER = "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5";

/** Records each reading so the report can show what the model said, not only the verdict. */
function recording(inner: ModelAdapter): ModelAdapter & { take(): { raw: string[]; output?: unknown } } {
  let raw: string[] = [];
  let output: unknown;
  return {
    name: inner.name,
    async read(schema, instructions, evidence) {
      const reading = await inner.read(schema, instructions, evidence);
      if (reading !== "refusal") {
        raw.push(reading.rawSha256);
        output = reading.output;
      }
      return reading;
    },
    take() {
      const taken = { raw, output };
      raw = [];
      output = undefined;
      return taken;
    },
  };
}

async function runCase(c: RealCase, model: ReturnType<typeof recording>): Promise<CaseResult> {
  // Throwaway keys: eval envelopes are never submitted on-chain.
  const seller = Keypair.random();
  const verifierKey = Keypair.random();
  const pactId = sha256(Buffer.from(`pactwright-eval:${c.id}`));
  const blobs = new Map<string, Uint8Array>();
  const now = new Date().toISOString();
  const item = (name: string, text: string): EvidenceItem => {
    const data = Buffer.from(text, "utf8");
    const uri = `eval://${c.id}/${name}`;
    blobs.set(uri, data);
    return { type: "document", uri, sha256: sha256(data), mimeType: "text/plain; charset=utf-8", uploader: BUYER, createdAt: now };
  };
  const evidence = [...(c.source !== null ? [item("source.txt", c.source)] : []), item("delivered.txt", c.delivered)];
  const delivered = evidence[evidence.length - 1]!;
  const signature = seller.sign(Buffer.from(deliveryMessage(pactId, delivered.sha256)));
  const terms: PactTerms = {
    pactId,
    mode: "exact-refund",
    buyer: BUYER,
    seller: SELLER,
    resourceUrl: `https://seller.eval/${c.id}`,
    cap: c.cap,
    nonce: "1",
    conditionHash: sha256(Buffer.from(JSON.stringify(c.condition))),
    condition: c.condition,
    verifier: verifierKey.rawPublicKey().toString("hex"),
    deliveryKey: seller.rawPublicKey().toString("hex"),
    metered: false,
    refundWindowLedgers: 0,
  };

  const base = { id: c.id, kind: c.kind, expected: c.expected, truth: c.truth };
  try {
    const result = await runPipeline(
      {
        terms,
        evidence,
        milestone: "delivery",
        deliveryReceipt: `sha256=${delivered.sha256}; sig=${Buffer.from(signature).toString("base64")}`,
      },
      {
        verifierKey,
        modelAdapter: model,
        evidenceLoader: async (e) => {
          const data = blobs.get(e.uri);
          if (!data) throw new Error(`no eval blob for ${e.uri}`);
          return data;
        },
      },
    );
    const { raw, output } = model.take();
    if (result === "no-verdict") return { ...base, got: { verdict: "NO_VERDICT" }, pass: false, rawSha256: raw, reading: output };
    const verdict: "ALLOW" | "DENY" = result.amount > 0n ? "ALLOW" : "DENY";
    const got: CaseResult["got"] = verdict === "ALLOW" ? { verdict, amountStroops: result.amount.toString() } : { verdict };
    const pass = verdict === c.expected.verdict && (c.expected.amountStroops === undefined || got.amountStroops === c.expected.amountStroops);
    return { ...base, got, pass, rawSha256: raw, reading: output };
  } catch (e) {
    const { raw, output } = model.take();
    return { ...base, got: { verdict: "ERROR" }, pass: false, rawSha256: raw, reading: output, error: (e as Error).message };
  }
}

export async function runRealModelEval(
  adapter: ModelAdapter,
  meta: { provider: string; model: string; effort?: string },
  cases: readonly RealCase[] = REAL_CASES,
): Promise<RealEvalReport> {
  const model = recording(adapter);
  const results: CaseResult[] = [];
  // Sequential: provider rate limits matter more than wall time for a manual run.
  for (const [i, c] of cases.entries()) {
    const r = await runCase(c, model);
    results.push(r);
    // Progress as it runs, so a slow or failing provider shows up immediately.
    console.error(`[${i + 1}/${cases.length}] ${r.pass ? "PASS" : "FAIL"} ${c.id}${r.error ? ` (${r.error})` : ""}`);
    // Pace requests to stay inside the provider's per-minute limit (EVAL_CASE_DELAY_MS).
    const delay = Number(process.env.EVAL_CASE_DELAY_MS ?? 0);
    if (delay > 0 && i < cases.length - 1) await new Promise((res) => setTimeout(res, delay));
  }

  const kinds = [...new Set(results.map((r) => r.kind))];
  const perKind = kinds.map((kind) => {
    const rows = results.filter((r) => r.kind === kind);
    const passed = rows.filter((r) => r.pass).length;
    return { kind, total: rows.length, passed, accuracy: passed / rows.length };
  });
  const passed = results.filter((r) => r.pass).length;
  return {
    date: new Date().toISOString(),
    provider: meta.provider,
    model: meta.model,
    ...(meta.effort ? { effort: meta.effort } : {}),
    perKind,
    overall: { total: results.length, passed, accuracy: results.length ? passed / results.length : 0 },
    cases: results,
  };
}

export function formatReport(report: RealEvalReport): string {
  const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
  const lines = [
    `provider=${report.provider} model=${report.model}${report.effort ? ` effort=${report.effort}` : ""} date=${report.date}`,
    ...report.cases.map(
      (r) =>
        `${r.pass ? "PASS" : "FAIL"} ${r.id}: expected ${r.expected.verdict}${r.expected.amountStroops ? ` ${r.expected.amountStroops}` : ""}, ` +
        `got ${r.got.verdict}${r.got.amountStroops ? ` ${r.got.amountStroops}` : ""}` +
        `${r.error ? ` (${r.error})` : ""} raw=${r.rawSha256.join(",") || "-"}` +
        (r.pass ? "" : `\n     reading=${JSON.stringify(r.reading ?? null)}\n     truth=${JSON.stringify(r.truth)}`),
    ),
    ...report.perKind.map((k) => `kind ${k.kind}: ${k.passed}/${k.total} (${pct(k.accuracy)})`),
    `OVERALL: ${report.overall.passed}/${report.overall.total} (${pct(report.overall.accuracy)}) [gate >= ${pct(ACCURACY_GATE)}]`,
  ];
  return lines.join("\n");
}

const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  const provider = process.env.VERIFIER_PROVIDER?.trim();
  const modelId = process.env.VERIFIER_MODEL?.trim();
  const apiKey = process.env.VERIFIER_LLM_API_KEY?.trim();
  const missing = [
    ["VERIFIER_PROVIDER", provider],
    ["VERIFIER_MODEL", modelId],
    ["VERIFIER_LLM_API_KEY", apiKey],
  ].filter(([, v]) => !v).map(([k]) => k);
  if (missing.length) {
    console.error(`real-model eval needs ${missing.join(", ")}`);
    process.exit(1);
  }
  const effort = process.env.VERIFIER_EFFORT?.trim() || undefined;
  const baseUrl = process.env.LLM_BASE_URL?.trim() || undefined;
  const adapter = new ProviderNeutralLLMAdapter({
    provider: provider!,
    modelId: modelId!,
    apiKey: apiKey!,
    ...(effort ? { effort } : {}),
    ...(baseUrl ? { baseUrl } : {}),
  });
  const report = await runRealModelEval(adapter, { provider: provider!, model: modelId!, ...(effort ? { effort } : {}) });
  console.log(formatReport(report));
  const outIndex = process.argv.indexOf("--out");
  const out = outIndex > 0 ? process.argv[outIndex + 1] : undefined;
  if (out) writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`);
  process.exit(report.overall.accuracy >= ACCURACY_GATE ? 0 : 1);
}
