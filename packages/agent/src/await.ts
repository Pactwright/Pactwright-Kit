/** Evidence → verdict → terminal state. ROADMAP K-08. */
import type { PactState } from "@pactwright/core";
import type { Pact } from "./buy.ts";
import type { PactwrightConfig } from "./client.ts";

export interface AwaitOptions {
  until?: "verdict" | "terminal";
  timeoutMs?: number;
  evidence?: { uri: string; sha256: string; mimeType: string }[];
}

export async function awaitPact(
  config: PactwrightConfig,
  pact: Pact,
  options?: AwaitOptions,
): Promise<PactState> {
  const until = options?.until ?? "terminal";
  const evidence = options?.evidence ?? [];

  const verdictOutput = await config.adapters.verifier.requestVerdict({
    terms: pact.terms,
    evidence,
    deliveryReceipt: pact.deliveryReceipt,
  });

  if (until === "verdict") {
    return verdictOutput.verdict === "ALLOW" ? "allowed" : "denied";
  }

  if (pact.terms.mode === "exact-refund") {
    if (verdictOutput.verdict === "ALLOW") {
      return "settled";
    } else {
      return "refunded";
    }
  } else {
    if (verdictOutput.verdict === "ALLOW") {
      return "settled";
    } else {
      return "released";
    }
  }
}
