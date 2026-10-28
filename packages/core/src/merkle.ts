/**
 * Sorted-pair SHA-256 Merkle tree, identical to Accensa `ReceiptAnchor.verify_receipt` and
 * `@accensa/sdk` `buildBatch` (ARCHITECTURE §4.3):
 *
 * - a node is `sha256(min(a, b) ‖ max(a, b))`, bytewise, so proofs carry no position flags;
 * - an unpaired node at the end of a level is promoted unchanged (not duplicated);
 * - proofs list siblings leaf-to-root.
 */
import { createHash } from "node:crypto";

export interface MerkleTree {
  root: string;
  /** Leaves in the order given, lowercase hex. */
  leaves: string[];
  /** Proof (sibling hashes, leaf-to-root) per leaf, keyed by leaf hex. */
  proofs: Map<string, string[]>;
}

const HEX32 = /^[0-9a-f]{64}$/;

function decode(value: string, label: string): Buffer {
  const hex = value.trim().toLowerCase();
  if (!HEX32.test(hex)) throw new Error(`${label} must be a 32-byte hex string`);
  return Buffer.from(hex, "hex");
}

export function hashPair(a: Buffer, b: Buffer): Buffer {
  const [lo, hi] = Buffer.compare(a, b) <= 0 ? [a, b] : [b, a];
  return createHash("sha256").update(Buffer.concat([lo, hi])).digest();
}

function buildLevels(leaves: Buffer[]): Buffer[][] {
  const levels: Buffer[][] = [leaves];
  let level = leaves;
  while (level.length > 1) {
    const next: Buffer[] = [];
    for (let i = 0; i < level.length; i += 2) {
      const left = level[i]!;
      const right = level[i + 1];
      next.push(right ? hashPair(left, right) : left);
    }
    levels.push(next);
    level = next;
  }
  return levels;
}

function proofFor(levels: Buffer[][], index: number): Buffer[] {
  const proof: Buffer[] = [];
  let i = index;
  for (let l = 0; l < levels.length - 1; l++) {
    const level = levels[l]!;
    const sibling = i % 2 === 0 ? i + 1 : i - 1;
    if (sibling < level.length) proof.push(level[sibling]!);
    i = Math.floor(i / 2);
  }
  return proof;
}

/** Builds the tree and a proof for every leaf. Leaf order is significant. */
export function buildTree(leaves: string[]): MerkleTree {
  if (leaves.length === 0) throw new Error("cannot build a Merkle tree with no leaves");
  const buffers = leaves.map((leaf, i) => decode(leaf, `leaves[${i}]`));
  const levels = buildLevels(buffers);
  const root = levels[levels.length - 1]![0]!.toString("hex");
  const normalised = buffers.map((b) => b.toString("hex"));
  const proofs = new Map<string, string[]>();
  normalised.forEach((leaf, i) => {
    proofs.set(leaf, proofFor(levels, i).map((b) => b.toString("hex")));
  });
  return { root, leaves: normalised, proofs };
}

/** Offline equivalent of `ReceiptAnchor.verify_receipt`. Malformed input returns false. */
export function verifyProof(leaf: string, proof: string[], root: string): boolean {
  try {
    let computed = decode(leaf, "leaf");
    for (const [i, sibling] of proof.entries()) {
      computed = hashPair(computed, decode(sibling, `proof[${i}]`));
    }
    return computed.equals(decode(root, "root"));
  } catch {
    return false;
  }
}
