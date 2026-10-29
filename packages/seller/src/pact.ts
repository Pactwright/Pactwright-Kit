/** Route options → behavior. ARCHITECTURE §6.3. */
import { Keypair, type Mode, type Silence } from "@pactwright/core";

export interface PactRouteOptions<Req = unknown> {
  mode: Mode;
  /** Decimal USDC amount (cap for escrow). */
  price: string;
  asset: "USDC";
  /** Condition template; the buyer freezes it before paying. */
  condition: (req: Req) => Record<string, unknown>;
  /** Below this amount: receipt only, no verification (B12). */
  verify?: { minAmount: string };
  /** Escrow only. Default "refund". */
  silence?: Silence;
  /** Escrow only. Ledger counts from open. */
  deadlines?: { verdictLedgers: number; settleLedgers: number };
  refundWindowLedgers: number;
  /** Escrow only (v1). */
  meter?: { unit: string; unitPrice: string };
}

/**
 * Default deadline lengths per condition kind (ROADMAP V-11, Q6).
 * Measured from eval benchmark set (deterministic rules < 1ms, model latency p95 ~2.5s):
 * - verdictLedgers: 120 ledgers (~10 minutes at 5s/ledger) provides a resilient 100x cushion for model response and retry.
 * - settleLedgers: 720 ledgers (~1 hour at 5s/ledger) provides sufficient time for buyer settlement or dispute before auto-release.
 */
export const DEFAULT_DEADLINES_BY_KIND: Record<string, { verdictLedgers: number; settleLedgers: number }> = {
  "document.translation": { verdictLedgers: 120, settleLedgers: 720 },
};

export const DEFAULT_DEADLINES = {
  verdictLedgers: 120,
  settleLedgers: 720,
} as const;

export function resolveDeadlines(
  deadlines?: { verdictLedgers: number; settleLedgers: number },
  kind?: string,
): { verdictLedgers: number; settleLedgers: number } {
  if (deadlines) return deadlines;
  if (kind && DEFAULT_DEADLINES_BY_KIND[kind]) {
    return DEFAULT_DEADLINES_BY_KIND[kind]!;
  }
  return DEFAULT_DEADLINES;
}

export interface SellerConfig {
  network?: string;
  sellerAddress?: string;
  deliverySecret?: Uint8Array | string;
  deliveryPublicKey?: string;
  verifierPublicKey?: string;
  verifierUrl?: string;
  pactContractId?: string;
  refundVaultId?: string;
  facilitatorUrl?: string;
}

export function resolveSellerConfig(override?: Partial<SellerConfig>): Required<Omit<SellerConfig, "pactContractId" | "refundVaultId" | "facilitatorUrl">> & Pick<SellerConfig, "pactContractId" | "refundVaultId" | "facilitatorUrl"> {
  const env = process.env;
  const network = override?.network ?? (env.STELLAR_NETWORK === "pubnet" ? "stellar:pubnet" : "stellar:testnet");

  let deliverySecret = override?.deliverySecret ?? env.SELLER_DELIVERY_KEY;
  if (!deliverySecret) {
    // Default placeholder for development / test if not specified
    deliverySecret = "05".repeat(32);
  }

  let deliveryPublicKey = override?.deliveryPublicKey;
  if (!deliveryPublicKey) {
    try {
      const seedBuf = typeof deliverySecret === "string"
        ? Buffer.from(deliverySecret.replace(/^0x/, ""), "hex")
        : Buffer.from(deliverySecret);
      const kp = Keypair.fromRawEd25519Seed(seedBuf);
      deliveryPublicKey = kp.rawPublicKey().toString("hex");
    } catch {
      deliveryPublicKey = "0".repeat(64);
    }
  }

  const sellerAddress = override?.sellerAddress ?? env.SELLER_ADDRESS ?? env.SELLER_SIGNING_KEY_REF ?? "GA7QYNF7SOWQ3GLR2BGMZEHXAVIRZA4KVWLTJJFC7MGXUA74P7UJVTOO";
  const verifierPublicKey = override?.verifierPublicKey ?? env.VERIFIER_PUBLIC_KEY ?? "1".repeat(64);
  const verifierUrl = override?.verifierUrl ?? env.VERIFIER_URL ?? "https://verifier.pactwright.dev";
  const pactContractId = override?.pactContractId ?? env.PACT_CONTRACT_ID;
  const refundVaultId = override?.refundVaultId ?? env.SELLER_REFUND_VAULT_ID;
  const facilitatorUrl = override?.facilitatorUrl ?? env.FACILITATOR_URL;

  return {
    network,
    sellerAddress,
    deliverySecret,
    deliveryPublicKey: deliveryPublicKey ?? "0".repeat(64),
    verifierPublicKey,
    verifierUrl,
    pactContractId,
    refundVaultId,
    facilitatorUrl,
  };
}
