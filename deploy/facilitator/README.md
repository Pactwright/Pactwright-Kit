# Testnet facilitator on Vercel

Pactwright's testnet x402 facilitator is [Accensa's](https://github.com/accensa/x402-facilitator-stellar),
with the [`pact` scheme](https://github.com/accensa/x402-facilitator-stellar/pull/651), hosted as one
Vercel Function at **https://pactwright-facilitator.vercel.app** (project `pactwright-facilitator`).

Nothing upstream is changed. `build.mjs` fetches the pinned commit into `upstream/`, installs it from
its own lockfile and bundles [`handler.mjs`](handler.mjs) into `.vercel/output`. The handler is the
serverless counterpart of upstream's `src/server.js`: the same configuration, signers, RPC retry and
routes, without the port, timers or background workers.

```sh
npm ci
npm run build                      # FACILITATOR_REF=<sha> to build another upstream commit
vercel deploy --prebuilt --prod
```

Production environment variables:

| Name | Value |
|---|---|
| `NETWORK` | `stellar:testnet` |
| `PACT_CONTRACT_ID` | `CDUXJJUNYFILEYHE3LITANJEKCDFERNAABOSG75OWATFVM776BCMFEV6` |
| `TRUST_PROXY` | `1` |
| `FACILITATOR_SECRET` | Funded testnet fee-paying signer, distinct from every buyer and seller |
| `FACILITATOR_API_KEYS` | Comma-separated caller keys, 32+ characters each: an open facilitator pays fees for anyone |

Without `DATABASE_URL` or `REDIS_URL`, rate limits, idempotency and the settlement record are kept per
function instance. That is enough for testnet; set them for anything that needs durable state.

Check it with `GET /healthz` (`{"ok":true}`) and `GET /supported` (`exact` and `pact` on
`stellar:testnet`, with `pactContract` set).
