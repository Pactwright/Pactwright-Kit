/** The only place decimal amounts and stroops are converted (ARCHITECTURE §7). */
import { notImplemented } from "./errors.ts";

export const USDC_DECIMALS = 7;

export function toStroops(_decimal: string): bigint {
  return notImplemented("K-04");
}

export function fromStroops(_stroops: bigint): string {
  return notImplemented("K-04");
}
