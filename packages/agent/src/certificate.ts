/** Fetches a certificate (pending | anchored) and verifies it offline. ROADMAP K-08. */
import { notImplemented, type Certificate } from "@pactwright/core";
import type { PactwrightConfig } from "./client.ts";

export async function getCertificate(_config: PactwrightConfig, _pactId: string): Promise<Certificate> {
  return notImplemented("K-08");
}
