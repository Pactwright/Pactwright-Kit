import { describe, expect, it } from "vitest";
import { Keypair } from "@witness/core";
import { conditionHash, pactId, toStroops, type PactTerms } from "@pactwright/core";
import {
  checkTermsAgainstChain,
  deliveryKeyFromDataValue,
  DELIVERY_KEY_DATA_NAME,
  type ChainReader,
  type OnChainPact,
} from "../src/chain-terms.ts";
import { createApp } from "../src/server.ts";
import { MemoryVerdictStore } from "../src/store.ts";

const buyer = Keypair.random();
const seller = Keypair.random();
const sellerHotKey = Keypair.random();
const condition = { kind: "document.translation", lang: "es", minPages: 4, maxUntranslatedSegments: 0 };
const condHash = conditionHash(condition);
const id = pactId(buyer.publicKey(), seller.publicKey(), 7n, condHash);

/** Terms exactly as the pact was opened, delivery key = the seller's account key. */
const honest: PactTerms = {
  pactId: id,
  mode: "escrow",
  buyer: buyer.publicKey(),
  seller: seller.publicKey(),
  resourceUrl: "https://seller.test/translate",
  cap: "1.00",
  nonce: "7",
  conditionHash: condHash,
  condition,
  verifier: "03".repeat(32),
  deliveryKey: seller.rawPublicKey().toString("hex"),
  metered: false,
  refundWindowLedgers: 0,
};

const onChain: OnChainPact = {
  buyer: buyer.publicKey(),
  seller: seller.publicKey(),
  cap: toStroops("1.00"),
  conditionHash: condHash,
  state: 1,
};

function reader(pact: OnChainPact | null = onChain, published: string | null = null): ChainReader & { reads: string[] } {
  const reads: string[] = [];
  return {
    reads,
    async getPact(hex) {
      reads.push(hex);
      return pact;
    },
    async sellerDeliveryKey() {
      return published;
    },
  };
}

