import { describe, it, expect } from "vitest";
import { Keypair } from "@stellar/stellar-base";
import { conditionHash } from "@pactwright/core";
import { FacilitatorSchemeHandler } from "../src/facilitator-client.ts";

describe("FacilitatorSchemeHandler (X-02, X-03, X-04, X-05, X-08)", () => {
  const configuredContract = "CDUXJJUNQG7Q5C42N5E5QG7Q5C42N5E5QG7Q5C42N5E5QG7Q5C42N5E5";
  const facilitatorKey = Keypair.random();
  const sellerKey = Keypair.random();
  const buyerKey = Keypair.random();

  const handler = new FacilitatorSchemeHandler({
    configuredPactContractId: configuredContract,
    facilitatorKeypair: facilitatorKey,
  });

  const validCondition = { kind: "document.translation", sourceText: "hello", targetLang: "es" };
  const validConditionHash = conditionHash(validCondition);

  const baseRequest = {
    contractId: configuredContract,
    payTo: sellerKey.publicKey(),
    seller: sellerKey.publicKey(),
    buyer: buyerKey.publicKey(),
    amount: "1.00",
    condition: validCondition,
    conditionHash: validConditionHash,
    pactId: "aa".repeat(32),
    hasSellerTrustline: true,
    facilitatorAddress: facilitatorKey.publicKey(),
    functionName: "open",
  };

  it("passes validation for valid pact.open", () => {
    const res = handler.validatePactVerify(baseRequest);
    expect(res.valid).toBe(true);
  });

  // Negative tests for X-05 (every rule from X-02):
  it("rejects wrong contract ID", () => {
    const res = handler.validatePactVerify({ ...baseRequest, contractId: "CWRONG" });
    expect(res.valid).toBe(false);
    expect(res.error).toContain("Contract ID does not match");
  });

  it("rejects non-open function", () => {
    const res = handler.validatePactVerify({ ...baseRequest, functionName: "transfer" });
    expect(res.valid).toBe(false);
    expect(res.error).toContain("is not 'open'");
  });

  it("rejects when seller does not match payTo", () => {
    const other = Keypair.random().publicKey();
    const res = handler.validatePactVerify({ ...baseRequest, payTo: other });
    expect(res.valid).toBe(false);
    expect(res.error).toContain("does not match payTo");
  });

  it("rejects condition hash mismatch", () => {
    const res = handler.validatePactVerify({ ...baseRequest, conditionHash: "00".repeat(32) });
    expect(res.valid).toBe(false);
    expect(res.error).toContain("Condition hash does not match");
  });

  it("rejects when facilitator is buyer or seller", () => {
    const res = handler.validatePactVerify({ ...baseRequest, buyer: facilitatorKey.publicKey() });
    expect(res.valid).toBe(false);
    expect(res.error).toContain("Facilitator cannot be a party");
  });

  it("rejects when seller trustline is missing", () => {
    const res = handler.validatePactVerify({ ...baseRequest, hasSellerTrustline: false });
    expect(res.valid).toBe(false);
    expect(res.error).toContain("trustline");
  });

  it("submits /settle with fee sponsorship and rejects duplicate pact_id", async () => {
    const res = await handler.submitSettle(baseRequest);
    expect(res.accepted).toBe(true);
    expect(res).not.toHaveProperty("txHash");

    // Duplicate pact_id
    await expect(handler.submitSettle(baseRequest)).rejects.toThrow(/already been used/);
  });

  // Allow-list checks for /pact/submit (X-04, X-05)
  it("allows only allow-listed functions in /pact/submit", async () => {
    const pactId = "bb".repeat(32);
    for (const action of ["settle", "release", "close_meter", "extend_pact_ttl"]) {
      const res = await handler.submitPactAction({ action, pact_id: pactId });
      expect(res.ok).toBe(true);
    }

    // Disallowed actions
    await expect(handler.submitPactAction({ action: "drain_funds", pact_id: pactId })).rejects.toThrow(
      /allow-list/,
    );
    await expect(handler.submitPactAction({ action: "transfer", pact_id: pactId })).rejects.toThrow(
      /allow-list/,
    );
  });
});
