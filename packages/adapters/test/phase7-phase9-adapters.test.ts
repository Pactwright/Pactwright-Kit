import { describe, it, expect } from "vitest";
import { Keypair } from "@stellar/stellar-base";
import {
  GateVespi,
  WalletPollar,
  ReputationBookerBob,
  computeWeightedReputation,
  type SellerListing,
  type PactHistoryRecord,
} from "../src/index.ts";

describe("GateVespi (P7-12, FR-A4)", () => {
  it("approves budget when below configured auto-approve limit", async () => {
    const gate = new GateVespi({ autoApproveBelow: "10.00" });
    const res = await gate.approveBudget({
      agent: Keypair.random().publicKey(),
      amount: "5.00",
      asset: "USDC",
    });

    expect(res.approved).toBe(true);
    expect(res.fundingTx).toBeDefined();
  });

  it("calls Vespi API endpoint and parses response", async () => {
    const mockFetch: typeof fetch = async () => {
      return new Response(JSON.stringify({ approved: true, funding_tx: "tx_vespi_123" }), { status: 200 });
    };

    const gate = new GateVespi({
      vespiApiUrl: "https://mock-vespi.local",
      apiKey: "test-token",
      fetchImpl: mockFetch,
    });

    const res = await gate.approveBudget({
      agent: Keypair.random().publicKey(),
      amount: "25.00",
      asset: "USDC",
    });

    expect(res.approved).toBe(true);
    expect(res.fundingTx).toBe("tx_vespi_123");
  });
});

describe("WalletPollar (P7-13, FR-A4, Q1)", () => {
  const principalKey = Keypair.random();
  const agentKey = Keypair.random();

  it("provides agent address and signs authorization entry via session", async () => {
    const wallet = new WalletPollar({
      principalAddress: principalKey.publicKey(),
      agentAddress: agentKey.publicKey(),
      sessionId: "session_abc",
    });

    expect(wallet.address()).toBe(agentKey.publicKey());
    expect(wallet.getPrincipalAddress()).toBe(principalKey.publicKey());

    const entry = "AAAA...testAuthEntry";
    const signed = await wallet.signAuthEntry(entry);
    expect(signed).toBeDefined();
  });
});

describe("ReputationBookerBob (P9-01, FR-D3, Q2)", () => {
  it("ranks seller listings by proven customer score", async () => {
    const sellerA = Keypair.random().publicKey();
    const sellerB = Keypair.random().publicKey();

    const mockFetch: typeof fetch = async () => {
      return new Response(
        JSON.stringify({
          scores: {
            [sellerA]: { score: 95, reviews: 30 },
            [sellerB]: { score: 72, reviews: 5 },
          },
        }),
        { status: 200 },
      );
    };

    const bookerBob = new ReputationBookerBob({
      bookerBobApiUrl: "https://mock-bb.local",
      fetchImpl: mockFetch,
    });

    const listings: SellerListing[] = [
      {
        resourceUrl: "https://b.example/api",
        seller: sellerB,
        mode: "escrow",
        price: "1.00",
        verifier: Keypair.random().publicKey(),
        refundWindowLedgers: 100,
      },
      {
        resourceUrl: "https://a.example/api",
        seller: sellerA,
        mode: "escrow",
        price: "1.00",
        verifier: Keypair.random().publicKey(),
        refundWindowLedgers: 100,
      },
    ];

    const ranked = await bookerBob.rank(listings);
    expect(ranked[0]?.seller).toBe(sellerA);
    expect(ranked[0]?.score).toBe(95);
    expect(ranked[1]?.seller).toBe(sellerB);
    expect(ranked[1]?.score).toBe(72);
  });
});

describe("Reputation Weighting (P9-03, FR-D3, B9)", () => {
  const seller = Keypair.random().publicKey();

  it("ranks authentic multi-buyer seller much higher than wash-trading seller", () => {
    // Authentic seller: 10 different buyers
    const authenticHistory: PactHistoryRecord[] = Array.from({ length: 10 }, (_, i) => ({
      pactId: `${i}`.repeat(64).slice(0, 64),
      seller,
      buyer: Keypair.random().publicKey(),
      amount: "10.00",
      ledgerSeq: 50_000 + i * 100,
      verdict: "allow",
    }));

    // Wash trader: same buyer 10 times + self dealing
    const washBuyer = Keypair.random().publicKey();
    const washHistory: PactHistoryRecord[] = [
      ...Array.from({ length: 9 }, (_, i) => ({
        pactId: `w${i}`.repeat(64).slice(0, 64),
        seller,
        buyer: washBuyer,
        amount: "10.00",
        ledgerSeq: 50_000 + i * 100,
        verdict: "allow" as const,
      })),
      {
        pactId: "self".repeat(16),
        seller,
        buyer: seller, // self-dealing
        amount: "100.00",
        ledgerSeq: 51_000,
        verdict: "allow" as const,
      },
    ];

    const authenticRes = computeWeightedReputation(seller, authenticHistory, 100_000);
    const washRes = computeWeightedReputation(seller, washHistory, 100_000);

    expect(authenticRes.score).toBeGreaterThan(70);
    expect(washRes.score).toBeLessThan(authenticRes.score);
    expect(washRes.selfDealingExcluded).toBe(1);
    expect(washRes.uniqueBuyers).toBe(1);
  });
});
