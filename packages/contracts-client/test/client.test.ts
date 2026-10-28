import { describe, expect, it } from "vitest";
import { Client } from "../src/index.ts";

describe("@pactwright/contracts-client (ROADMAP K-05)", () => {
  it("exports a typed pact Client with contract methods", () => {
    expect(Client).toBeDefined();
    expect(typeof Client.deploy).toBe("function");

    const client = new Client({
      contractId: "CABQGAYDAMBQGAYDAMBQGAYDAMBQGAYDAMBQGAYDAMBQGAYDAMBQGCK3",
      networkPassphrase: "Test SDF Network ; September 2015",
      rpcUrl: "https://soroban-testnet.stellar.org",
    });

    expect(typeof client.open).toBe("function");
    expect(typeof client.record_verdict).toBe("function");
    expect(typeof client.settle).toBe("function");
    expect(typeof client.release).toBe("function");
    expect(typeof client.close_meter).toBe("function");
    expect(typeof client.get_pact).toBe("function");
    expect(typeof client.get_config).toBe("function");
  });
});
