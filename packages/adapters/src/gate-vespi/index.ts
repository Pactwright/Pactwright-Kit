/** Vespi human gate approves the budget (v1). ROADMAP P7-12. */
import { notImplemented } from "@pactwright/core";
import type { Gate, BudgetRequest, BudgetResult } from "../types.ts";

export class GateVespi implements Gate {
  approveBudget(_request: BudgetRequest): Promise<BudgetResult> {
    return notImplemented("P7-12");
  }
}
