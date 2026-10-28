/** Request idempotency key → nonce (ARCHITECTURE §4.3). ROADMAP K-08. */
import { nonceFromIdempotencyKey } from "@pactwright/core";

export function deriveNonce(idempotencyKey: string): bigint {
  return nonceFromIdempotencyKey(idempotencyKey);
}
