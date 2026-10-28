# Vendored @witness/core

| | |
|---|---|
| Upstream | https://github.com/fabian416/witness, `packages/core` |
| Commit | `1f9a8e218244a3a97858378e85d4f63eb4912ca5` (2026-10-26) |
| License | Apache-2.0 (`LICENSE`, copied unchanged) |
| Vendored | `src/` and `test/`, unmodified |
| Why | Pactwright's verdict envelopes are Witness verdict-v1 envelopes, used unchanged (ARCHITECTURE §6.5). Upstream marks the package `private`, so it is not on npm. |

Update by re-copying `packages/core/{src,test}` from a newer upstream commit, recording it
here, and running `pnpm test`. Do not edit files under `src/` or `test/`; Pactwright-specific
code belongs in `@pactwright/*`. Switch to a published package if one appears (ROADMAP P9-07).
