/** Sorted-pair SHA-256 Merkle tree, identical to Accensa ReceiptAnchor / verifyReceipt(). */
import { notImplemented } from "./errors.ts";

export interface MerkleTree {
  root: string;
  /** Proof (sibling hashes) per leaf, keyed by leaf hex. */
  proofs: Map<string, string[]>;
}

export function buildTree(_leaves: string[]): MerkleTree {
  return notImplemented("K-04");
}

export function verifyProof(_leaf: string, _proof: string[], _root: string): boolean {
  return notImplemented("K-04");
}
