import { describe, it, expect } from "vitest";
import { Keypair } from "@stellar/stellar-base";
import { SmartAccountAgent } from "../src/smart-account.ts";

describe("SmartAccountAgent (P9-04, FR-A5)", () => {
  const principal = Keypair.random();

  it("authorizes spends up to cap, then rejects overspending", () => {
    const agent = new SmartAccountAgent(principal.publicKey(), "10.00");
    expect(parseFloat(agent.getRemainingBudget())).toBe(10);

    const spend1 = agent.authorizeSpend("pact_1", "4.00");
    expect(spend1.authorized).toBe(true);
    expect(parseFloat(agent.getRemainingBudget())).toBe(6);

    const spend2 = agent.authorizeSpend("pact_2", "6.00");
    expect(spend2.authorized).toBe(true);
    expect(parseFloat(agent.getRemainingBudget())).toBe(0);

    expect(() => agent.authorizeSpend("pact_3", "1.00")).toThrow(/budget exceeded/);
  });

  it("allows principal to truly revoke unspent budget immediately", () => {
    const agent = new SmartAccountAgent(principal.publicKey(), "50.00");
    agent.authorizeSpend("pact_1", "15.00");
    expect(parseFloat(agent.getRemainingBudget())).toBe(35);

    const revokeRes = agent.revoke(principal);
    expect(revokeRes.revoked).toBe(true);
    expect(parseFloat(revokeRes.unspentRefunded)).toBe(35);
    expect(agent.isRevoked()).toBe(true);
    expect(agent.getRemainingBudget()).toBe("0");

    // Any subsequent spend is immediately rejected
    expect(() => agent.authorizeSpend("pact_2", "5.00")).toThrow(/revoked by principal/);
  });

  it("rejects unauthorized revocation by non-principal", () => {
    const agent = new SmartAccountAgent(principal.publicKey(), "50.00");
    const intruder = Keypair.random();
    expect(() => agent.revoke(intruder)).toThrow(/only the designated principal/);
  });
});
