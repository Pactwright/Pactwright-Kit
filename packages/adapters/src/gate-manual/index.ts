/** Principal funds the agent from the CLI (MVP). ROADMAP K-13. */
import { toStroops } from "@pactwright/core";
import type { Gate, BudgetRequest, BudgetResult } from "../types.ts";

export interface GateManualOptions {
  /** Maximum budget amount in USDC that can be approved without prompt. */
  maxAutoApproveAmount?: string;
  /** Custom handler for approving requests (e.g., interactive CLI prompt). */
  promptHandler?: (request: BudgetRequest) => Promise<boolean> | boolean;
}

export class GateManual implements Gate {
  private readonly maxAutoApproveAmount?: string;
  private readonly promptHandler?: (request: BudgetRequest) => Promise<boolean> | boolean;

  constructor(options?: GateManualOptions) {
    this.maxAutoApproveAmount = options?.maxAutoApproveAmount;
    this.promptHandler = options?.promptHandler;
  }

  async approveBudget(request: BudgetRequest): Promise<BudgetResult> {
    if (this.promptHandler) {
      const approved = await this.promptHandler(request);
      return {
        approved,
        fundingTx: approved ? "manual_approval_tx" : undefined,
      };
    }

    if (this.maxAutoApproveAmount !== undefined) {
      const requested = toStroops(request.amount);
      const limit = toStroops(this.maxAutoApproveAmount);
      const approved = requested <= limit;
      return {
        approved,
        fundingTx: approved ? "auto_approved_tx" : undefined,
      };
    }

    // Default manual approval in CLI / test environment
    return {
      approved: true,
      fundingTx: "cli_budget_approved_tx",
    };
  }
}
