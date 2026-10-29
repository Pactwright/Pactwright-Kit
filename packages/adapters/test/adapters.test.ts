import { describe, it, expect, vi } from "vitest";
import { Keypair } from "@pactwright/core";
import { Address, hash, xdr } from "@stellar/stellar-base";
import { signEnvelope, type UnsignedEnvelope } from "@witness/core";
import {
  DiscoveryBazaar,
  ReputationIdentity,
  GateManual,
  WalletKeypair,
  VerifierWitness,
  type SellerListing,
  type PactTerms,
} from "../src/index.ts";

const sampleListings: SellerListing[] = [
  {
    resourceUrl: "https://seller1.test/api/translate",
    seller: "GA7QYNF7SOWQ3GLR2BGMZEHXAVIRZA4KVWLTJJFC7MGXUA74P7UJVTOO",
    mode: "exact-refund",
    price: "0.25",
    verifier: "1".repeat(64),
    refundWindowLedgers: 17280,
    refundFloat: "100.00",
  },
  {
    resourceUrl: "https://seller2.test/api/ocr",
    seller: "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5",
    mode: "escrow",
    price: "1.00",
    verifier: "2".repeat(64),
    silence: "refund",
    refundWindowLedgers: 17280,
  },
  {
    resourceUrl: "https://seller3.test/api/translate-pro",
    seller: "GCATS5YOVB6ROX2WUNKGNQ2MP3GMXDMKSG2O4N5CLX3A6W4PZGZZI55U",
    mode: "escrow",
    price: "5.00",
    verifier: "3".repeat(64),
    silence: "pay",
    refundWindowLedgers: 8640,
  },
];

describe("DiscoveryBazaar", () => {
  it("filters listings by query text", async () => {
    const discovery = new DiscoveryBazaar({ listings: sampleListings });
    const results = await discovery.search({ query: "translate" });
    expect(results).toHaveLength(2);
    expect(results[0]?.resourceUrl).toContain("translate");
    expect(results[1]?.resourceUrl).toContain("translate-pro");
  });

  it("filters listings by maxPrice and modes", async () => {
    const discovery = new DiscoveryBazaar({ listings: sampleListings });
    const results = await discovery.search({
      query: "",
      maxPrice: "1.00",
      modes: ["escrow"],
    });
    expect(results).toHaveLength(1);
    expect(results[0]?.resourceUrl).toBe("https://seller2.test/api/ocr");
  });

  it("fetches catalog from remote Bazaar URL", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () =>
      new Response(JSON.stringify({ listings: sampleListings }), { status: 200 }),
    );
    const discovery = new DiscoveryBazaar({
      bazaarUrl: "https://mock.bazaar.io",
      fetchImpl,
    });
    const results = await discovery.search({ query: "ocr" });
    expect(fetchImpl).toHaveBeenCalledOnce();
    expect(results).toHaveLength(1);
    expect(results[0]?.seller).toBe("GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5");
  });
});

describe("ReputationIdentity", () => {
  it("ranks listings without changing ordering (identity baseline)", async () => {
    const reputation = new ReputationIdentity();
    const ranked = await reputation.rank(sampleListings);
    expect(ranked).toHaveLength(3);
    expect(ranked[0]?.score).toBe(1.0);
    expect(ranked[0]?.explanation).toContain("identity");
    expect(ranked[0]?.resourceUrl).toBe(sampleListings[0]?.resourceUrl);
    expect(ranked[1]?.resourceUrl).toBe(sampleListings[1]?.resourceUrl);
  });
});

describe("GateManual", () => {
  it("approves budget within maxAutoApproveAmount", async () => {
    const gate = new GateManual({ maxAutoApproveAmount: "10.00" });
    const res = await gate.approveBudget({
      agent: "GA7QYNF7SOWQ3GLR2BGMZEHXAVIRZA4KVWLTJJFC7MGXUA74P7UJVTOO",
      amount: "5.00",
      asset: "USDC",
    });
    expect(res.approved).toBe(true);
    expect(res.fundingTx).toBeDefined();
  });

  it("rejects budget exceeding maxAutoApproveAmount", async () => {
    const gate = new GateManual({ maxAutoApproveAmount: "10.00" });
    const res = await gate.approveBudget({
      agent: "GA7QYNF7SOWQ3GLR2BGMZEHXAVIRZA4KVWLTJJFC7MGXUA74P7UJVTOO",
      amount: "15.00",
      asset: "USDC",
    });
    expect(res.approved).toBe(false);
  });

  it("delegates to custom promptHandler", async () => {
    const promptHandler = vi.fn(async () => false);
    const gate = new GateManual({ promptHandler });
    const res = await gate.approveBudget({
      agent: "GA7QYNF7SOWQ3GLR2BGMZEHXAVIRZA4KVWLTJJFC7MGXUA74P7UJVTOO",
      amount: "1.00",
      asset: "USDC",
    });
    expect(promptHandler).toHaveBeenCalledOnce();
    expect(res.approved).toBe(false);
  });
});

