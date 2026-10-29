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
  /** CAIP-2: `stellar:testnet` or `stellar:pubnet`. */
  network?: string;
  /** Where payments go (the 402's `payTo`). */
  sellerAddress?: string;
  /** ed25519 seed (32-byte hex) that signs `X-Pactwright-Delivery`. */
  deliverySecret?: Uint8Array | string;
  deliveryPublicKey?: string;
  /** The verifier key the seller names in its terms (32-byte hex). */
  verifierPublicKey?: string;
  verifierUrl?: string;
  /** The payment token's contract (USDC SAC). */
  usdcSac?: string;
  pactContractId?: string;
  refundVaultId?: string;
  /** x402 facilitator that verifies and settles payments. */
  facilitatorUrl?: string;
  /** Sent as `Authorization: Bearer …` to the facilitator, when it requires API keys. */
  facilitatorApiKey?: string;
  /** How long a signed payment stays valid. Default 60. */
  maxTimeoutSeconds?: number;
}

export type ResolvedSellerConfig = Required<
  Omit<SellerConfig, "pactContractId" | "refundVaultId" | "facilitatorApiKey">
> &
  Pick<SellerConfig, "pactContractId" | "refundVaultId" | "facilitatorApiKey"> & { deliverySecret: Uint8Array | string };

export class SellerConfigError extends Error {
  constructor(public readonly problems: string[]) {
    super(`invalid seller configuration:\n- ${problems.join("\n- ")}`);
    this.name = "SellerConfigError";
  }
}

/**
 * Resolves the seller's configuration from overrides and the environment. Every value that
 * moves money or signs something is required: there is no default payee, delivery key or
 * verifier, so a misconfigured seller fails at startup instead of paying a stranger or
 * signing receipts with a key everyone knows.
 */
export function resolveSellerConfig(override?: Partial<SellerConfig>): ResolvedSellerConfig {
  const env = process.env;
  const problems: string[] = [];
  const need = <T>(value: T | undefined, name: string): T => {
    if (value === undefined || value === "") problems.push(`${name} is not set`);
    return value as T;
  };

  const network = override?.network ?? (env.STELLAR_NETWORK === "pubnet" ? "stellar:pubnet" : "stellar:testnet");
  const sellerAddress = need(override?.sellerAddress ?? env.SELLER_ADDRESS, "SELLER_ADDRESS");
  const deliverySecret = need(override?.deliverySecret ?? env.SELLER_DELIVERY_KEY, "SELLER_DELIVERY_KEY");
  const verifierPublicKey = need(override?.verifierPublicKey ?? env.VERIFIER_PUBLIC_KEY, "VERIFIER_PUBLIC_KEY");
  const verifierUrl = need(override?.verifierUrl ?? env.VERIFIER_URL, "VERIFIER_URL");
  const usdcSac = need(override?.usdcSac ?? env.USDC_SAC_ID, "USDC_SAC_ID");
  const facilitatorUrl = need(override?.facilitatorUrl ?? env.FACILITATOR_URL, "FACILITATOR_URL");

  let deliveryPublicKey = override?.deliveryPublicKey;
  if (deliverySecret && !deliveryPublicKey) {
    try {
      const seed =
        typeof deliverySecret === "string" ? Buffer.from(deliverySecret.replace(/^0x/, ""), "hex") : Buffer.from(deliverySecret);
      deliveryPublicKey = Keypair.fromRawEd25519Seed(seed).rawPublicKey().toString("hex");
    } catch {
      problems.push("SELLER_DELIVERY_KEY is not a 32-byte hex ed25519 seed");
    }
  }
  if (problems.length) throw new SellerConfigError(problems);

  const pactContractId = override?.pactContractId ?? env.PACT_CONTRACT_ID;
  const refundVaultId = override?.refundVaultId ?? env.SELLER_REFUND_VAULT_ID;
  const facilitatorApiKey = override?.facilitatorApiKey ?? env.FACILITATOR_API_KEY;
  return {
    network,
    sellerAddress,
    deliverySecret,
    deliveryPublicKey: deliveryPublicKey!,
    verifierPublicKey,
    verifierUrl,
    usdcSac,
    facilitatorUrl,
    maxTimeoutSeconds: override?.maxTimeoutSeconds ?? 60,
    ...(pactContractId ? { pactContractId } : {}),
    ...(refundVaultId ? { refundVaultId } : {}),
    ...(facilitatorApiKey ? { facilitatorApiKey } : {}),
  };
}
