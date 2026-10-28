/** Seller webhook challenge; DENY when no delivery receipt arrives in time. ROADMAP V-07. */
import { notImplemented } from "@pactwright/core";

export async function challengeNonDelivery(_pactId: string): Promise<"delivered" | "deny"> {
  return notImplemented("V-07");
}
