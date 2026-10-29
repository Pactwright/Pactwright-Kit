import { describe, expect, it } from "vitest";
import { NetworkConfigError, PASSPHRASES, loadNetworkConfig } from "../src/network.ts";

const C = "CABQGAYDAMBQGAYDAMBQGAYDAMBQGAYDAMBQGAYDAMBQGAYDAMBQGTV3";
const valid = {
  STELLAR_NETWORK: "testnet",
  STELLAR_NETWORK_PASSPHRASE: PASSPHRASES.testnet,
  STELLAR_RPC_URL: "https://soroban-testnet.stellar.org",
  USDC_SAC_ID: C,
  RECEIPT_ANCHOR_ID: C,
  FACILITATOR_URL: "https://facilitator.example",
};

describe("loadNetworkConfig", () => {
  it("loads a complete testnet config", () => {
    const config = loadNetworkConfig(valid);
    expect(config.network).toBe("testnet");
    expect(config.pactContract).toBeUndefined();
  });

  it("includes the optional pact contract", () => {
    expect(loadNetworkConfig({ ...valid, PACT_CONTRACT_ID: C }).pactContract).toBe(C);
  });

  it("never falls back to testnet when the passphrase is unset", () => {
    expect(() => loadNetworkConfig({ ...valid, STELLAR_NETWORK_PASSPHRASE: "" })).toThrow(NetworkConfigError);
  });

  it("rejects a passphrase from the other network", () => {
    expect(() => loadNetworkConfig({ ...valid, STELLAR_NETWORK_PASSPHRASE: PASSPHRASES.pubnet })).toThrow(/does not match/);
  });

  it("reports every problem at once", () => {
    try {
      loadNetworkConfig({ STELLAR_NETWORK: "mainnet", STELLAR_RPC_URL: "not a url", USDC_SAC_ID: "x" });
      expect.unreachable();
    } catch (e) {
      const problems = (e as NetworkConfigError).problems;
      expect(problems.length).toBeGreaterThanOrEqual(5);
      expect(problems.join("\n")).toMatch(/STELLAR_NETWORK must be/);
      expect(problems.join("\n")).toMatch(/USDC_SAC_ID is not a Stellar address/);
    }
  });

  it("requires PUBNET_CONFIRM_REAL_FUNDS=true on pubnet", () => {
    const pubnetBase = {
      ...valid,
      STELLAR_NETWORK: "pubnet",
      STELLAR_NETWORK_PASSPHRASE: PASSPHRASES.pubnet,
      STELLAR_RPC_URL: "https://horizon.stellar.org",
    };
    expect(() => loadNetworkConfig(pubnetBase)).toThrow(/PUBNET_CONFIRM_REAL_FUNDS/);
    expect(
      loadNetworkConfig({ ...pubnetBase, PUBNET_CONFIRM_REAL_FUNDS: "true" }).network,
    ).toBe("pubnet");
  });
});
