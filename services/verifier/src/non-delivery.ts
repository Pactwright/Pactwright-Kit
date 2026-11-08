/**
 * Non-delivery challenge to the pact's own seller. ROADMAP V-07, ADR-020.
 *
 * Only an answer from the seller can justify a non-delivery DENY: a `2xx` without a receipt is
 * "deny". No endpoint, no answer, a non-`2xx` or an unreadable body is "unanswered", which means
 * no verdict; a caller-caused failure must never look like a seller admitting it didn't deliver.
 * The endpoint comes from the caller's code, never from the environment for all sellers or from
 * the verdict request.
 */

export interface NonDeliveryChallengeOptions {
  /** The pact's own seller's challenge endpoint, from a source the requester can't edit. */
  sellerWebhookUrl?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

export interface NonDeliveryChallengeResult {
  status: "delivered" | "deny" | "unanswered";
  deliveryReceipt?: string;
  reason?: string;
}

export async function challengeNonDelivery(
  pactId: string,
  options?: NonDeliveryChallengeOptions,
): Promise<NonDeliveryChallengeResult> {
  const webhookUrl = options?.sellerWebhookUrl;
  if (!webhookUrl) {
    return { status: "unanswered", reason: "no_seller_endpoint" };
  }

  const doFetch = options?.fetchImpl ?? globalThis.fetch;
  const timeoutMs = options?.timeoutMs ?? 5000;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await doFetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        pactId,
        type: "non_delivery_challenge",
        timestamp: new Date().toISOString(),
      }),
      signal: controller.signal,
    });

    clearTimeout(timer);

    if (!res.ok) {
      return { status: "unanswered", reason: `seller_responded_http_${res.status}` };
    }

    interface ChallengeResponse {
      deliveryReceipt?: string;
    }

    let data: ChallengeResponse;
    try {
      data = (await res.json()) as ChallengeResponse;
    } catch {
      return { status: "unanswered", reason: "seller_answer_unreadable" };
    }
    if (data.deliveryReceipt && data.deliveryReceipt.includes("sha256=") && data.deliveryReceipt.includes("sig=")) {
      return {
        status: "delivered",
        deliveryReceipt: data.deliveryReceipt,
      };
    }

    return { status: "deny", reason: "seller_answered_without_a_delivery_receipt" };
  } catch (err) {
    clearTimeout(timer);
    return { status: "unanswered", reason: `challenge_timeout_or_error: ${String(err)}` };
  }
}
