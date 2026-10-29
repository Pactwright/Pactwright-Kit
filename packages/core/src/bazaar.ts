/**
 * Bazaar pactwright field schema and validator (X-06, FR-D1, FR-D2).
 */
import { z } from "zod";
import { ModeSchema, SilenceSchema, StellarAddress, DecimalAmount } from "./schemas.ts";

export const BazaarPactwrightSchema = z.object({
  mode: ModeSchema,
  verifier: StellarAddress,
  silence: SilenceSchema.optional(),
  refundWindowLedgers: z.number().int().nonnegative(),
  float: DecimalAmount.optional(),
});

export type BazaarPactwrightField = z.infer<typeof BazaarPactwrightSchema>;

export function createBazaarPactwrightField(input: BazaarPactwrightField): BazaarPactwrightField {
  return BazaarPactwrightSchema.parse(input);
}
