/**
 * Signs X-Pactwright-Delivery over the exact response body (ADR-012) and refuses service
 * once a pact is terminal. ROADMAP K-06. Core-team-only path.
 */
import { notImplemented } from "@pactwright/core";

export const DELIVERY_HEADER = "X-Pactwright-Delivery";

/** Returns `sha256=<body hash>; sig=<ed25519 base64>`. */
export function signDelivery(_pactId: string, _body: Uint8Array, _deliverySecret: Uint8Array): string {
  return notImplemented("K-06");
}
