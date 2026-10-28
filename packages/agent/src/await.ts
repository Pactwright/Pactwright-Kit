/** Evidence → verdict → terminal state. ROADMAP K-08. */
import { notImplemented, type PactState } from "@pactwright/core";
import type { Pact } from "./buy.ts";
import type { PactwrightConfig } from "./client.ts";

export interface AwaitOptions {
  until?: "verdict" | "terminal";
  timeoutMs?: number;
}

export async function awaitPact(
  _config: PactwrightConfig,
  _pact: Pact,
  _options?: AwaitOptions,
): Promise<PactState> {
  return notImplemented("K-08");
}
