# Facilitator Production Hardening (ROADMAP P8-04)

## Production Safety & Controls

1. **Pubnet Daily Fee Ceiling:**
   - Facilitator nodes maintain a strict daily sponsor ceiling (e.g. 50 XLM / day) tracked in memory and persistent storage.
   - Any transaction exceeding the per-transaction fee cap (10,000 stroops = 0.001 XLM) or the daily ceiling is immediately rejected.

2. **Settlement Evidence Logging:**
   - Every `/settle` and `/pact/submit` operation logs:
     - Transaction envelope SHA-256 hash
     - Network fee paid
     - Invocations and return values
   - Immutable audit log retained for 1 year.

3. **Rate Limiting & Abuse Prevention:**
   - Per-IP rate limiting: 60 requests / minute.
   - Per-API-key ceiling: 1,000 requests / minute.
   - Nonce and transaction expiration checks: rejects transactions with time bounds exceeding +300 seconds.

4. **Monitoring & Prometheus Metrics:**
   - Metric `facilitator_sponsored_fees_total`: cumulative XLM spent on sponsorship.
   - Metric `facilitator_active_pacts_opened`: count of M2 pacts funded through `/settle`.
   - Alert trigger: fires when sponsor wallet balance falls below 50 XLM.
