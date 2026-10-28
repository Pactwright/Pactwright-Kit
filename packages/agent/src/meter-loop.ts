/** v1: signs cumulative UsageVouchers in the background; never beyond cap (ADR-010). ROADMAP P7-02. */
import { notImplemented } from "@pactwright/core";

export interface MeterLoop {
  /** Signs a voucher for `units` (cumulative) and sends it to the seller. */
  tick(units: number): Promise<void>;
  stop(): void;
}

export function startMeterLoop(_pactId: string, _unitPrice: string, _cap: string): MeterLoop {
  return notImplemented("P7-02");
}
