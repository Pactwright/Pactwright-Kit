import { describe, expect, it } from "vitest";
import { Keypair } from "@stellar/stellar-base";
import { signEnvelope, type UnsignedEnvelope } from "@witness/core";
import { verify, pact, agentCreate, agentTopup } from "../src/index.ts";

describe("Pactwright CLI Commands", () => {
  const verifierKeypair = Keypair.random();

  describe("verify command", () => {
    const validUnsigned: UnsignedEnvelope = {
      agreementId: "pact_cli_01",
      milestoneId: "m_final",
      verifier: verifierKeypair.publicKey(),
      verifierType: "model_evaluator",
      criteria: [
        {
          id: "crit_1",
          verifier: verifierKeypair.publicKey(),
          result: "PASS",
          code: "OK",
          reason: "Translation valid",
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

    const validEnvelope = signEnvelope(validUnsigned, verifierKeypair);

    it("verifies valid envelope offline", async () => {
      const logs: string[] = [];
      const errors: string[] = [];

      await verify([JSON.stringify(validEnvelope)], {
        log: (msg) => logs.push(msg),
        error: (msg) => errors.push(msg),
      });

      expect(errors).toHaveLength(0);
      expect(logs.some((l) => l.includes("Envelope verified offline"))).toBe(true);
      expect(logs.some((l) => l.includes(verifierKeypair.publicKey()))).toBe(true);
      expect(logs.some((l) => l.includes("ALLOW"))).toBe(true);
    });

    it("fails verification on tampered signature", async () => {
      const errors: string[] = [];
      const tampered = { ...validEnvelope, signature: Buffer.from("bad_sig").toString("base64") };

      await verify([JSON.stringify(tampered)], {
        log: () => {},
        error: (msg) => errors.push(msg),
      });

      expect(errors.some((e) => e.includes("Verification failed"))).toBe(true);
    });

    it("shows usage error when no args provided", async () => {
      const errors: string[] = [];
      await verify([], {
        log: () => {},
        error: (msg) => errors.push(msg),
      });

      expect(errors.some((e) => e.includes("usage: pactwright verify"))).toBe(true);
    });
  });

  describe("pact command", () => {
    it("displays pact status and timeline", async () => {
      const logs: string[] = [];
      await pact(["01".repeat(32)], {
        log: (msg) => logs.push(msg),
        error: () => {},
      });

      expect(logs.some((l) => l.includes("Pact:"))).toBe(true);
      expect(logs.some((l) => l.includes("State:"))).toBe(true);
      expect(logs.some((l) => l.includes("Timeline:"))).toBe(true);
    });

    it("shows usage error when no pactId provided", async () => {
      const errors: string[] = [];
      await pact([], {
        log: () => {},
        error: (msg) => errors.push(msg),
      });

      expect(errors.some((e) => e.includes("usage: pactwright pact"))).toBe(true);
    });
  });

  describe("agent-create command", () => {
    it("creates agent account and outputs address and tx", async () => {
      const logs: string[] = [];
      const sponsorSecret = Keypair.random().secret();

      await agentCreate(["--sponsor-secret", sponsorSecret], {
        sourceAccountSequence: "100",
        submitTx: async () => "aa".repeat(32),
        log: (msg) => logs.push(msg),
        error: () => {},
      });

      expect(logs.some((l) => l.includes("Agent account created"))).toBe(true);
      expect(logs.some((l) => l.includes("Address: G"))).toBe(true);
      expect(logs.some((l) => l.includes("Tx:"))).toBe(true);
    });

    it("shows usage error when sponsor secret is missing", async () => {
      const errors: string[] = [];
      await agentCreate([], {
        log: () => {},
        error: (msg) => errors.push(msg),
      });

      expect(errors.some((e) => e.includes("usage: pactwright agent-create"))).toBe(true);
    });
  });

  describe("agent-topup command", () => {
    it("tops up agent budget and outputs tx", async () => {
      const logs: string[] = [];
      const funderSecret = Keypair.random().secret();
      const agentAddress = Keypair.random().publicKey();

      await agentTopup([agentAddress, "25.00", "--funder-secret", funderSecret], {
        sourceAccountSequence: "200",
        submitTx: async () => "bb".repeat(32),
        log: (msg) => logs.push(msg),
        error: () => {},
      });

      expect(logs.some((l) => l.includes("Agent budget topped up"))).toBe(true);
      expect(logs.some((l) => l.includes("25.00 USDC"))).toBe(true);
      expect(logs.some((l) => l.includes("Tx:"))).toBe(true);
    });

    it("shows usage error when required arguments are missing", async () => {
      const errors: string[] = [];
      await agentTopup(["only_one_arg"], {
        log: () => {},
        error: (msg) => errors.push(msg),
      });

      expect(errors.some((e) => e.includes("usage: pactwright agent-topup"))).toBe(true);
    });
  });
});
