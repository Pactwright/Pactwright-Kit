import { describe, expect, it, vi } from "vitest";
import { Keypair } from "@stellar/stellar-base";
import { buildTree, type NetworkConfig, type PactTerms } from "@pactwright/core";
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

  // Test payment provider: records what it was asked to pay. Real providers sign an x402 payment.
  const payments: PaymentRequest[] = [];
  const payment: PaymentProvider = {
    async pay(request) {
      payments.push(request);
      const scheme = request.mode === "escrow" ? "pact" : "exact";
      return { header: Buffer.from(JSON.stringify({ scheme, pact_id: request.pactId })).toString("base64") };
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

  it("executes M0 buy and captures body and delivery receipt", async () => {
    const mockFetch = vi.fn<typeof fetch>(async () =>
      new Response("Translated text result", {
        status: 200,
        headers: {
          "Content-Type": "text/plain",
          "X-Pactwright-Delivery": "sha256=abcdef; sig=123456",
        },
      }),
    );

    const listings = await pw.find({ query: "translate" });
    const listing = listings[0]!;

    const pact = await pw.buy(listing, {
      condition: { kind: "document.translation", lang: "es" },
      idempotencyKey: "idem_key_m0",
      fetchImpl: mockFetch,
    });

    expect(pact.terms.mode).toBe("exact-refund");
    expect(pact.terms.cap).toBe("1.00");
    expect(pact.deliveryReceipt).toBe("sha256=abcdef; sig=123456");
    expect(Buffer.from(pact.body).toString("utf8")).toBe("Translated text result");
    expect(mockFetch).toHaveBeenCalledOnce();
  });

  it("idempotency retry creates the exact same pactId and nonce", async () => {
    const mockFetch = vi.fn<typeof fetch>(async () =>
      new Response("Same result", { status: 200 }),
    );

    const listings = await pw.find({ query: "translate" });
    const listing = listings[0]!;
    const condition = { kind: "document.translation", lang: "es" };

    const pact1 = await pw.buy(listing, {
      condition,
      idempotencyKey: "repeatable_key",
      fetchImpl: mockFetch,
    });

    const pact2 = await pw.buy(listing, {
      condition,
      idempotencyKey: "repeatable_key",
      fetchImpl: mockFetch,
    });

    expect(pact1.terms.pactId).toBe(pact2.terms.pactId);
    expect(pact1.terms.nonce).toBe(pact2.terms.nonce);
    expect(pact1.terms.conditionHash).toBe(pact2.terms.conditionHash);
  });

  it("executes M2 buy via pact scheme with signed authEntry", async () => {
    let capturedPaymentHeader = "";
    const mockFetch = vi.fn<typeof fetch>(async (_url, init) => {
      capturedPaymentHeader = (init?.headers as Record<string, string>)["X-Payment"] ?? "";
      return new Response("Escrow response", {
        status: 200,
        headers: {
          "X-Pactwright-Delivery": "sha256=fedcba; sig=654321",
        },
      });
    });

    const listings = await pw.find({ query: "translate" });
    const m2Listing = listings.find((l) => l.mode === "escrow")!;

    const pact = await pw.buy(m2Listing, {
      condition: { kind: "document.translation", lang: "fr" },
      idempotencyKey: "idem_key_m2",
      fetchImpl: mockFetch,
    });

    expect(pact.terms.mode).toBe("escrow");
    expect(pact.terms.cap).toBe("2.50");
    expect(capturedPaymentHeader).toBeTruthy();

    const decoded = JSON.parse(Buffer.from(capturedPaymentHeader, "base64").toString("utf8")) as {
      scheme: string;
      pact_id: string;
    };
    expect(decoded.scheme).toBe("pact");
    expect(decoded.pact_id).toBe(pact.terms.pactId);
    expect(payments.at(-1)).toMatchObject({ mode: "escrow", amount: "2.50", pactId: pact.terms.pactId });
  });

  it("refuses to buy without a payment provider instead of inventing a payment", async () => {
    const pwNoPayment = createPactwright({
      network: mockNetwork,
      wallet: buyerWallet,
      verifierUrl: "https://verifier.test",
      adapters: { discovery, reputation, gate, verifier },
    });
    const listings = await pwNoPayment.find({ query: "translate" });
    await expect(
      pwNoPayment.buy(listings[0]!, { condition: {}, idempotencyKey: "no_payment", fetchImpl: vi.fn<typeof fetch>() }),
    ).rejects.toThrow(/payment provider/);
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

  it("throws error when seller refuses terminal pact (409)", async () => {
    const mockFetch = vi.fn<typeof fetch>(async () =>
      new Response(JSON.stringify({ error: "Pact is terminal" }), { status: 409 }),
    );

    const listings = await pw.find({ query: "translate" });
    await expect(
      pw.buy(listings[0]!, {
        condition: {},
        idempotencyKey: "terminal_test",
        fetchImpl: mockFetch,
      }),
    ).rejects.toThrow("Pact is terminal");
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
