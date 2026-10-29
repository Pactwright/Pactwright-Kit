import { documentTranslation } from "./document-translation.ts";
import type { RuleSet } from "./types.ts";

export const ruleSets: Record<string, RuleSet> = {
  [documentTranslation.kind]: documentTranslation,
};

export function getRuleSet(kind: string): RuleSet | undefined {
  return ruleSets[kind];
}
