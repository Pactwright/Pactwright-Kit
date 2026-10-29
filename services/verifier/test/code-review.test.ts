import { describe, it, expect } from "vitest";
import { decideCodeReview } from "../src/rules/code-review.ts";

describe("codeReview (P9-09)", () => {
  const cap = 1_000_000n; // 0.1 USDC

  it("ALLOWs full payment when all criteria are met", () => {
    const res = decideCodeReview(
      {
        syntaxValid: true,
        testsPassing: true,
        coveragePct: 90,
        criticalIssues: 0,
        notes: "Clean code",
      },
      { kind: "code.review", minCoveragePct: 80, maxCriticalIssues: 0 },
      cap,
    );

    expect(res.verdict).toBe("ALLOW");
    expect(res.amount).toBe(cap);
    expect(res.reasons).toContain("OK");
  });

  it("prorates payment when coverage is lower than required", () => {
    const res = decideCodeReview(
      {
        syntaxValid: true,
        testsPassing: true,
        coveragePct: 40,
        criticalIssues: 0,
        notes: "Partial test suite",
      },
      { kind: "code.review", minCoveragePct: 80, maxCriticalIssues: 0 },
      cap,
    );

    expect(res.verdict).toBe("ALLOW");
    expect(res.amount).toBe(500_000n); // 40/80 = 50% of cap
    expect(res.reasons).toContain("ITEMS_MISMATCH");
  });

  it("DENYs when tests fail or critical issues exist", () => {
    const res = decideCodeReview(
      {
        syntaxValid: true,
        testsPassing: false,
        coveragePct: 90,
        criticalIssues: 1,
        notes: "Security issue found",
      },
      { kind: "code.review", minCoveragePct: 80, maxCriticalIssues: 0 },
      cap,
    );

    expect(res.verdict).toBe("DENY");
    expect(res.amount).toBe(0n);
    expect(res.reasons).toContain("TASK_NOT_DONE");
  });
});
