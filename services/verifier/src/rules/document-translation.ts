/** MVP's only condition kind: `document.translation`. ROADMAP V-04. */
import { z } from "zod";
import { notImplemented } from "@pactwright/core";
import type { RuleSet } from "./types.ts";

const modelOutput = z.object({
  detectedLanguage: z.string(),
  pageCount: z.number().int().nonnegative(),
  isTranslationOfSource: z.boolean(),
  untranslatedSegments: z.number().int().nonnegative(),
  notes: z.string(),
});

export const documentTranslation: RuleSet<typeof modelOutput> = {
  kind: "document.translation",
  modelOutput,
  decide: () => notImplemented("V-04"),
};
