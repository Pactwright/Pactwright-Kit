/** Route attribution via @accensa/sdk createSettleHook(); M2 auto-settle on ALLOW. ROADMAP K-07. */
import { createSettleHook } from "@accensa/sdk";

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
  sellerSecret?: string;
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

  const facilitatorUrl = options?.facilitatorUrl ?? process.env.FACILITATOR_URL ?? "https://facilitator.pactwright.dev";
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
    return {
      settled: true,
      txHash: data.txHash ?? "simulated_settle_tx_hash",
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
