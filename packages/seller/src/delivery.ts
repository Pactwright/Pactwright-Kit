/**
 * Signs X-Pactwright-Delivery over the exact response body (ADR-012) and refuses service
 * once a pact is terminal. ROADMAP K-06. Core-team-only path.
 */
import { createHash } from "node:crypto";
import { Keypair, deliveryMessage } from "@pactwright/core";

export const DELIVERY_HEADER = "X-Pactwright-Delivery";

/** Returns `sha256=<body hash>; sig=<ed25519 base64>`. */
export function signDelivery(
  pactId: string,
  body: Uint8Array,
  deliverySecret: Uint8Array | string,
): string {
  const bodySha256 = createHash("sha256").update(body).digest("hex");
  const digest = deliveryMessage(pactId, bodySha256);

  const seedBytes = typeof deliverySecret === "string"
    ? Buffer.from(deliverySecret.replace(/^0x/, ""), "hex")
    : Buffer.from(deliverySecret);

  const kp = Keypair.fromRawEd25519Seed(seedBytes);
  const sig = kp.sign(Buffer.from(digest));
  const sigBase64 = Buffer.from(sig).toString("base64");

  return `sha256=${bodySha256}; sig=${sigBase64}`;
}

export function parseDeliveryHeader(
  header: string,
): { bodySha256: string; signature: string } | null {
  const match = header.match(/sha256=([0-9a-fA-F]{64});\s*sig=([A-Za-z0-9+/=]+)/);
  if (!match || !match[1] || !match[2]) return null;
  return { bodySha256: match[1].toLowerCase(), signature: match[2] };
}
