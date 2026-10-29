import { describe, expect, it, vi } from "vitest";
import { Keypair } from "@stellar/stellar-base";
import { buildTree, type NetworkConfig, type PactTerms } from "@pactwright/core";
import { encodePaymentRequiredHeader, encodePaymentResponseHeader } from "@x402/core/http";
import {
  DiscoveryBazaar,
  GateManual,
  ReputationIdentity,
  VerifierWitness,
  WalletKeypair,
} from "@pactwright/adapters";
import {
  createPactwright,
  createAgentAccount,
  topUp,
  getCertificate,
  deriveNonce,
  type Pact,
  type PactwrightConfig,
  type PaymentProvider,
  type PaymentRequest,
} from "../src/index.ts";

const VALID_ADDRESS_1 = "GA7QYNF7SOWQ3GLR2BGMZEHXAVIRZA4KVWLTJJFC7MGXUA74P7UJVTOO";
const VALID_ADDRESS_2 = "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5";

const mockNetwork: NetworkConfig = {
  network: "testnet",
  passphrase: "Test SDF Network ; September 2015",
  rpcUrl: "https://soroban-testnet.stellar.org",
  usdcSac: "CABQGAYDAMBQGAYDAMBQGAYDAMBQGAYDAMBQGAYDAMBQGAYDAMBQGTV3",
  receiptAnchor: "CABQGAYDAMBQGAYDAMBQGAYDAMBQGAYDAMBQGAYDAMBQGAYDAMBQGTV3",
  facilitatorUrl: "https://facilitator.pactwright.dev",
};

