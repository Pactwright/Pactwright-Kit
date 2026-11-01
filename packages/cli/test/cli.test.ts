import { beforeAll, describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
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
    // This used to call `pact()` with no fetchImpl, so every `pnpm test` made a real outbound request
    // to studio.pactwright.dev and asserted only that "State:" appeared — true whether the read worked
    // or the command printed an invented "settled" timeline.
    it("displays the pact state it read", async () => {
      const logs: string[] = [];
      const asked: string[] = [];
      await pact(["01".repeat(32)], {
        facilitatorUrl: "http://studio.test",
        fetchImpl: async (url) => {
          asked.push(String(url));
          return new Response(
            JSON.stringify({
              pactId: "01".repeat(32),
              state: "funded",
              mode: "escrow",
              timeline: [{ stage: "opened", timestamp: "2026-10-29T00:00:00Z" }],
            }),
            { status: 200, headers: { "content-type": "application/json" } },
          );
        },
        log: (msg) => logs.push(msg),
        error: () => {},
      });

      expect(asked).toEqual(["http://studio.test/api/pacts/" + "01".repeat(32)]);
      expect(logs).toContain("State:    funded");
      expect(logs.some((l) => l.includes("- opened (2026-10-29T00:00:00Z)"))).toBe(true);
      expect(logs.join("\n")).not.toContain("settled");
    });

    it("reports an unreadable pact as unknown instead of inventing a timeline", async () => {
      const logs: string[] = [];
      const errors: string[] = [];
      process.exitCode = 0;
      await pact(["02".repeat(32)], {
        facilitatorUrl: "http://studio.test",
        fetchImpl: async () => new Response("nope", { status: 503, statusText: "Service Unavailable" }),
        log: (msg) => logs.push(msg),
        error: (msg) => errors.push(msg),
      });

      expect(errors.some((e) => e.includes("Could not read pact") && e.includes("503"))).toBe(true);
      expect(logs).toContain("State:    unknown");
      expect(logs.join("\n")).not.toContain("Timeline:");
      expect(logs.join("\n")).not.toContain("settled");
      expect(process.exitCode).toBe(1);
      process.exitCode = 0;
    });

    it("reports a transport failure as unknown too", async () => {
      const logs: string[] = [];
      const errors: string[] = [];
      process.exitCode = 0;
      await pact(["03".repeat(32)], {
        facilitatorUrl: "http://studio.test",
        fetchImpl: (async () => {
          throw new Error("getaddrinfo ENOTFOUND studio.test");
        }) as typeof fetch,
        log: (msg) => logs.push(msg),
        error: (msg) => errors.push(msg),
      });

      expect(errors.some((e) => e.includes("ENOTFOUND"))).toBe(true);
      expect(logs).toContain("State:    unknown");
      process.exitCode = 0;
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

  describe("CLI executable entrypoint (ROADMAP K-12, #125)", () => {
    const cliBin = path.resolve(__dirname, "../dist/index.js");

    beforeAll(() => {
      if (!fs.existsSync(cliBin)) {
        execFileSync("pnpm", ["--filter", "@pactwright/cli", "run", "build"], {
          cwd: path.resolve(__dirname, "../../.."),
          stdio: "ignore",
        });
      }
    });

    it("prints help message with --help", () => {
      const out = execFileSync(process.execPath, [cliBin, "--help"], { encoding: "utf8" });
      expect(out).toContain("Usage: pactwright <command> [options]");
      expect(out).toContain("verify");
      expect(out).toContain("agent-create");
      expect(out).toContain("--version");
    });

    it("prints version with --version", () => {
      const out = execFileSync(process.execPath, [cliBin, "--version"], { encoding: "utf8" });
      expect(out.trim()).toBe("0.1.0");
    });

    it("prints usage error and exits 2 on unknown command", () => {
      try {
        execFileSync(process.execPath, [cliBin, "unknown-cmd"], { encoding: "utf8", stdio: "pipe" });
        expect.unreachable("should fail");
      } catch (err: unknown) {
        const error = err as { status?: number; stderr?: Buffer | string };
        expect(error.status).toBe(2);
        expect(error.stderr?.toString()).toContain("usage: pactwright <verify|pact|agent-create|agent-topup>");
      }
    });
  });
});
