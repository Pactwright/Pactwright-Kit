import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { Keypair } from "@stellar/stellar-base";
import {
  canonicalize,
  conditionHash,
  deliveryMessage,
  nonceFromIdempotencyKey,
  pactId,
  receiptLeaf,
  usageMessage,
  verdictMessage,
} from "../src/hashing.ts";
import { buildTree, hashPair, verifyProof } from "../src/merkle.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const vectorsDir = join(__dirname, "vectors/pactwright");

function loadVector<T>(filename: string): T {
  const content = readFileSync(join(vectorsDir, filename), "utf8");
  return JSON.parse(content) as T;
}

describe("hashing vs test-vectors", () => {
  it("nonce", () => {
    interface NonceVector {
      cases: Array<{
        name: string;
        input: { idempotency_key: string };
        output: string;
      }>;
    }
    const vector = loadVector<NonceVector>("nonce.json");
    for (const c of vector.cases) {
      const result = nonceFromIdempotencyKey(c.input.idempotency_key);
      expect(result.toString(), c.name).toBe(c.output);
    }
  });

  it("pact_id", () => {
    interface PactIdVector {
      cases: Array<{
        name: string;
        input: {
          buyer: string;
          seller: string;
          nonce: string;
          condition_hash: string;
        };
        output: string;
      }>;
    }
    const vector = loadVector<PactIdVector>("pact_id.json");
    for (const c of vector.cases) {
      const result = pactId(
        c.input.buyer,
        c.input.seller,
        BigInt(c.input.nonce),
        c.input.condition_hash,
      );
      expect(result, c.name).toBe(c.output);
    }
  });

  it("condition_hash", () => {
    interface ConditionHashVector {
      cases: Array<{
        name: string;
        input: { condition: Record<string, unknown> };
        canonical?: string;
        output: string;
      }>;
    }
    const vector = loadVector<ConditionHashVector>("condition_hash.json");
    for (const c of vector.cases) {
      if (c.canonical) {
        expect(canonicalize(c.input.condition), `${c.name} canonical`).toBe(c.canonical);
      }
      const result = conditionHash(c.input.condition);
      expect(result, c.name).toBe(c.output);
    }
  });

  it("verdict_attestation", () => {
    interface VerdictVector {
      cases: Array<{
        name: string;
        input: {
          pact_id: string;
          condition_hash: string;
          envelope_hash: string;
          verdict: "Allow" | "Deny";
          amount: string;
          issued_ledger: number;
        };
        output: string;
        signer_seed: string;
        signer_public_key: string;
        signature: string;
      }>;
    }
    const vector = loadVector<VerdictVector>("verdict_attestation.json");
    for (const c of vector.cases) {
      const digest = verdictMessage({
        pactId: c.input.pact_id,
        conditionHash: c.input.condition_hash,
        envelopeHash: c.input.envelope_hash,
        verdict: c.input.verdict === "Allow" ? "ALLOW" : "DENY",
        amount: c.input.amount,
        issuedLedger: c.input.issued_ledger,
      });
      const digestHex = Buffer.from(digest).toString("hex");
      expect(digestHex, `${c.name} digest`).toBe(c.output);

      // Verify ed25519 signature
      const kp = Keypair.fromRawEd25519Seed(Buffer.from(c.signer_seed, "hex"));
      expect(kp.rawPublicKey().toString("hex"), `${c.name} public key`).toBe(c.signer_public_key);
      const verified = kp.verify(Buffer.from(digest), Buffer.from(c.signature, "hex"));
      expect(verified, `${c.name} signature verification`).toBe(true);
    }
  });

  it("usage_voucher", () => {
    interface VoucherVector {
      cases: Array<{
        name: string;
        input: {
          pact_id: string;
          units: number;
        };
        output: string;
        signer_seed: string;
        signer_public_key: string;
        signature: string;
      }>;
    }
    const vector = loadVector<VoucherVector>("usage_voucher.json");
    for (const c of vector.cases) {
      const digest = usageMessage({
        pactId: c.input.pact_id,
        units: c.input.units,
      });
      const digestHex = Buffer.from(digest).toString("hex");
      expect(digestHex, `${c.name} digest`).toBe(c.output);

      const kp = Keypair.fromRawEd25519Seed(Buffer.from(c.signer_seed, "hex"));
      expect(kp.rawPublicKey().toString("hex"), `${c.name} public key`).toBe(c.signer_public_key);
      const verified = kp.verify(Buffer.from(digest), Buffer.from(c.signature, "hex"));
      expect(verified, `${c.name} signature verification`).toBe(true);
    }
  });

  it("delivery_receipt", () => {
    interface DeliveryVector {
      cases: Array<{
        name: string;
        input: {
          pact_id: string;
          body_utf8: string;
          body_sha256: string;
        };
        output: string;
        signer_seed: string;
        signer_public_key: string;
        signature: string;
      }>;
    }
    const vector = loadVector<DeliveryVector>("delivery_receipt.json");
    for (const c of vector.cases) {
      const digest = deliveryMessage(c.input.pact_id, c.input.body_sha256);
      const digestHex = Buffer.from(digest).toString("hex");
      expect(digestHex, `${c.name} digest`).toBe(c.output);

      const kp = Keypair.fromRawEd25519Seed(Buffer.from(c.signer_seed, "hex"));
      expect(kp.rawPublicKey().toString("hex"), `${c.name} public key`).toBe(c.signer_public_key);
      const verified = kp.verify(Buffer.from(digest), Buffer.from(c.signature, "hex"));
      expect(verified, `${c.name} signature verification`).toBe(true);
    }
  });

  it("receipt_leaf", () => {
    interface ReceiptLeafVector {
      cases: Array<{
        name: string;
        input: {
          pact_id: string;
          transition: number;
          to_seller: string;
          to_buyer: string;
          envelope_hash: string | null;
          ledger: number;
        };
        output: string;
      }>;
    }
    const vector = loadVector<ReceiptLeafVector>("receipt_leaf.json");
    for (const c of vector.cases) {
      const result = receiptLeaf({
        pactId: c.input.pact_id,
        transition: c.input.transition,
        toSeller: c.input.to_seller,
        toBuyer: c.input.to_buyer,
        envelopeHash: c.input.envelope_hash,
        ledger: c.input.ledger,
      });
      expect(result, c.name).toBe(c.output);
    }
  });

  it("merkle", () => {
    interface MerkleVector {
      cases: Array<{
        name: string;
        input: {
          a?: string;
          b?: string;
          leaves?: string[];
        };
        output: string;
        proof_for_leaf_0?: string[];
      }>;
    }
    const vector = loadVector<MerkleVector>("merkle.json");
    for (const c of vector.cases) {
      if (c.input.a && c.input.b) {
        const pairHash = hashPair(
          Buffer.from(c.input.a, "hex"),
          Buffer.from(c.input.b, "hex"),
        ).toString("hex");
        expect(pairHash, c.name).toBe(c.output);
      } else if (c.input.leaves) {
        const tree = buildTree(c.input.leaves);
        expect(tree.root, `${c.name} root`).toBe(c.output);
        if (c.proof_for_leaf_0) {
          const proof = tree.proofs.get(c.input.leaves[0]!)!;
          expect(proof, `${c.name} proof`).toEqual(c.proof_for_leaf_0);
          expect(verifyProof(c.input.leaves[0]!, proof, tree.root)).toBe(true);
        }
      }
    }
  });
});
