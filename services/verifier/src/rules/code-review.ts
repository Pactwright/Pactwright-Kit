/**
 * `code.review` rules (ROADMAP P9-09).
 *
 * Second condition kind in the verifier.
 * Condition: `{ kind: "code.review", minCoveragePct: number, maxCriticalIssues?: number }`.
 */
import { z } from "zod";
import { decide as witnessDecide, type CriterionResult, type ReasonCode } from "@witness/core";
import type { RuleDecision, RuleSet } from "./types.ts";

export const CODE_REVIEW_POLICY_VERSION = "pactwright/code.review@1";
const VERIFIER = "rules:code.review@1";

const modelOutput = z.object({
  syntaxValid: z.boolean(),
  testsPassing: z.boolean(),
  coveragePct: z.number().int().min(0).max(100),
  criticalIssues: z.number().int().nonnegative(),
  notes: z.string(),
});
export type CodeReviewReading = z.infer<typeof modelOutput>;

const ConditionSchema = z.object({
  kind: z.literal("code.review"),
  minCoveragePct: z.number().int().min(1).max(100).default(80),
  maxCriticalIssues: z.number().int().nonnegative().default(0),
});

function criterion(id: string, pass: boolean, code: ReasonCode, reason: string, mandatory = true): CriterionResult {
  return { id, verifier: VERIFIER, result: pass ? "PASS" : "FAIL", code: pass ? "OK" : code, reason, mandatory };
}

export function decideCodeReview(
  output: CodeReviewReading,
  rawCondition: Record<string, unknown>,
  capStroops: bigint,
): RuleDecision {
  const parsed = ConditionSchema.safeParse(rawCondition);
  if (!parsed.success || capStroops <= 0n) {
    const criteria = [criterion("condition", false, "CONDITION_MISMATCH", "condition is not a valid code.review condition")];
    return { verdict: "DENY", amount: 0n, criteria, reasons: ["CONDITION_MISMATCH"], policyVersion: CODE_REVIEW_POLICY_VERSION };
  }

  const condition = parsed.data;

  const criteria: CriterionResult[] = [
    criterion("syntax_valid", output.syntaxValid, "TASK_NOT_DONE", "code syntax is valid without compiler errors"),
    criterion("tests_passing", output.testsPassing, "TASK_NOT_DONE", "all automated tests are passing"),
    criterion(
      "critical_issues",
      output.criticalIssues <= condition.maxCriticalIssues,
      "TASK_NOT_DONE",
      `${output.criticalIssues} critical issues detected, max allowed is ${condition.maxCriticalIssues}`,
    ),
    criterion(
      "test_coverage",
      output.coveragePct >= condition.minCoveragePct,
      "ITEMS_MISMATCH",
      `achieved ${output.coveragePct}% coverage of ${condition.minCoveragePct}% required`,
      false, // non-mandatory -> pro-rata payment
    ),
  ];

  const witness = witnessDecide(criteria, undefined, { semanticThreshold: 0, semanticReviewFloor: 0, policyVersion: CODE_REVIEW_POLICY_VERSION });
  if (witness.decision !== "ALLOW") {
    return { verdict: "DENY", amount: 0n, criteria, reasons: witness.reasons, policyVersion: CODE_REVIEW_POLICY_VERSION };
  }

  // Calculate pro-rata payment if test coverage is below required
  const coverageRatio = BigInt(Math.min(output.coveragePct, condition.minCoveragePct));
  const prorated = (capStroops * coverageRatio) / BigInt(condition.minCoveragePct);
  const amount = prorated > 0n ? prorated : 1n;
  const reasons: ReasonCode[] = amount < capStroops ? ["ITEMS_MISMATCH"] : witness.reasons;

  return { verdict: "ALLOW", amount, criteria, reasons, policyVersion: CODE_REVIEW_POLICY_VERSION };
}

export const codeReview: RuleSet<typeof modelOutput> = {
  kind: "code.review",
  modelOutput,
  decide: decideCodeReview,
};
