import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildTree, hashPair, verifyProof } from "../src/merkle.ts";

const read = (p: string) => JSON.parse(readFileSync(new URL(p, import.meta.url), "utf8"));
const accensa = read("./vectors/accensa/merkle-vectors.json");
const pactwright = read("./vectors/pactwright/merkle.json");
const leaf = (n: number) => createHash("sha256").update(`leaf-${n}`).digest("hex");
const h = (hex: string) => Buffer.from(hex, "hex");

describe("Accensa conformance vectors (ReceiptAnchor.verify_receipt)", () => {
  type Case = { name: string; leaf: string; proof: string[]; root: string; expected: boolean };
  it.each((accensa.cases as Case[]).map((c): [string, Case] => [c.name, c]))("%s", (_name, c) => {
    expect(verifyProof(c.leaf, c.proof, c.root)).toBe(c.expected);
  });
});

describe("Pactwright-contracts vectors (test-vectors/merkle.json)", () => {
  const [pair, tree] = pactwright.cases;
  it("pair hashing is order-independent", () => {
    expect(hashPair(h(pair.input.a), h(pair.input.b)).toString("hex")).toBe(pair.output);
    expect(hashPair(h(pair.input.b), h(pair.input.a)).toString("hex")).toBe(pair.output);
  });
  it("4-leaf tree root and proof", () => {
    const built = buildTree(tree.input.leaves);
    expect(built.root).toBe(tree.output);
    expect(built.proofs.get(tree.input.leaves[0])).toEqual(tree.proof_for_leaf_0);
  });
});

describe("odd-count trees promote the unpaired node unchanged", () => {
  it("3 leaves: root = H(H(l0, l1), l2)", () => {
    const [a, b, c] = [leaf(0), leaf(1), leaf(2)];
    const expected = hashPair(hashPair(h(a), h(b)), h(c)).toString("hex");
    const built = buildTree([a, b, c]);
    expect(built.root).toBe(expected);
    expect(built.proofs.get(c)).toEqual([hashPair(h(a), h(b)).toString("hex")]);
  });
  it("a single leaf is its own root with an empty proof", () => {
    const built = buildTree([leaf(0)]);
    expect(built.root).toBe(leaf(0));
    expect(built.proofs.get(leaf(0))).toEqual([]);
  });
});

describe("buildTree ↔ verifyProof round trip", () => {
  it.each(Array.from({ length: 17 }, (_, i) => [i + 1]))("%i leaves", (n) => {
    const leaves = Array.from({ length: n }, (_, i) => leaf(i));
    const built = buildTree(leaves);
    for (const l of leaves) expect(verifyProof(l, built.proofs.get(l)!, built.root)).toBe(true);
    if (n > 1) expect(verifyProof(leaf(999), built.proofs.get(leaves[0]!)!, built.root)).toBe(false);
  });
  it("rejects malformed input instead of throwing in verifyProof", () => {
    expect(verifyProof("zz", [], leaf(0))).toBe(false);
    expect(() => buildTree([])).toThrow();
    expect(() => buildTree(["abc"])).toThrow();
  });
});
