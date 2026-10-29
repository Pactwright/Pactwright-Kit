/** Route attribution via @accensa/sdk createSettleHook(); M2 auto-settle on ALLOW. ROADMAP K-07. */
import { createSettleHook } from "@accensa/sdk";
import { toStroops } from "@pactwright/core";
import { invokeContract, scv, type ChainOptions } from "../chain.ts";
import { submitPactCall, type PactSubmitOptions } from "@pactwright/contracts-client/submit";

export { createSettleHook };

export interface VerdictNotification {
  pactId: string;
  verdict: "allow" | "deny";
  allowedAmount?: string;
  attestation?: unknown;
}

export interface AutoSettleOptions {
  pactContractId?: string;
  /** Settle directly on-chain, signed by the seller, who pays the fee. */
  chain?: ChainOptions;
  /**
   * Settle through the facilitator's `/pact/submit`, which pays the fee. The seller still signs
   * its own authorization (`signer`).
   */
  facilitator?: Omit<PactSubmitOptions, "pactContractId">;
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

  if (!options?.facilitator) throw new Error("auto-settle needs chain or facilitator options");
  if (!pactContractId) throw new Error("auto-settle needs pactContractId");
  if (!options.facilitator.signer) throw new Error("settling through the facilitator needs the seller's signer");
  const sent = await submitPactCall("settle", [scv.bytes32(pactId), scv.i128(toStroops(allowedAmount ?? "0"))], {
    ...options.facilitator,
    pactContractId,
  });
  return { settled: true, txHash: sent.transaction, pactId, amount: allowedAmount };
}

export async function onSettled(event: unknown): Promise<void> {
  if (typeof event === "object" && event !== null && "pactId" in event) {
    await handleAutoSettle(event as VerdictNotification);
  }
}
