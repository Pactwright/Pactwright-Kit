import { describe, expect, it } from "vitest";
import { fromStroops, toStroops } from "../src/amounts.ts";

describe("toStroops / fromStroops", () => {
  it.each([
    ["0", 0n, "0"],
    ["1", 10_000_000n, "1"],
    ["1.25", 12_500_000n, "1.25"],
    ["0.0000001", 1n, "0.0000001"],
    ["123456789.1234567", 1_234_567_891_234_567n, "123456789.1234567"],
    ["1.5000000", 15_000_000n, "1.5"],
    ["007", 70_000_000n, "7"],
  ])("%s ⇄ %s", (decimal, stroops, canonical) => {
    expect(toStroops(decimal)).toBe(stroops);
    expect(fromStroops(stroops)).toBe(canonical);
  });

  it("round-trips the i128 maximum", () => {
    const max = (1n << 127n) - 1n;
    expect(toStroops(fromStroops(max))).toBe(max);
  });

  it("formats negative stroops (refund deltas)", () => {
    expect(fromStroops(-25_000_000n)).toBe("-2.5");
  });

  it.each(["", "-1", "1.12345678", "1e3", ".5", "1.", "0x10", " 1", "1,5", "NaN"])(
    "rejects %j",
    (bad) => expect(() => toStroops(bad)).toThrow(),
  );

  it("rejects values outside i128", () => {
    expect(() => toStroops("17014118346046923173168730371588410572.8")).toThrow();
    expect(() => fromStroops(1n << 127n)).toThrow();
  });
});
