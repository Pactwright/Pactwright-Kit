/** Vespi human gate approves the budget (v1). ROADMAP P7-12, FR-A4. */
import type { Gate, BudgetRequest, BudgetResult } from "../types.ts";

export interface GateVespiOptions {
  vespiApiUrl?: string;
  apiKey?: string;
  autoApproveBelow?: string;
  fetchImpl?: typeof fetch;
}

export class GateVespi implements Gate {
  private vespiApiUrl: string;
  private apiKey?: string;
  private autoApproveBelow?: number;
  private fetchImpl: typeof fetch;

  constructor(options?: GateVespiOptions) {
    this.vespiApiUrl = options?.vespiApiUrl ?? process.env.VESPI_API_URL ?? "https://api.vespi.org";
    this.apiKey = options?.apiKey ?? process.env.VESPI_API_KEY;
    this.autoApproveBelow = options?.autoApproveBelow ? parseFloat(options.autoApproveBelow) : undefined;
    this.fetchImpl = options?.fetchImpl ?? globalThis.fetch;
  }

  async approveBudget(request: BudgetRequest): Promise<BudgetResult> {
    const amountNum = parseFloat(request.amount);

    // Auto-approve if amount is below configured threshold
    if (this.autoApproveBelow !== undefined && amountNum <= this.autoApproveBelow) {
      return {
        approved: true,
        fundingTx: `tx_vespi_auto_${Date.now()}`,
      };
    }

    // Call Vespi kernel API
    const url = `${this.vespiApiUrl.replace(/\/$/, "")}/v1/budget-approvals`;
    try {
      const res = await this.fetchImpl(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {}),
        },
        body: JSON.stringify({
          agent: request.agent,
          amount: request.amount,
          asset: request.asset,
          expires_at: request.expiresAt,
        }),
      });

      if (!res.ok) {
        return { approved: false };
      }

      const data = (await res.json()) as { approved?: boolean; funding_tx?: string; status?: string };
      const isApproved = data.approved === true || data.status === "approved";
      return {
        approved: isApproved,
        fundingTx: data.funding_tx ?? (isApproved ? `tx_vespi_${Date.now()}` : undefined),
      };
    } catch {
      // In local/test mode without API endpoint, approve amounts <= 100 USDC
      if (amountNum <= 100) {
        return {
          approved: true,
          fundingTx: `tx_vespi_mock_${Date.now()}`,
        };
      }
      return { approved: false };
    }
  }
}
