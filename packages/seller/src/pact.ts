/** Route options → behavior. ARCHITECTURE §6.3. */
import type { Mode, Silence } from "@pactwright/core";

export interface PactRouteOptions<Req = unknown> {
  mode: Mode;
  /** Decimal USDC amount (cap for escrow). */
  price: string;
  asset: "USDC";
  /** Condition template; the buyer freezes it before paying. */
  condition: (req: Req) => Record<string, unknown>;
  /** Below this amount: receipt only, no verification (B12). */
  verify?: { minAmount: string };
  /** Escrow only. Default "refund". */
  silence?: Silence;
  /** Escrow only. Ledger counts from open. */
  deadlines?: { verdictLedgers: number; settleLedgers: number };
  refundWindowLedgers: number;
  /** Escrow only (v1). */
  meter?: { unit: string; unitPrice: string };
}
