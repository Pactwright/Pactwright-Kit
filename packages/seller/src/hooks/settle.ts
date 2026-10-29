/** Route attribution via @accensa/sdk createSettleHook(); M2 auto-settle on ALLOW. ROADMAP K-07. */
import { createSettleHook } from "@accensa/sdk";
import { toStroops } from "@pactwright/core";
import { invokeContract, scv, type ChainOptions } from "../chain.ts";

export { createSettleHook };

export interface VerdictNotification {
  pactId: string;
  verdict: "allow" | "deny";
  allowedAmount?: string;
  attestation?: unknown;
}

export interface AutoSettleOptions {
  facilitatorUrl?: string;
  pactContractId?: string;
  /** Settle directly on-chain, signed by the seller, instead of through the facilitator. */
  chain?: ChainOptions;
  fetchImpl?: typeof fetch;
}

export interface AutoSettleResult {
  settled: boolean;
  txHash?: string;
  pactId: string;
  amount?: string;
}

/**
 * Handles auto-settle for M2 pacts on an ALLOW verdict (ROADMAP K-07).
 * Submits the settle action via /pact/submit on the facilitator.
 */
export async function handleAutoSettle(
  notification: VerdictNotification,
  options?: AutoSettleOptions,
): Promise<AutoSettleResult> {
  const { pactId, verdict, allowedAmount } = notification;

  if (verdict !== "allow") {
    return { settled: false, pactId };
  }

  const pactContractId = options?.pactContractId ?? process.env.PACT_CONTRACT_ID;
  if (options?.chain) {
    if (!pactContractId) throw new Error("auto-settle on-chain needs pactContractId");
    const sent = await invokeContract(options.chain, pactContractId, "settle", [
      scv.bytes32(pactId),
      scv.i128(toStroops(allowedAmount ?? "0")),
    ]);
    return { settled: true, txHash: sent.txHash, pactId, amount: allowedAmount };
  }

  // Through the facilitator's /pact/submit (fee-sponsored), once the `pact` scheme exists (ROADMAP X-04).
  const facilitatorUrl = options?.facilitatorUrl ?? process.env.FACILITATOR_URL;
  if (!facilitatorUrl) throw new Error("auto-settle needs either chain options or FACILITATOR_URL");
  const doFetch = options?.fetchImpl ?? globalThis.fetch;

  if (typeof doFetch !== "function") {
    throw new Error("No fetch implementation available for auto-settle");
  }

  const url = `${facilitatorUrl.replace(/\/$/, "")}/pact/submit`;
  const body = {
    action: "settle",
    pact_id: pactId,
    actual: allowedAmount ?? "0",
  };

  try {
    const res = await doFetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      throw new Error(`Facilitator /pact/submit failed with HTTP ${res.status}`);
    }

    interface SubmitResponse {
      txHash?: string;
      success?: boolean;
    }

    const data = (await res.json()) as SubmitResponse;
    if (!data.txHash) throw new Error("facilitator did not return a transaction hash");
    return {
      settled: true,
      txHash: data.txHash,
      pactId,
      amount: allowedAmount,
    };
  } catch (err) {
    throw new Error(`Failed to auto-settle pact ${pactId}: ${String(err)}`);
  }
}

export async function onSettled(event: unknown): Promise<void> {
  if (typeof event === "object" && event !== null && "pactId" in event) {
    await handleAutoSettle(event as VerdictNotification);
  }
}
