import { describe, it, expect, vi, beforeEach } from "vitest";
import { Keypair } from "@pactwright/core";
import {
  signDelivery,
  parseDeliveryHeader,
  runStartupChecks,
  handleAutoSettle,
  handleM0Refund,
  calculateRefundAmount,
  clearRefundedRefs,
  type RefundCall,
} from "../src/index.ts";

const SELLER_ADDR = Keypair.fromRawEd25519Seed(Buffer.from("05".repeat(32), "hex")).publicKey();
const VALID_CONTRACT = "CABQGAYDAMBQGAYDAMBQGAYDAMBQGAYDAMBQGAYDAMBQGAYDAMBQGTV3";

describe("Seller: Delivery Receipt Signing", () => {
  it("matches delivery_receipt.json vector byte-for-byte", () => {
    const pactId = "0101010101010101010101010101010101010101010101010101010101010101";
    const bodyUtf8 = '{"translated":"ola mundo"}';
    const signerSeed = "05".repeat(32);
    const expectedSigHex =
      "abc0c72a5e6af031e57c3828cae56eaf657930472fec9dfe8215591a82bd10679f585de3a6f99909a87d021a6eb01e27faf2971a2948574e6d1d73c9947df907";
    const expectedBodySha256 = "cc4fa00fc26978ebd5053f023a926665d39f7482ca72e7ea4f44ec797ad633ca";

    const header = signDelivery(pactId, Buffer.from(bodyUtf8, "utf8"), signerSeed);
    const parsed = parseDeliveryHeader(header);
    expect(parsed).not.toBeNull();
    expect(parsed!.bodySha256).toBe(expectedBodySha256);
    expect(Buffer.from(parsed!.signature, "base64").toString("hex")).toBe(expectedSigHex);
  });
});

describe("Seller: Startup Checks", () => {
  const completeEnv: NodeJS.ProcessEnv = {
    STELLAR_NETWORK: "testnet",
    STELLAR_NETWORK_PASSPHRASE: "Test SDF Network ; September 2015",
    STELLAR_RPC_URL: "https://soroban-testnet.stellar.org",
    USDC_SAC_ID: VALID_CONTRACT,
    RECEIPT_ANCHOR_ID: VALID_CONTRACT,
    FACILITATOR_URL: "https://facilitator.pactwright.dev",
    SELLER_DELIVERY_KEY: "05".repeat(32),
    SELLER_ADDRESS: SELLER_ADDR,
  };

  it("fails if SELLER_DELIVERY_KEY is missing", async () => {
    const env = { ...completeEnv, SELLER_DELIVERY_KEY: "" };
    await expect(runStartupChecks({ env })).rejects.toThrow("SELLER_DELIVERY_KEY is missing or invalid");
  });

  it("fails if SELLER_ADDRESS is missing", async () => {
    const env = { ...completeEnv, SELLER_ADDRESS: "" };
    await expect(runStartupChecks({ env })).rejects.toThrow("SELLER_ADDRESS (or SELLER_SIGNING_KEY_REF) is not set");
  });

  it("fails if network config is incomplete", async () => {
    const env = { ...completeEnv, STELLAR_NETWORK_PASSPHRASE: "" };
    await expect(runStartupChecks({ env })).rejects.toThrow("invalid network configuration");
  });

  it("passes when account has a USDC trustline", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () =>
      new Response(
        JSON.stringify({
          balances: [{ asset_type: "credit_alphanum4", asset_code: "USDC" }],
        }),
        { status: 200 },
      ),
    );

    await expect(runStartupChecks({ env: completeEnv, fetchImpl })).resolves.toBeUndefined();
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it("fails when account lacks a USDC trustline", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () =>
      new Response(
        JSON.stringify({
          balances: [{ asset_type: "native" }],
        }),
        { status: 200 },
      ),
    );

    await expect(runStartupChecks({ env: completeEnv, fetchImpl })).rejects.toThrow(
      "does not have a USDC trustline",
    );
  });
});

describe("Seller Hooks: Settle and Refund", () => {
  beforeEach(() => {
    clearRefundedRefs();
  });

  const facilitator = {
    facilitatorUrl: "https://facilitator.example",
    network: "stellar:testnet" as const,
    rpcUrl: "https://rpc.example",
  };

  it("refuses to settle through the facilitator without the seller's own signer", async () => {
    await expect(
      handleAutoSettle(
        { pactId: "01".repeat(32), verdict: "allow", allowedAmount: "1.00" },
        { facilitator, pactContractId: "CDUXJJUNYFILEYHE3LITANJEKCDFERNAABOSG75OWATFVM776BCMFEV6" },
      ),
    ).rejects.toThrow(/signer/);
  });

  it("does not settle on DENY verdict", async () => {
    const result = await handleAutoSettle({ pactId: "01".repeat(32), verdict: "deny" }, { facilitator });
    expect(result.settled).toBe(false);
  });

  it("calculates refund amount accurately", () => {
    expect(calculateRefundAmount("1.00")).toBe("1");
    expect(calculateRefundAmount("1.00", "0.25")).toBe("0.75");
    expect(calculateRefundAmount("1.00", "1.00")).toBe("0");
    expect(calculateRefundAmount("0.25", "0.30")).toBe("0");
  });

  const vault = "CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA";
  const calls: RefundCall[] = [];
  const submit = async (call: RefundCall) => {
    calls.push(call);
    return { txHash: "ab".repeat(32), ledger: 1234 };
  };
  const refundOptions = { refundVaultId: vault, submit };

  it("does not report a refund when no vault or chain is configured", async () => {
    const result = await handleM0Refund({
      pactId: "04".repeat(32),
      buyer: "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5",
      price: "1.00",
      verdict: "deny",
      paidAtLedger: 10,
    });
    expect(result.refunded).toBe(false);
    expect(result.txHash).toBeUndefined();
    expect(result.error).toMatch(/^not_submitted/);
  });

  it("executes M0 refund on DENY through RefundVault", async () => {
    const result = await handleM0Refund({
      pactId: "01".repeat(32),
      buyer: "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5",
      price: "1.00",
      verdict: "deny",
      paidAtLedger: 10,
    }, refundOptions);

    expect(result.refunded).toBe(true);
    expect(result.refundAmount).toBe("1");
    expect(result.paymentRef).toBe("01".repeat(32));
    expect(result.txHash).toBe("ab".repeat(32));
    expect(calls.at(-1)).toEqual({
      refundVaultId: vault,
      paymentRef: "01".repeat(32),
      recipient: "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5",
      amountStroops: 10_000_000n,
      paidAtLedger: 10,
    });
  });

  it("executes M0 partial refund on partial delivery", async () => {
    const result = await handleM0Refund({
      pactId: "02".repeat(32),
      buyer: "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5",
      price: "1.00",
      verdict: "allow",
      allowedAmount: "0.40",
      paidAtLedger: 10,
    }, refundOptions);

    expect(result.refunded).toBe(true);
    expect(result.refundAmount).toBe("0.6");
  });

  it("rejects duplicate refund for the same pact_id (AlreadyRefunded)", async () => {
    const notification = {
      pactId: "03".repeat(32),
      buyer: "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5",
      price: "1.00",
      verdict: "deny" as const,
      paidAtLedger: 10,
    };

    const first = await handleM0Refund(notification, refundOptions);
    expect(first.refunded).toBe(true);

    const second = await handleM0Refund(notification, refundOptions);
    expect(second.refunded).toBe(false);
    expect(second.error).toBe("AlreadyRefunded");
  });
});
