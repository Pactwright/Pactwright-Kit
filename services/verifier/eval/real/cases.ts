/**
 * Labelled real-input cases for `document.translation` (ROADMAP V-12). Each case is a source
 * document, a delivered document and a hand-written label: the verdict and amount a correct
 * reading must produce, and the reading itself (`truth`) so a failure can be traced to the model
 * field it got wrong. Labels come from how the documents were built, never from the rules.
 */
import { SOURCE_EN, TRANSLATIONS, UNRELATED, render, type Pages } from "./corpus.ts";
import type { DocumentTranslationReading } from "../../src/rules/document-translation.ts";

export interface RealCase {
  id: string;
  kind: string;
  description: string;
  condition: Record<string, unknown> & { kind: string };
  cap: string;
  /** Rendered source document, or null when the buyer supplied none. */
  source: string | null;
  delivered: string;
  truth: DocumentTranslationReading;
  expected: { verdict: "ALLOW" | "DENY"; amountStroops?: string };
}

const CAP = "1.00";
const CAP_STROOPS = 10_000_000n;
const KIND = "document.translation";

function condition(lang: string, minPages: number, maxUntranslatedSegments = 0) {
  return { kind: KIND, lang, minPages, maxUntranslatedSegments };
}

/** Replaces `n` sentences with the English source, spread over the pages (odd slots first). */
function withUntranslated(pages: Pages, n: number): Pages {
  const slots = [1, 3, 5, 7, 0, 2, 4, 6].slice(0, n);
  const out = pages.map((p) => [...p] as [string, string]);
  for (const slot of slots) {
    const page = Math.floor(slot / 2);
    const sentence = slot % 2;
    out[page]![sentence] = SOURCE_EN[page]![sentence]!;
  }
  return out;
}

function allow(stroops: bigint) {
  return { verdict: "ALLOW" as const, amountStroops: stroops.toString() };
}
const DENY = { verdict: "DENY" as const };

function reading(detectedLanguage: string, pageCount: number, isTranslationOfSource: boolean, untranslatedSegments = 0) {
  return { detectedLanguage, pageCount, isTranslationOfSource, untranslatedSegments, notes: "" };
}

const source = render(SOURCE_EN);
const t = (lang: string) => TRANSLATIONS[lang]!;
const cases: RealCase[] = [];
const add = (c: Omit<RealCase, "kind" | "cap" | "source"> & { source?: string | null }) =>
  cases.push({ kind: KIND, cap: CAP, source, ...c });

for (const lang of ["es", "fr", "de", "pt", "it", "nl", "ja", "zh"]) {
  add({
    id: `allow_full_${lang}`,
    description: `complete 4-page translation into ${lang}${lang === "pt" ? " (Brazilian Portuguese)" : ""}`,
    condition: condition(lang, 4),
    delivered: render(t(lang)),
    truth: reading(lang, 4, true),
    expected: allow(CAP_STROOPS),
  });
}

add({
  id: "allow_more_pages_than_required_es",
  description: "4 translated pages where 2 are required: paid in full, not more",
  condition: condition("es", 2),
  delivered: render(t("es")),
  truth: reading("es", 4, true),
  expected: allow(CAP_STROOPS),
});

for (const [lang, k] of [["es", 1], ["fr", 2], ["de", 3], ["ja", 2]] as const) {
  add({
    id: `allow_prorata_${lang}_${k}_of_4`,
    description: `only the first ${k} of 4 pages delivered: paid ${k}/4`,
    condition: condition(lang, 4),
    delivered: render(t(lang).slice(0, k)),
    truth: reading(lang, k, true),
    expected: allow((CAP_STROOPS * BigInt(k)) / 4n),
  });
}

for (const [required, delivered] of [["es", "fr"], ["de", "nl"], ["pt", "es"], ["it", "es"], ["zh", "ja"]] as const) {
  add({
    id: `deny_lang_${delivered}_for_${required}`,
    description: `a correct translation, but into ${delivered} instead of ${required}`,
    condition: condition(required, 4),
    delivered: render(t(delivered)),
    truth: reading(delivered, 4, true),
    expected: DENY,
  });
}

add({
  id: "deny_source_returned_unchanged_for_fr",
  description: "the English source sent back as the 'translation'",
  condition: condition("fr", 4),
  delivered: source,
  truth: reading("en", 4, false),
  expected: DENY,
});

for (const lang of ["es", "fr"]) {
  add({
    id: `deny_unrelated_text_${lang}`,
    description: `4 pages of fluent ${lang} that are a recipe, not the source`,
    condition: condition(lang, 4),
    delivered: render(UNRELATED[lang]!),
    truth: reading(lang, 4, false),
    expected: DENY,
  });
}

for (const [lang, n, max, expected] of [
  ["es", 1, 0, DENY],
  ["fr", 3, 1, DENY],
  ["nl", 4, 0, DENY],
  ["zh", 1, 0, DENY],
  ["de", 2, 2, allow(CAP_STROOPS)],
  ["it", 1, 1, allow(CAP_STROOPS)],
] as const) {
  add({
    id: `${expected.verdict.toLowerCase()}_untranslated_${lang}_${n}_max_${max}`,
    description: `${n} of 8 sentences left in English, at most ${max} allowed`,
    condition: condition(lang, 4, max),
    delivered: render(withUntranslated(t(lang), n)),
    truth: reading(lang, 4, true, n),
    expected,
  });
}

add({
  id: "deny_empty_delivery",
  description: "empty response body",
  condition: condition("es", 4),
  delivered: "",
  truth: reading("", 0, false),
  expected: DENY,
});

add({
  id: "deny_page_markers_only",
  description: "page markers with no text on any page",
  condition: condition("es", 2),
  delivered: "=== Page 1 ===\n\n=== Page 2 ===\n",
  truth: reading("", 0, false),
  expected: DENY,
});

export const REAL_CASES: readonly RealCase[] = cases;
