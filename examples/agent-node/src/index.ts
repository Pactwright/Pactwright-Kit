/**
 * Smallest autonomous buyer agent (ROADMAP K-15).
 * Discovers and buys from a protected seller endpoint, verifies delivery receipt, and tracks pact state.
 */
import {
  createPactwright,
  type Pact,
  type PactwrightConfig,
} from "@pactwright/agent";
import {
  DiscoveryBazaar,
  GateManual,
  ReputationIdentity,
  VerifierWitness,
  WalletKeypair,
} from "@pactwright/adapters";
import { Keypair, loadNetworkConfig, type NetworkConfig } from "@pactwright/core";

export async function runAgentBuyer(options?: {
  agentKey?: Keypair;
  sellerAddress?: string;
  sellerUrl?: string;
  targetLang?: string;
  fetchImpl?: typeof fetch;
}): Promise<Pact> {
  const secret = process.env.AGENT_SECRET_KEY;
  const keypair = options?.agentKey ?? (secret ? Keypair.fromSecret(secret) : Keypair.random());
  const sellerUrl = options?.sellerUrl ?? process.env.SELLER_URL ?? "http://localhost:4000/translate?to=es";
  const sellerAddress = options?.sellerAddress ?? process.env.SELLER_ADDRESS ?? "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5";
  const targetLang = options?.targetLang ?? "es";

  let network: NetworkConfig;
  try {
    network = loadNetworkConfig(process.env);
  } catch {
    network = {
      network: "testnet",
      passphrase: "Test SDF Network ; September 2015",
      rpcUrl: "https://soroban-testnet.stellar.org",
      usdcSac: "CABQGAYDAMBQGAYDAMBQGAYDAMBQGAYDAMBQGAYDAMBQGAYDAMBQGTV3",
      receiptAnchor: "CABQGAYDAMBQGAYDAMBQGAYDAMBQGAYDAMBQGAYDAMBQGAYDAMBQGTV3",
      facilitatorUrl: process.env.FACILITATOR_URL ?? "https://testnet.facilitator.stellar.org",
    };
  }

  const wallet = new WalletKeypair(keypair);
  const discovery = new DiscoveryBazaar({
    listings: [
      {
        resourceUrl: sellerUrl,
        seller: sellerAddress,
        mode: "exact-refund",
        price: "0.25",
        verifier: "02".repeat(32),
        refundWindowLedgers: 17280,
      },
    ],
  });

  const config: PactwrightConfig = {
    network,
    wallet,
    verifierUrl: process.env.VERIFIER_URL ?? "https://verifier.pactwright.dev",
    facilitatorUrl: network.facilitatorUrl,
    fetchImpl: options?.fetchImpl,
    adapters: {
      discovery,
      reputation: new ReputationIdentity(),
      gate: new GateManual({ maxAutoApproveAmount: "10.00" }),
      verifier: new VerifierWitness(),
    },
  };

  const pactwright = createPactwright(config);

  console.log(`Agent starting with address: ${wallet.address()}`);
  console.log(`Buying from: ${sellerUrl}`);

  const pact = await pactwright.buy(
    {
      resourceUrl: sellerUrl,
      seller: sellerAddress,
      mode: "exact-refund",
      price: "0.25",
      verifier: "02".repeat(32),
      refundWindowLedgers: 17280,
      score: 1.0,
    },
    {
      condition: {
        kind: "document.translation",
        lang: targetLang,
        minPages: 1,
      },
      idempotencyKey: `buy_${Date.now()}`,
      fetchImpl: options?.fetchImpl,
    },
  );

  console.log("Pact created and paid. ID:", pact.terms.pactId);
  console.log("Delivery receipt present:", Boolean(pact.deliveryReceipt));
  const decodedBody = new TextDecoder().decode(pact.body);
  console.log("Delivered body:", decodedBody);

  return pact;
}

const isMain = process.argv[1] && (process.argv[1].endsWith("index.ts") || process.argv[1].endsWith("index.js"));
if (process.env.NODE_ENV !== "test" && isMain) {
  runAgentBuyer().catch((err) => {
    console.error("Agent buyer error:", err);
    process.exit(1);
  });
}
