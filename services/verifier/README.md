# Verifier service

Witness-compatible verifier: delivery receipt → evidence hash → model reads → **rules decide**
→ signed verdict-v1 envelope (+ one attestation per pact for escrow). ARCHITECTURE §6.5.

Planned dependencies (added with their tasks): `hono` + `@hono/node-server` (V-01),
the chosen LLM provider's SDK (V-03), vendored `@witness/core` (K-14).
