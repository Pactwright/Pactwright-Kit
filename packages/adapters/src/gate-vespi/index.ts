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
      // Auto-approval moves no money, so there is no funding transaction.
      return { approved: true };
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
        ...(isApproved && data.funding_tx ? { fundingTx: data.funding_tx } : {}),
      };
    } catch {
      // Fail closed: if Vespi can't be reached, the budget is not approved.
      return { approved: false };
    }
  }
}
