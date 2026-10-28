/** Principal funds the agent from the CLI (MVP). ROADMAP K-13. */
import { notImplemented } from "@pactwright/core";
import type { Gate, BudgetRequest, BudgetResult } from "../types.ts";

export class GateManual implements Gate {
  approveBudget(_request: BudgetRequest): Promise<BudgetResult> {
    return notImplemented("K-13");
  }
}
