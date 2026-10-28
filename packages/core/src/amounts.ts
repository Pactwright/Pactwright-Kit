/**
 * The only place decimal amounts and stroops are converted (ARCHITECTURE §7).
 * String-based and exact: no floating point anywhere.
 */

export const USDC_DECIMALS = 7;
const SCALE = 10n ** BigInt(USDC_DECIMALS);
const DECIMAL = /^(\d+)(?:\.(\d{1,7}))?$/;
/** i128 bounds, the on-chain amount type. */
const I128_MAX = (1n << 127n) - 1n;
const I128_MIN = -(1n << 127n);

/** `"1.25"` → `12500000n`. Rejects negatives, more than 7 decimals and anything non-decimal. */
export function toStroops(decimal: string): bigint {
  const match = DECIMAL.exec(decimal);
  if (!match) throw new Error(`invalid amount ${JSON.stringify(decimal)}: expected up to ${USDC_DECIMALS} decimals`);
  const whole = BigInt(match[1]!);
  const fraction = BigInt((match[2] ?? "").padEnd(USDC_DECIMALS, "0"));
  const stroops = whole * SCALE + fraction;
  if (stroops > I128_MAX) throw new Error(`amount ${decimal} exceeds i128`);
  return stroops;
}

/** `12500000n` → `"1.25"`; trailing zeros trimmed, no exponent notation. */
export function fromStroops(stroops: bigint): string {
  if (stroops > I128_MAX || stroops < I128_MIN) throw new Error("stroops outside i128 range");
  const negative = stroops < 0n;
  const abs = negative ? -stroops : stroops;
  const whole = abs / SCALE;
  const fraction = (abs % SCALE).toString().padStart(USDC_DECIMALS, "0").replace(/0+$/, "");
  return `${negative ? "-" : ""}${whole}${fraction ? `.${fraction}` : ""}`;
}
