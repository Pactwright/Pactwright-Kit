/** Seller webhook challenge; DENY when no delivery receipt arrives in time. ROADMAP V-07. */

export interface NonDeliveryChallengeOptions {
  sellerWebhookUrl?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

export interface NonDeliveryChallengeResult {
  status: "delivered" | "deny";
  deliveryReceipt?: string;
  reason?: string;
}

export async function challengeNonDelivery(
  pactId: string,
  options?: NonDeliveryChallengeOptions,
): Promise<NonDeliveryChallengeResult> {
  const webhookUrl = options?.sellerWebhookUrl ?? process.env.SELLER_WEBHOOK_URL;
  if (!webhookUrl) {
    return { status: "deny", reason: "no_seller_webhook_configured" };
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
      return { status: "deny", reason: `seller_responded_http_${res.status}` };
    }

    interface ChallengeResponse {
      deliveryReceipt?: string;
    }

    const data = (await res.json()) as ChallengeResponse;
    if (data.deliveryReceipt && data.deliveryReceipt.includes("sha256=") && data.deliveryReceipt.includes("sig=")) {
      return {
        status: "delivered",
        deliveryReceipt: data.deliveryReceipt,
      };
    }

    return { status: "deny", reason: "seller_omitted_valid_delivery_receipt" };
  } catch (err) {
    clearTimeout(timer);
    return { status: "deny", reason: `challenge_timeout_or_error: ${String(err)}` };
  }
}
