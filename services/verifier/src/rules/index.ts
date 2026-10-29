import { documentTranslation } from "./document-translation.ts";
import { codeReview } from "./code-review.ts";
import type { RuleSet } from "./types.ts";

export const ruleSets: Record<string, RuleSet> = {
  [documentTranslation.kind]: documentTranslation,
  [codeReview.kind]: codeReview,
};

export function getRuleSet(kind: string): RuleSet | undefined {
  return ruleSets[kind];
}