describe("Pactwright Agent Runtime", () => {
  const buyerWallet = new WalletKeypair();
  const discovery = new DiscoveryBazaar({
    listings: [
      {
        resourceUrl: "https://seller.test/translate",
        seller: VALID_ADDRESS_2,
        mode: "exact-refund",
        price: "1.00",
        verifier: "02".repeat(32),
        refundWindowLedgers: 17280,
      },
      {
        resourceUrl: "https://seller.test/escrow-translate",
        seller: VALID_ADDRESS_2,
        mode: "escrow",
        price: "2.50",
        verifier: "02".repeat(32),
        refundWindowLedgers: 17280,
      },
    ],
  });
  const reputation = new ReputationIdentity();
  const gate = new GateManual({ maxAutoApproveAmount: "10.00" });
  const verifier = new VerifierWitness({
    fetchImpl: vi.fn(async () =>
      new Response(
        JSON.stringify({
          verdict: "ALLOW",
          amount: "1.00",
          envelopeRef: "env_test_123",
        }),
        { status: 200 },
      ),
    ),
  });

  // Test payment provider: records what it was asked to pay. The default (`x402Payment`) signs a
  // real x402 payment; e2e/testnet exercises it on-chain.
  const payments: PaymentRequest[] = [];
  const payment: PaymentProvider = {
    async pay(request) {
      payments.push(request);
      return { headers: { "PAYMENT-SIGNATURE": `paid:${request.requirement.scheme}:${request.pactId}` } };
    },
  };

  const pw = createPactwright({
    network: mockNetwork,
    wallet: buyerWallet,
    verifierUrl: "https://verifier.test",
    payment,
    adapters: {
      discovery,
      reputation,
      gate,
      verifier,
    },
  });

  it("finds and ranks listings", async () => {
    const results = await pw.find({ query: "translate" });
    expect(results).toHaveLength(2);
    expect(results[0]?.score).toBe(1.0);
    expect(results[0]?.resourceUrl).toBe("https://seller.test/translate");
  });

  it("derives deterministic nonces from idempotency keys", () => {
    const key = "agent_request_123";
    const nonce1 = deriveNonce(key);
    const nonce2 = deriveNonce(key);
    expect(nonce1).toBe(nonce2);
    expect(typeof nonce1).toBe("bigint");
  });

  /**
   * A seller that speaks x402: 402 with its terms until it sees a payment, then the content with
   * a delivery receipt and the settlement in PAYMENT-RESPONSE.
   */
  function seller(opts: { scheme: "exact" | "pact"; amount: string; condition: Record<string, unknown>; payTo?: string; afterPay?: Response }) {
    const seen: Array<Record<string, string>> = [];
    const required = {
      x402Version: 2,
      resource: { url: "https://seller.test/x", description: "", mimeType: "" },
      accepts: [
        {
          scheme: opts.scheme,
          network: "stellar:testnet",
          asset: "CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA",
          amount: opts.amount,
          payTo: opts.payTo ?? VALID_ADDRESS_2,
          maxTimeoutSeconds: 60,
          extra: { areFeesSponsored: true, pactwright: { condition: opts.condition } },
        },
      ],
    };
    const fetchImpl = vi.fn<typeof fetch>(async (_url, init) => {
      const headers = (init?.headers ?? {}) as Record<string, string>;
      seen.push(headers);
      if (!headers["PAYMENT-SIGNATURE"]) {
        return new Response(JSON.stringify(required), {
          status: 402,
          headers: { "PAYMENT-REQUIRED": encodePaymentRequiredHeader(required as never) },
        });
      }
      return (
        opts.afterPay ??
        new Response("Translated text result", {
          status: 200,
          headers: {
            "X-Pactwright-Delivery": "sha256=abcdef; sig=123456",
            "PAYMENT-RESPONSE": encodePaymentResponseHeader({ success: true, transaction: "ef".repeat(32), network: "stellar:testnet" }),
          },
        })
      );
    });
    return { fetchImpl, seen };
  }

  it("M0: reads the 402, pays the exact scheme, and returns body, receipt and settled tx", async () => {
    const condition = { kind: "document.translation", lang: "es" };
    const s = seller({ scheme: "exact", amount: "10000000", condition });
    const listing = (await pw.find({ query: "translate" }))[0]!;
    const pact = await pw.buy(listing, { condition, idempotencyKey: "idem_key_m0", fetchImpl: s.fetchImpl });

    expect(pact.terms.mode).toBe("exact-refund");
    expect(pact.deliveryReceipt).toBe("sha256=abcdef; sig=123456");
    expect(pact.paymentTx).toBe("ef".repeat(32));
    expect(Buffer.from(pact.body).toString("utf8")).toBe("Translated text result");
    expect(s.seen).toHaveLength(2);
    expect(s.seen[1]!["PAYMENT-SIGNATURE"]).toBe(`paid:exact:${pact.terms.pactId}`);
    expect(s.seen[1]!["X-Pactwright-Nonce"]).toBe(pact.terms.nonce);
  });

  it("M2: pays the pact scheme", async () => {
    const condition = { kind: "document.translation", lang: "fr" };
    const s = seller({ scheme: "pact", amount: "25000000", condition });
    const m2Listing = (await pw.find({ query: "translate" })).find((l) => l.mode === "escrow")!;
    const pact = await pw.buy(m2Listing, { condition, idempotencyKey: "idem_key_m2", fetchImpl: s.fetchImpl });
    expect(pact.terms.mode).toBe("escrow");
    expect(payments.at(-1)).toMatchObject({ mode: "escrow", amount: "2.50", pactId: pact.terms.pactId });
    expect(payments.at(-1)!.requirement.scheme).toBe("pact");
  });

  it("the same idempotency key gives the same pact id and nonce", async () => {
    const condition = { kind: "document.translation", lang: "es" };
    const listing = (await pw.find({ query: "translate" }))[0]!;
    const a = await pw.buy(listing, { condition, idempotencyKey: "repeatable_key", fetchImpl: seller({ scheme: "exact", amount: "10000000", condition }).fetchImpl });
    const b = await pw.buy(listing, { condition, idempotencyKey: "repeatable_key", fetchImpl: seller({ scheme: "exact", amount: "10000000", condition }).fetchImpl });
    expect(a.terms.pactId).toBe(b.terms.pactId);
    expect(a.terms.nonce).toBe(b.terms.nonce);
  });

  it("refuses to pay for a different condition, payee or a higher price than agreed", async () => {
    const condition = { kind: "document.translation", lang: "es" };
    const listing = (await pw.find({ query: "translate" }))[0]!;
    const cases = [
      seller({ scheme: "exact", amount: "10000000", condition: { ...condition, lang: "de" } }),
      seller({ scheme: "exact", amount: "10000000", condition, payTo: VALID_ADDRESS_1 }),
      seller({ scheme: "exact", amount: "10000001", condition }),
      seller({ scheme: "pact", amount: "10000000", condition }),
    ];
    for (const s of cases) {
      await expect(pw.buy(listing, { condition, idempotencyKey: "guarded", fetchImpl: s.fetchImpl })).rejects.toThrow();
      expect(s.seen).toHaveLength(1); // asked once, never paid
    }
  });

  it("expects a 402 before paying", async () => {
    const listing = (await pw.find({ query: "translate" }))[0]!;
    const free = vi.fn<typeof fetch>(async () => new Response("free", { status: 200 }));
    await expect(pw.buy(listing, { condition: {}, idempotencyKey: "free", fetchImpl: free })).rejects.toThrow(/402/);
  });

  it("throws error when gate rejects budget", async () => {
    const strictGate = new GateManual({ maxAutoApproveAmount: "0.50" });
    const pwStrict = createPactwright({
      network: mockNetwork,
      wallet: buyerWallet,
      verifierUrl: "https://verifier.test",
      adapters: { discovery, reputation, gate: strictGate, verifier },
    });

    const listings = await pwStrict.find({ query: "translate" });
    await expect(
      pwStrict.buy(listings[0]!, {
        condition: {},
        idempotencyKey: "strict_gate_test",
      }),
    ).rejects.toThrow("Budget approval rejected by gate");
  });

  it("throws when the seller refuses an already-served pact (409)", async () => {
    const condition = { kind: "document.translation", lang: "es" };
    const s = seller({
      scheme: "exact",
      amount: "10000000",
      condition,
      afterPay: new Response(JSON.stringify({ error: "Pact is terminal" }), { status: 409 }),
    });
    const listing = (await pw.find({ query: "translate" }))[0]!;
    await expect(pw.buy(listing, { condition, idempotencyKey: "terminal_test", fetchImpl: s.fetchImpl })).rejects.toThrow("Pact is terminal");
  });

  describe("awaitPact()", () => {
    const sampleTerms: PactTerms = {
      pactId: "01".repeat(32),
      mode: "exact-refund",
      buyer: VALID_ADDRESS_1,
      seller: VALID_ADDRESS_2,
      resourceUrl: "https://seller.test",
      cap: "1.00",
      nonce: "1",
      conditionHash: "02".repeat(32),
      condition: {},
      verifier: "03".repeat(32),
      metered: false,
      refundWindowLedgers: 17280,
    };

    const samplePact: Pact = {
      terms: sampleTerms,
      body: new Uint8Array([1, 2, 3]),
      paymentTx: "tx_sample",
      deliveryReceipt: "sha256=111; sig=222",
    };

    it("returns 'allowed' when until is 'verdict' and verdict is ALLOW", async () => {
      const state = await pw.await(samplePact, {
        until: "verdict",
      });
      expect(state).toBe("allowed");
    });

    it("returns 'settled' for M0 ALLOW and 'refunded' for M0 DENY", async () => {
      const stateAllow = await pw.await(samplePact, { until: "terminal" });
      expect(stateAllow).toBe("settled");

      const denyVerifier = new VerifierWitness({
        fetchImpl: vi.fn(async () =>
          new Response(JSON.stringify({ verdict: "DENY", amount: "0", envelopeRef: "verdict-v1 sha256=" + "ab".repeat(32) }), { status: 200 }),
        ),
      });
      const pwDeny = createPactwright({
        network: mockNetwork,
        wallet: buyerWallet,
        verifierUrl: "https://verifier.test",
        adapters: { discovery, reputation, gate, verifier: denyVerifier },
      });

      const stateDeny = await pwDeny.await(samplePact, { until: "terminal" });
      expect(stateDeny).toBe("refunded");
    });

    it("returns 'settled' for M2 ALLOW and 'released' for M2 DENY", async () => {
      const m2Pact: Pact = {
        ...samplePact,
        terms: { ...sampleTerms, mode: "escrow" },
      };

      const stateAllow = await pw.await(m2Pact, { until: "terminal" });
      expect(stateAllow).toBe("settled");

      const denyVerifier = new VerifierWitness({
        fetchImpl: vi.fn(async () =>
          new Response(JSON.stringify({ verdict: "DENY", amount: "0", envelopeRef: "verdict-v1 sha256=" + "ab".repeat(32) }), { status: 200 }),
        ),
      });
      const pwDeny = createPactwright({
        network: mockNetwork,
        wallet: buyerWallet,
        verifierUrl: "https://verifier.test",
        adapters: { discovery, reputation, gate, verifier: denyVerifier },
      });

      const stateDeny = await pwDeny.await(m2Pact, { until: "terminal" });
      expect(stateDeny).toBe("released");
    });
  });

  describe("getCertificate()", () => {
    it("verifies anchored certificate proof offline", async () => {
      const leaves = ["0a".repeat(32), "0b".repeat(32), "0c".repeat(32)];
      const tree = buildTree(leaves);
      const leaf0 = leaves[0]!;
      const proof0 = tree.proofs.get(leaf0)!;

      const cert = await getCertificate(
        { facilitatorUrl: "https://mock.test" } as unknown as PactwrightConfig,
        "01".repeat(32),
        {
          certificateData: {
            pactId: "01".repeat(32),
            transition: "settled",
            toSeller: "1.00",
            toBuyer: "0",
            leaf: leaf0,
            status: "anchored",
            proof: proof0,
            root: tree.root,
            receiptAnchor: "CABQGAYDAMBQGAYDAMBQGAYDAMBQGAYDAMBQGAYDAMBQGAYDAMBQGTV3",
            txs: [{ stage: "settled", hash: "tx_abc" }],
          },
        },
      );

      expect(cert.status).toBe("anchored");
      expect(cert.leaf).toBe(leaf0);
    });

    it("rejects anchored certificate with invalid proof", async () => {
      const leaves = ["0a".repeat(32), "0b".repeat(32)];
      const tree = buildTree(leaves);

      await expect(
        getCertificate(
          { facilitatorUrl: "https://mock.test" } as unknown as PactwrightConfig,
          "01".repeat(32),
          {
            certificateData: {
              pactId: "01".repeat(32),
              transition: "settled",
              toSeller: "1.00",
              toBuyer: "0",
              leaf: leaves[0]!,
              status: "anchored",
              proof: ["ff".repeat(32)], // invalid proof
              root: tree.root,
              receiptAnchor: "CABQGAYDAMBQGAYDAMBQGAYDAMBQGAYDAMBQGAYDAMBQGAYDAMBQGTV3",
              txs: [],
            },
          },
        ),
      ).rejects.toThrow("Certificate Merkle proof verification failed");
    });
  });

  describe("createAgentAccount() & topUp()", () => {
    const sponsor = Keypair.random();
    const funder = Keypair.random();

    it("creates account with sponsored reserves and 0 XLM balance", async () => {
      const submitted: string[] = [];
      const res = await createAgentAccount(sponsor.secret(), {
        sourceAccountSequence: "100",
        submitTx: async (xdr) => {
          submitted.push(xdr);
          return "aa".repeat(32);
        },
      });
      expect(submitted).toHaveLength(1);

      expect(res.address).toMatch(/^G[A-Z2-7]{55}$/);
      expect(res.tx).toMatch(/^[0-9a-f]{64}$/);
      expect(res.agentSecret).toMatch(/^S[A-Z2-7]{55}$/);
    });

    it("tops up agent budget with USDC payment", async () => {
      const agentAddress = Keypair.random().publicKey();
      const txHash = await topUp(agentAddress, "50.00", funder.secret(), {
        sourceAccountSequence: "200",
        submitTx: async () => "bb".repeat(32),
      });

      expect(txHash).toBe("bb".repeat(32));
    });

    it("refuses to return a hash for a transaction it did not submit", async () => {
      await expect(createAgentAccount(sponsor.secret(), { sourceAccountSequence: "100" })).rejects.toThrow(/not submitted/);
    });
  });
});
