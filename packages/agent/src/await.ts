/** Evidence → verdict → terminal state. ROADMAP K-08. */
import type { PactState } from "@pactwright/core";
import { Client } from "@pactwright/contracts-client";
import type { Pact } from "./buy.ts";
import type { PactwrightConfig } from "./client.ts";

export interface AwaitOptions {
  until?: "verdict" | "terminal";
  timeoutMs?: number;
  pollIntervalMs?: number;
  evidence?: { uri: string; sha256: string; mimeType: string }[];
  pactReader?: (pactId: string) => Promise<PactState>;
}

export async function awaitPact(
  config: PactwrightConfig,
  pact: Pact,
  options?: AwaitOptions,
): Promise<PactState> {
  const until = options?.until ?? "terminal";
  const evidence = options?.evidence ?? [];
  const timeoutMs = options?.timeoutMs ?? 30_000;
  const pollIntervalMs = options?.pollIntervalMs ?? 500;

  const verdictOutput = await config.adapters.verifier.requestVerdict({
    terms: pact.terms,
    evidence,
    deliveryReceipt: pact.deliveryReceipt,
  });

  if (until === "verdict") {
    return verdictOutput.verdict === "ALLOW" ? "allowed" : "denied";
  }

  const readState: (pactId: string) => Promise<PactState> =
    options?.pactReader ??
    config.pactReader ??
    (async (id: string) => {
      if (!config.network.pactContract) {
        throw new Error("pactContract is required to poll pact state");
      }
      const client = new Client({
        contractId: config.network.pactContract,
        networkPassphrase: config.network.passphrase,
        rpcUrl: config.network.rpcUrl,
      });
      const res = await client.get_pact({ pact_id: Buffer.from(id, "hex") });
      const rawResult = (res as { result?: { unwrap?: () => { state?: unknown } } | { state?: unknown } })?.result;
      const pactData =
        typeof (rawResult as { unwrap?: () => unknown })?.unwrap === "function"
          ? (rawResult as { unwrap: () => { state?: unknown } }).unwrap()
          : (rawResult as { state?: unknown } | undefined);
      if (!pactData) return "funded";
      const s = pactData.state;
      if (s === 1 || s === "Funded") return "funded";
      if (s === 2 || s === "Allowed") return "allowed";
      if (s === 3 || s === "Denied") return "denied";
      if (s === 4 || s === "Settled") return "settled";
      if (s === 5 || s === "Released") {
        return pact.terms.mode === "exact-refund" ? "refunded" : "released";
      }
      return "funded";
    });

  const deadline = Date.now() + timeoutMs;
  let currentState: PactState = "funded";

  while (Date.now() <= deadline) {
    currentState = await readState(pact.terms.pactId);
    if (currentState === "settled" || currentState === "released" || currentState === "refunded") {
      return currentState;
    }
    const remaining = deadline - Date.now();
    if (remaining <= 0) break;
    await new Promise((r) => setTimeout(r, Math.min(pollIntervalMs, remaining)));
  }

  // If deadline reached before terminal state, return the state that was observed (never invent one)
  return currentState;
}
