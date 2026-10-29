/** Adapter interfaces. ARCHITECTURE.md §8.6. */
import type { Mode, PactTerms, Verdict } from "@pactwright/core";
export type { Mode, PactTerms, Verdict };

export interface SearchQuery {
  query: string;
  maxPrice?: string;
  modes?: Mode[];
}

export interface SellerListing {
  resourceUrl: string;
  seller: string;
  mode: Mode;
  price: string;
  verifier: string;
  silence?: "refund" | "pay";
  refundWindowLedgers: number;
  /** M0: the seller's RefundVault float, shown to buyers. */
  refundFloat?: string;
}

export interface RankedListing extends SellerListing {
  score: number;
  explanation?: string;
}

export interface BudgetRequest {
  agent: string;
  amount: string;
  asset: "USDC";
  expiresAt?: string;
}

export interface BudgetResult {
  approved: boolean;
  fundingTx?: string;
}

/**
 * SEP-43: the base64 XDR `HashIdPreimage` (envelope type `SorobanAuthorization`) a wallet signs
 * when it authorizes a Soroban call, and, as a return value, the base64 ed25519 signature over its
 * sha256. This is what `AssembledTransaction.signAuthEntries` and the x402 Stellar signers use.
 */
export type AuthEntry = string;

export interface VerdictInput {
  terms: PactTerms;
  evidence: { uri: string; sha256: string; mimeType: string }[];
  deliveryReceipt?: string;
}

export interface VerdictOutput {
  verdict: Verdict;
  amount: string;
  envelopeRef: string;
}

export interface Discovery {
  search(query: SearchQuery): Promise<SellerListing[]>;
}

export interface Reputation {
  rank(listings: SellerListing[]): Promise<RankedListing[]>;
}

export interface Gate {
  approveBudget(request: BudgetRequest): Promise<BudgetResult>;
}

export interface Wallet {
  address(): string;
  signAuthEntry(entry: AuthEntry): Promise<AuthEntry>;
}

export interface Verifier {
  requestVerdict(input: VerdictInput): Promise<VerdictOutput>;
  verifyEnvelope(envelopeRef: string): Promise<boolean>;
}