describe("WalletKeypair", () => {
  it("generates random address or initializes from seed", () => {
    const wallet1 = new WalletKeypair();
    expect(wallet1.address()).toMatch(/^G[A-Z2-7]{55}$/);

    const seed = "05".repeat(32);
    const wallet2 = new WalletKeypair(seed);
    const expected = Keypair.fromRawEd25519Seed(Buffer.from(seed, "hex")).publicKey();
    expect(wallet2.address()).toBe(expected);
  });

  it("signs a Soroban authorization preimage the way the network verifies it (SEP-43)", async () => {
    const wallet = new WalletKeypair("05".repeat(32));
    const preimage = xdr.HashIdPreimage.envelopeTypeSorobanAuthorization(
      new xdr.HashIdPreimageSorobanAuthorization({
        networkId: hash(Buffer.from("Test SDF Network ; September 2015")),
        nonce: xdr.Int64.fromString("7"),
        signatureExpirationLedger: 100,
        invocation: new xdr.SorobanAuthorizedInvocation({
          function: xdr.SorobanAuthorizedFunction.sorobanAuthorizedFunctionTypeContractFn(
            new xdr.InvokeContractArgs({
              contractAddress: Address.fromString("CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA").toScAddress(),
              functionName: "transfer",
              args: [],
            }),
          ),
          subInvocations: [],
        }),
      }),
    );
    const signature = await wallet.signAuthEntry(preimage.toXDR("base64"));
    expect(wallet.getKeypair().verify(hash(preimage.toXDR()), Buffer.from(signature, "base64"))).toBe(true);
  });

  it("refuses to sign anything that isn't a Soroban authorization preimage", async () => {
    const wallet = new WalletKeypair("05".repeat(32));
    await expect(wallet.signAuthEntry("sample_auth_payload")).rejects.toThrow(/preimage/);
  });

});

describe("VerifierWitness", () => {
  const verifierKeypair = Keypair.random();
  const mockTerms: PactTerms = {
    pactId: "01".repeat(32),
    mode: "escrow",
    buyer: "GA7QYNF7SOWQ3GLR2BGMZEHXAVIRZA4KVWLTJJFC7MGXUA74P7UJVTOO",
    seller: "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5",
    resourceUrl: "https://seller.test/api/translate",
    cap: "1.00",
    nonce: "1",
    conditionHash: "02".repeat(32),
    condition: { type: "exact" },
    verifier: "04".repeat(32),
    metered: false,
    verdictDeadline: 120,
    settleDeadline: 720,
    refundWindowLedgers: 17280,
  };

  it("requests verdict over HTTP", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () =>
      new Response(
        JSON.stringify({
          verdict: "allow",
          amount: "1.00",
          envelopeRef: "envelope_abc_123",
        }),
        { status: 200 },
      ),
    );

    const verifier = new VerifierWitness({
      verifierUrl: "https://mock.verifier.io",
      fetchImpl,
    });

    const output = await verifier.requestVerdict({
      terms: mockTerms,
      evidence: [{ uri: "https://blob.test/doc.pdf", sha256: "03".repeat(32), mimeType: "application/pdf" }],
      deliveryReceipt: "sha256=xxx; sig=yyy",
    });

    expect(fetchImpl).toHaveBeenCalledOnce();
    expect(output.verdict).toBe("ALLOW");
    expect(output.amount).toBe("1.00");
    expect(output.envelopeRef).toBe("envelope_abc_123");
  });

  it("fetches and verifies envelope authenticity", async () => {
    const unsigned: UnsignedEnvelope = {
      agreementId: "pact_01",
      milestoneId: "m_final",
      verifier: verifierKeypair.publicKey(),
      verifierType: "model_evaluator",
      criteria: [
        {
          id: "crit_1",
          verifier: verifierKeypair.publicKey(),
          result: "PASS",
          code: "OK",
          reason: "Translation meets criteria",
          mandatory: true,
        },
      ],
      evidence: [],
      verdict: {
        decision: "ALLOW",
        reasons: ["OK"],
        policyVersion: "1",
      },
      timestamp: new Date().toISOString(),
      conditionHash: "0a".repeat(32),
    };

    const envelope = signEnvelope(unsigned, verifierKeypair);

    const fetchImpl = vi.fn<typeof fetch>(async () =>
      new Response(JSON.stringify(envelope), { status: 200 }),
    );

    const verifier = new VerifierWitness({
      verifierUrl: "https://mock.verifier.io",
      fetchImpl,
    });

    const isValid = await verifier.verifyEnvelope("sample_ref");
    expect(isValid).toBe(true);
  });
});
