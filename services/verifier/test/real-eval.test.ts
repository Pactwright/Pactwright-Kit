import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import type { ModelAdapter } from "../src/models/types.ts";
import { REAL_CASES } from "../eval/real/cases.ts";
import { ACCURACY_GATE, formatReport, runRealModelEval } from "../eval/real/run.ts";

const decode = (d: Uint8Array) => new TextDecoder().decode(d);

/** Answers with each case's hand-written reading, looked up by the delivered document it is shown. */
function oracle(): ModelAdapter {
  const byDelivery = new Map(REAL_CASES.map((c) => [c.delivered, c.truth]));
  return {
    name: "oracle",
    async read(schema, _instructions, evidence) {
      const truth = byDelivery.get(decode(evidence[evidence.length - 1]!.data));
      const raw = JSON.stringify(truth);
      return { output: schema.parse(truth), modelId: "oracle", rawSha256: createHash("sha256").update(raw).digest("hex") };
    },
  };
}

describe("real-model eval (V-12)", () => {
  it("has honest, self-consistent labels: a correct reading of every document meets every label", async () => {
    const report = await runRealModelEval(oracle(), { provider: "test", model: "oracle" });
    expect(report.cases.filter((r) => !r.pass)).toEqual([]);
    expect(report.perKind).toEqual([{ kind: "document.translation", total: REAL_CASES.length, passed: REAL_CASES.length, accuracy: 1 }]);
    expect(report.cases.every((r) => r.rawSha256.length === 1 && /^[0-9a-f]{64}$/.test(r.rawSha256[0]!))).toBe(true);
  });

  it("covers both verdicts and every failure mode", () => {
    expect(REAL_CASES.length).toBeGreaterThanOrEqual(25);
    const ids = REAL_CASES.map((c) => c.id).join(" ");
    for (const mode of ["allow_full", "prorata", "deny_lang", "unrelated", "untranslated", "empty", "markers_only"]) {
      expect(ids).toContain(mode);
    }
    expect(new Set(REAL_CASES.map((c) => c.id)).size).toBe(REAL_CASES.length);
  });

  it("fails the gate for a model that always reads a complete Spanish translation", async () => {
    const naive: ModelAdapter = {
      name: "naive",
      async read(schema) {
        const output = schema.parse({ detectedLanguage: "es", pageCount: 4, isTranslationOfSource: true, untranslatedSegments: 0, notes: "" });
        return { output, modelId: "naive", rawSha256: "0".repeat(64) };
      },
    };
    const report = await runRealModelEval(naive, { provider: "test", model: "naive" });
    expect(report.overall.accuracy).toBeLessThan(ACCURACY_GATE);
    expect(formatReport(report)).toMatch(/FAIL deny_lang_fr_for_es[\s\S]*truth=/);
  });

  it("counts provider errors and refusals as failures, never as passes", async () => {
    const broken: ModelAdapter = { name: "broken", read: async () => { throw new Error("LLM provider HTTP 500"); } };
    const refusing: ModelAdapter = { name: "refusing", read: async () => "refusal" };
    const one = REAL_CASES.slice(0, 1);
    const errored = await runRealModelEval(broken, { provider: "test", model: "broken" }, one);
    expect(errored.cases[0]).toMatchObject({ pass: false, got: { verdict: "ERROR" }, error: "LLM provider HTTP 500" });
    const refused = await runRealModelEval(refusing, { provider: "test", model: "refusing" }, one);
    expect(refused.cases[0]).toMatchObject({ pass: false, got: { verdict: "NO_VERDICT" } });
  });
});
