/**
 * `document.translation` rules (ROADMAP V-04).
 *
 * Condition: `{ kind: "document.translation", lang: "<ISO 639-1>", minPages: <int ≥ 1>,
 * maxUntranslatedSegments?: <int ≥ 0, default 0> }`.
 *
 * The model only reads the delivered document into `modelOutput`; these rules decide.
 * Mandatory criteria: valid condition, target language, actually a translation, completeness,
 * at least one page. Fewer pages than `minPages` is a non-mandatory FAIL: the seller is paid
 * pro rata (`cap × pages / minPages`, floored, at least 1 stroop) instead of being denied.
 * Witness's `decide()` makes the decision; REVIEW becomes DENY (no human review in the MVP).
 */
import { z } from "zod";
import { decide as witnessDecide, type CriterionResult, type ReasonCode } from "@witness/core";
import type { RuleDecision, RuleSet } from "./types.ts";

export const POLICY_VERSION = "pactwright/document.translation@1";
const VERIFIER = "rules:document.translation@1";

const modelOutput = z.object({
  detectedLanguage: z.string(),
  pageCount: z.number().int().nonnegative(),
  isTranslationOfSource: z.boolean(),
  untranslatedSegments: z.number().int().nonnegative(),
  notes: z.string(),
});
export type DocumentTranslationReading = z.infer<typeof modelOutput>;

const ConditionSchema = z.object({
  kind: z.literal("document.translation"),
  lang: z.string().regex(/^[a-z]{2}$/i),
  minPages: z.number().int().min(1),
  maxUntranslatedSegments: z.number().int().nonnegative().default(0),
});

/** "pt-BR" → "pt", "EN" → "en". */
function baseLanguage(tag: string): string {
  return tag.trim().toLowerCase().split(/[-_]/)[0] ?? "";
}

function criterion(id: string, pass: boolean, code: ReasonCode, reason: string, mandatory = true): CriterionResult {
  return { id, verifier: VERIFIER, result: pass ? "PASS" : "FAIL", code: pass ? "OK" : code, reason, mandatory };
}

export function decideDocumentTranslation(
  output: DocumentTranslationReading,
  rawCondition: Record<string, unknown>,
  capStroops: bigint,
): RuleDecision {
  const parsed = ConditionSchema.safeParse(rawCondition);
  if (!parsed.success || capStroops <= 0n) {
    const criteria = [criterion("condition", false, "CONDITION_MISMATCH", "condition is not a valid document.translation condition")];
    return { verdict: "DENY", amount: 0n, criteria, reasons: ["CONDITION_MISMATCH"], policyVersion: POLICY_VERSION };
  }
  const condition = parsed.data;
  const lang = baseLanguage(output.detectedLanguage);
  const target = condition.lang.toLowerCase();

  const criteria: CriterionResult[] = [
    criterion("language", lang === target, "CONDITION_MISMATCH", `detected "${lang}", required "${target}"`),
    criterion("is_translation", output.isTranslationOfSource, "TASK_NOT_DONE", "delivered document is a translation of the source"),
    criterion(
      "completeness",
      output.untranslatedSegments <= condition.maxUntranslatedSegments,
      "TASK_NOT_DONE",
      `${output.untranslatedSegments} untranslated segments, at most ${condition.maxUntranslatedSegments} allowed`,
    ),
    criterion("has_pages", output.pageCount > 0, "TASK_NOT_VISIBLE", `${output.pageCount} pages delivered`),
    criterion(
      "page_count",
      output.pageCount >= condition.minPages,
      "ITEMS_MISMATCH",
      `${output.pageCount} of ${condition.minPages} required pages`,
      false,
    ),
  ];

  const witness = witnessDecide(criteria, undefined, { semanticThreshold: 0, semanticReviewFloor: 0, policyVersion: POLICY_VERSION });
  if (witness.decision !== "ALLOW") {
    return { verdict: "DENY", amount: 0n, criteria, reasons: witness.reasons, policyVersion: POLICY_VERSION };
  }

  const pages = BigInt(Math.min(output.pageCount, condition.minPages));
  const prorated = (capStroops * pages) / BigInt(condition.minPages);
  const amount = prorated > 0n ? prorated : 1n;
  const reasons: ReasonCode[] = amount < capStroops ? ["ITEMS_MISMATCH"] : witness.reasons;
  return { verdict: "ALLOW", amount, criteria, reasons, policyVersion: POLICY_VERSION };
}

const instructions = [
  "The first evidence item is the source document and the last is the document delivered as its translation.",
  "If there is only one item, it is the delivered document.",
  "Pages are introduced by lines like `=== Page N ===`; a document without markers is one page.",
  "Report about the delivered document only:",
  "- detectedLanguage: ISO 639-1 code of its main language (empty string if it has no text);",
  "- pageCount: pages that contain text;",
  "- isTranslationOfSource: true only if it renders the source's content in another language;",
  "- untranslatedSegments: sentences left in the source's language;",
  "- notes: one short sentence.",
].join("\n");

export const documentTranslation: RuleSet<typeof modelOutput> = {
  kind: "document.translation",
  modelOutput,
  instructions,
  decide: decideDocumentTranslation,
};
