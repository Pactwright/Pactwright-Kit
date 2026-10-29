/**
 * Verifier eval set runner (ROADMAP V-08 & V-11).
 * Loads labelled cases per condition kind, measures accuracy and latency,
 * and enforces the >= 90% accuracy gate for CI.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { toStroops } from "@pactwright/core";
import type { ReasonCode } from "@witness/core";
import { getRuleSet } from "../src/rules/index.ts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const casesRoot = join(__dirname, "cases");

interface EvalCase {
  id: string;
  description: string;
  condition: Record<string, unknown> & { kind: string };
  cap: string;
  reading: Record<string, unknown>;
  expected: {
    verdict: "ALLOW" | "DENY";
    amountStroops?: string;
    reason?: string;
  };
}

interface KindStats {
  kind: string;
  total: number;
  passed: number;
  failed: number;
  latenciesMs: number[];
}

function computePercentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const index = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(index, sorted.length - 1))]!;
}

export async function runEval(): Promise<boolean> {
  const kinds = readdirSync(casesRoot, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);

  if (kinds.length === 0) {
    console.error("No condition kind directories found in eval/cases/");
    return false;
  }

  const allStats: KindStats[] = [];
  let overallTotal = 0;
  let overallPassed = 0;
  const overallLatencies: number[] = [];

  for (const kind of kinds) {
    const kindDir = join(casesRoot, kind);
    const caseFiles = readdirSync(kindDir).filter((f) => f.endsWith(".json"));

    const stats: KindStats = {
      kind,
      total: caseFiles.length,
      passed: 0,
      failed: 0,
      latenciesMs: [],
    };

    const ruleKind = kind.replace("-", ".");
    const ruleSet = getRuleSet(ruleKind) ?? getRuleSet(kind);
    if (!ruleSet) {
      console.error(`Rule set for kind '${kind}' (or '${ruleKind}') is not registered`);
      return false;
    }

    for (const file of caseFiles) {
      const fullPath = join(kindDir, file);
      const content = readFileSync(fullPath, "utf-8");
      const c: EvalCase = JSON.parse(content);

      let capStroops: bigint;
      try {
        capStroops = toStroops(c.cap);
      } catch {
        capStroops = 0n;
      }

      const start = process.hrtime.bigint();
      const decision = ruleSet.decide(c.reading, c.condition, capStroops);
      const end = process.hrtime.bigint();
      const latencyMs = Number(end - start) / 1_000_000;

      stats.latenciesMs.push(latencyMs);
      overallLatencies.push(latencyMs);

      let matches = decision.verdict === c.expected.verdict;
      if (matches && c.expected.amountStroops) {
        matches = decision.amount === BigInt(c.expected.amountStroops);
      }
      if (matches && c.expected.reason) {
        matches = decision.reasons.includes(c.expected.reason as ReasonCode);
      }

      if (matches) {
        stats.passed++;
        overallPassed++;
      } else {
        stats.failed++;
        console.warn(`[FAIL] ${c.id}: expected ${JSON.stringify(c.expected)}, got verdict=${decision.verdict} amount=${decision.amount} reasons=${decision.reasons}`);
      }
      overallTotal++;
    }

    allStats.push(stats);
  }

  console.log("\n=================== VERIFIER EVALUATION SUMMARY ===================");
  for (const stats of allStats) {
    const accuracy = stats.total > 0 ? ((stats.passed / stats.total) * 100).toFixed(1) : "0.0";
    const sorted = [...stats.latenciesMs].sort((a, b) => a - b);
    const mean = (stats.latenciesMs.reduce((a, b) => a + b, 0) / (stats.total || 1)).toFixed(3);
    const p50 = computePercentile(sorted, 50).toFixed(3);
    const p95 = computePercentile(sorted, 95).toFixed(3);

    console.log(`Kind: ${stats.kind.padEnd(24)} | Cases: ${stats.total.toString().padStart(3)} | Passed: ${stats.passed.toString().padStart(3)} | Accuracy: ${accuracy}%`);
    console.log(`  Latency (ms): mean=${mean}ms | p50=${p50}ms | p95=${p95}ms`);
  }

  const overallAccuracy = overallTotal > 0 ? ((overallPassed / overallTotal) * 100).toFixed(1) : "0.0";
  console.log("-------------------------------------------------------------------");
  console.log(`OVERALL: ${overallPassed}/${overallTotal} passed (${overallAccuracy}%) [Gate: >= 90%]`);
  console.log("===================================================================\n");

  const passedGate = Number(overallAccuracy) >= 90;
  if (!passedGate) {
    console.error(`❌ Eval accuracy ${overallAccuracy}% failed the >= 90% gate!`);
    return false;
  }

  console.log(`✅ Eval accuracy ${overallAccuracy}% passed the >= 90% gate!`);
  return true;
}

// Direct execution
const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  runEval().then((ok) => {
    process.exit(ok ? 0 : 1);
  });
}
