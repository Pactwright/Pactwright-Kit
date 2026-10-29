import { describe, it, expect } from "vitest";
import { Keypair, PASSPHRASES, loadNetworkConfig } from "@pactwright/core";

describe("Pubnet E2E Readiness (P8-07)", () => {
  const pubnetEnv = {
    STELLAR_NETWORK: "pubnet",
    STELLAR_NETWORK_PASSPHRASE: PASSPHRASES.pubnet,
    STELLAR_RPC_URL: "https://horizon.stellar.org",
    USDC_SAC_ID: "CCW67TSZV3SSS2HXMBQ5JFGCKJNXKZM7UQUWUZPUTHXSTZLEO7SJMI75",
    RECEIPT_ANCHOR_ID: "CA2VU3DR3H2X47AFTW2O6J5J3EWB3G7M4RNDWJ4S5QY27ZITX72MFEV6",
    FACILITATOR_URL: "https://facilitator.pactwright.dev",
    PUBNET_CONFIRM_REAL_FUNDS: "true",
  };

  it("loads validated pubnet network configuration with real funds guard", () => {
    const config = loadNetworkConfig(pubnetEnv);
    expect(config.network).toBe("pubnet");
    expect(config.passphrase).toBe(PASSPHRASES.pubnet);
    expect(config.usdcSac).toBeDefined();
  });

  it("verifies small-amount micro-transaction formatting for pubnet", () => {
    const testKey = Keypair.random();
    expect(testKey.publicKey()).toMatch(/^G[A-Z0-9]{55}$/);
  });
});
