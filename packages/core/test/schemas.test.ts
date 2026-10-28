import { describe, expect, it } from "vitest";
import { PactwrightExtraSchema } from "../src/schemas.ts";

const hex = "a".repeat(64);

describe("PactwrightExtraSchema", () => {
  it("accepts the escrow example from ARCHITECTURE §8.1", () => {
    const extra = {
      version: 2,
      mode: "escrow",
      condition: { kind: "document.translation", lang: "pt", minPages: 1 },
      deliveryKey: hex,
      verifier: hex,
      verifierUrl: "https://verifier.pactwright.dev",
      pactContract: "C" + "A".repeat(55),
      silence: "refund",
      deadlines: { verdictLedgers: 120, settleLedgers: 720 },
      refundWindowLedgers: 17280,
    };
    expect(PactwrightExtraSchema.parse(extra)).toEqual(extra);
  });

  it("rejects an unknown mode", () => {
    expect(() =>
      PactwrightExtraSchema.parse({
        version: 2, mode: "allowance", condition: {}, deliveryKey: hex, verifier: hex,
        verifierUrl: "https://x.dev", refundWindowLedgers: 0,
      }),
    ).toThrow();
  });
});
