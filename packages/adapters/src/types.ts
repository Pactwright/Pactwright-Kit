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

/** A Soroban authorization entry, base64 XDR. */
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
