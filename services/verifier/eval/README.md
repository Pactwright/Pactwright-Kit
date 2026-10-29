# Verifier eval

Labelled ALLOW/DENY cases per condition kind (≥ 50 for `document.translation`). CI fails below 90% accuracy (ROADMAP V-08).

Case format: `cases/<kind>/<name>.json` with `condition`, `evidence`, `expected`.

The rules-only check above scores the rules on hand-written readings, so it says nothing about
the model. Keep it as the cheap per-PR check.

## Real-model eval (ROADMAP V-12)

[`real/`](real) holds real inputs: an English source document, human translations in 8
languages, and unrelated texts. [`real/cases.ts`](real/cases.ts) builds the labelled cases
from them. They cover full and partial deliveries, more pages than required, the wrong
language (including close pairs such as pt/es and zh/ja), the source returned unchanged, fluent
text that isn't a translation, untranslated sentences around the allowed limit, and empty
deliveries. Each case runs through the full pipeline: delivery receipt, evidence hash, the
configured model, rules, signing.

```bash
VERIFIER_PROVIDER=… VERIFIER_MODEL=… VERIFIER_LLM_API_KEY=… [LLM_BASE_URL=…] [VERIFIER_EFFORT=…] \
  node services/verifier/eval/real/run.ts --out report.json
```

It prints every case with its verdict, the model's reading next to the label when they differ,
and the sha256 of every raw model output. Then it prints accuracy per condition kind and exits
non-zero below 90%. In CI it runs from the `verifier-eval` workflow, on demand and weekly, never
per PR. It uses the `verifier-eval` environment: variables `VERIFIER_PROVIDER`, `VERIFIER_MODEL`,
`VERIFIER_EFFORT`, `LLM_BASE_URL` and the secret `VERIFIER_LLM_API_KEY`.

### Results

| Date | Provider | Model | Effort | Cases | Accuracy |
|---|---|---|---|---|---|
| — | — | — | — | 29 | not run yet: needs the pinned model and its API key |
