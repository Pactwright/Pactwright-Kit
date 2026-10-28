import { describe, expect, it } from "vitest";
import { CriterionResultSchema } from "@witness/core";
import {
  POLICY_VERSION,
  decideDocumentTranslation,
  type DocumentTranslationReading,
} from "../src/rules/document-translation.ts";

const CAP = 10_000_000n;
const condition = { kind: "document.translation", lang: "pt", minPages: 4 };
const good: DocumentTranslationReading = {
  detectedLanguage: "pt-BR",
  pageCount: 4,
  isTranslationOfSource: true,
  untranslatedSegments: 0,
  notes: "",
};

type Row = [name: string, reading: Partial<DocumentTranslationReading>, cond: Record<string, unknown>, verdict: "ALLOW" | "DENY", amount: bigint, reasons: string[]];

const table: Row[] = [
  ["complete delivery", {}, condition, "ALLOW", CAP, ["OK"]],
  ["extra pages still capped", { pageCount: 9 }, condition, "ALLOW", CAP, ["OK"]],
  ["language tag case and region", { detectedLanguage: "PT_pt" }, condition, "ALLOW", CAP, ["OK"]],
  ["partial: 1 of 4 pages", { pageCount: 1 }, condition, "ALLOW", CAP / 4n, ["ITEMS_MISMATCH"]],
  ["partial: 3 of 4 pages", { pageCount: 3 }, condition, "ALLOW", (CAP * 3n) / 4n, ["ITEMS_MISMATCH"]],
  ["wrong language", { detectedLanguage: "es" }, condition, "DENY", 0n, ["CONDITION_MISMATCH"]],
  ["not a translation", { isTranslationOfSource: false }, condition, "DENY", 0n, ["TASK_NOT_DONE"]],
  ["untranslated segments", { untranslatedSegments: 2 }, condition, "DENY", 0n, ["TASK_NOT_DONE"]],
  ["tolerated segments", { untranslatedSegments: 2 }, { ...condition, maxUntranslatedSegments: 2 }, "ALLOW", CAP, ["OK"]],
  ["no pages", { pageCount: 0 }, condition, "DENY", 0n, ["TASK_NOT_VISIBLE"]],
  ["several failures report every code", { detectedLanguage: "es", isTranslationOfSource: false }, condition, "DENY", 0n, ["CONDITION_MISMATCH", "TASK_NOT_DONE"]],
  ["invalid condition: wrong kind", {}, { ...condition, kind: "photo" }, "DENY", 0n, ["CONDITION_MISMATCH"]],
  ["invalid condition: minPages 0", {}, { ...condition, minPages: 0 }, "DENY", 0n, ["CONDITION_MISMATCH"]],
  ["invalid condition: missing lang", {}, { kind: "document.translation", minPages: 1 }, "DENY", 0n, ["CONDITION_MISMATCH"]],
];

describe("document.translation rules", () => {
  it.each(table)("%s", (_name, reading, cond, verdict, amount, reasons) => {
    const result = decideDocumentTranslation({ ...good, ...reading }, cond, CAP);
    expect(result.verdict).toBe(verdict);
    expect(result.amount).toBe(amount);
    expect(result.reasons).toEqual(reasons);
    expect(result.policyVersion).toBe(POLICY_VERSION);
  });

  it("is pure: same inputs give the same decision", () => {
    const a = decideDocumentTranslation(good, condition, CAP);
    const b = decideDocumentTranslation({ ...good }, { ...condition }, CAP);
    expect(a).toEqual(b);
  });

  it("emits criteria that validate against the Witness schema", () => {
    for (const [, reading, cond] of table) {
      for (const c of decideDocumentTranslation({ ...good, ...reading }, cond, CAP).criteria) {
        expect(CriterionResultSchema.safeParse(c).success).toBe(true);
      }
    }
  });

  it("respects the contract amount rules (ALLOW: 0 < amount <= cap, DENY: 0)", () => {
    for (const pages of [0, 1, 2, 3, 4, 5, 100]) {
      const r = decideDocumentTranslation({ ...good, pageCount: pages }, { ...condition, minPages: 3 }, 7n);
      if (r.verdict === "ALLOW") expect(r.amount > 0n && r.amount <= 7n).toBe(true);
      else expect(r.amount).toBe(0n);
    }
  });

  it("never pays less than one stroop on a partial ALLOW", () => {
    const r = decideDocumentTranslation({ ...good, pageCount: 1 }, { ...condition, minPages: 1000 }, 10n);
    expect(r).toMatchObject({ verdict: "ALLOW", amount: 1n });
  });

  it("denies a non-positive cap", () => {
    expect(decideDocumentTranslation(good, condition, 0n).verdict).toBe("DENY");
  });
});
