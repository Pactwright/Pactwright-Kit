# Vendored @accensa/sdk

| | |
|---|---|
| Upstream | https://github.com/accensa/accensa-app, `packages/sdk` |
| Commit | `69a22eb2a4ae8a48c9b05c3237ddeb4eb0f5e6b6` (2026-10-30) |
| License | MIT (`LICENSE`, copied unchanged) |
| Vendored | Settle hook middleware, settlement parsing, retry, errors, signing, and Merkle verification |
| Why | `@pactwright/seller` needs `createSettleHook()` (ROADMAP F-14 / K-07) but `@accensa/sdk` is not yet published on npm (404 on 2026-10-28). |

Update by re-copying modules from upstream, recording the commit hash here, and running `pnpm test`.
Switch to a published package if one appears on npm.