describe("checkTermsAgainstChain (ADR-019)", () => {
  it("accepts the pact's own terms with the seller's account key", async () => {
    expect(await checkTermsAgainstChain(honest, "delivery", reader())).toEqual([]);
  });

  it("accepts a delivery key the seller published on its account", async () => {
    const terms = { ...honest, deliveryKey: sellerHotKey.rawPublicKey().toString("hex") };
    const r = reader(onChain, sellerHotKey.rawPublicKey().toString("hex"));
    expect(await checkTermsAgainstChain(terms, "delivery", r)).toEqual([]);
  });

  it("refuses an easier condition sent under the pact's real condition hash", async () => {
    const easier = { ...condition, minPages: 1 };
    const problems = await checkTermsAgainstChain({ ...honest, condition: easier }, "delivery", reader());
    expect(problems).toContain("conditionHash is not the hash of condition");
    expect(problems).toContain("condition does not match the pact's condition_hash on-chain");
  });

  it("refuses an easier condition sent with its own hash under the real pact id", async () => {
    const easier = { ...condition, minPages: 1 };
    const problems = await checkTermsAgainstChain(
      { ...honest, condition: easier, conditionHash: conditionHash(easier) },
      "delivery",
      reader(),
    );
    expect(problems).toContain("pactId is not derived from buyer, seller, nonce and the condition");
    expect(problems).toContain("condition does not match the pact's condition_hash on-chain");
  });

  it("refuses a delivery key the seller never published (a buyer signing its own receipt)", async () => {
    const forged = { ...honest, deliveryKey: buyer.rawPublicKey().toString("hex") };
    const problems = await checkTermsAgainstChain(forged, "delivery", reader(onChain, sellerHotKey.rawPublicKey().toString("hex")));
    expect(problems).toEqual([
      `deliveryKey is neither the seller's account key nor the key in its "${DELIVERY_KEY_DATA_NAME}" account entry`,
    ]);
  });

  it("refuses terms without a delivery key, so no receipt check can fall back to DENY", async () => {
    const { deliveryKey: _dropped, ...noKey } = honest;
    expect(await checkTermsAgainstChain(noKey as PactTerms, "delivery", reader())).toEqual(["deliveryKey is required"]);
  });

  it("refuses a cap, buyer or seller that differs from the chain", async () => {
    const r = reader({ ...onChain, cap: toStroops("5.00"), buyer: Keypair.random().publicKey() });
    const problems = await checkTermsAgainstChain(honest, "delivery", r);
    expect(problems).toEqual(expect.arrayContaining(["cap does not match the pact on-chain", "buyer does not match the pact on-chain"]));
  });

  it("refuses a pact the contract doesn't have, and one that already has its verdict", async () => {
    expect(await checkTermsAgainstChain(honest, "delivery", reader(null))).toContain(
      "no pact with this pactId on the configured pact contract",
    );
    expect(await checkTermsAgainstChain(honest, "delivery", reader({ ...onChain, state: 3 }))).toContain(
      "the pact is no longer waiting for a verdict",
    );
  });

  it("refuses a contract seller, whose delivery key can't be checked", async () => {
    const contractSeller = "CDUXJJUNYFILEYHE3LITANJEKCDFERNAABOSG75OWATFVM776BCMFEV6";
    const problems = await checkTermsAgainstChain({ ...honest, seller: contractSeller }, "delivery", reader());
    expect(problems).toContain("the seller must be a Stellar account (G…) so its delivery key can be checked");
  });

  it("reads no pact for an exact-refund payment but still checks the condition, id and key", async () => {
    const r = reader();
    const m0 = { ...honest, mode: "exact-refund" as const };
    expect(await checkTermsAgainstChain(m0, "delivery", r)).toEqual([]);
    expect(r.reads).toEqual([]);
    const forged = await checkTermsAgainstChain({ ...m0, deliveryKey: buyer.rawPublicKey().toString("hex") }, "delivery", r);
    expect(forged).toHaveLength(1);
  });

  it("parses a published key from 32 raw bytes or 64 hex characters, and nothing else", () => {
    const raw = sellerHotKey.rawPublicKey();
    expect(deliveryKeyFromDataValue(raw)).toBe(raw.toString("hex"));
    expect(deliveryKeyFromDataValue(Buffer.from(raw.toString("hex").toUpperCase()))).toBe(raw.toString("hex"));
    expect(deliveryKeyFromDataValue(Buffer.from("not a key"))).toBeNull();
  });
});

describe("POST /v1/verdicts checks terms before anything is judged or signed", () => {
  const evidence = [
    { type: "document", uri: "https://e.test/a", sha256: "a".repeat(64), mimeType: "text/plain", uploader: buyer.publicKey(), createdAt: "2026-11-08T00:00:00.000Z" },
  ];
  const post = (app: ReturnType<typeof createApp>) =>
    app.request("/v1/verdicts", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ terms: honest, evidence }) });

  it("answers 422 with the reasons and never runs the pipeline", async () => {
    let ran = false;
    const app = createApp({
      verifierKey: Keypair.random(),
      store: new MemoryVerdictStore(),
      checkTerms: async () => ["cap does not match the pact on-chain"],
      pipeline: async () => {
        ran = true;
        throw new Error("must not run");
      },
    });
    const res = await post(app);
    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({ error: "terms_mismatch", problems: ["cap does not match the pact on-chain"] });
    expect(ran).toBe(false);
  });

  it("answers 503 and signs nothing when the chain can't be read", async () => {
    let ran = false;
    const app = createApp({
      verifierKey: Keypair.random(),
      store: new MemoryVerdictStore(),
      checkTerms: async () => {
        throw new Error("rpc unreachable");
      },
      pipeline: async () => {
        ran = true;
        throw new Error("must not run");
      },
    });
    const res = await post(app);
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "chain_unavailable" });
    expect(ran).toBe(false);
  });
});
