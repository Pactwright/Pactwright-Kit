/** BookerBob proven-customer ranking (v2). ROADMAP P9-01, FR-D3, Q2. */
import type { Reputation, RankedListing, SellerListing } from "../types.ts";

export interface BookerBobOptions {
  bookerBobApiUrl?: string;
  apiKey?: string;
  fetchImpl?: typeof fetch;
}

export class ReputationBookerBob implements Reputation {
  private bookerBobApiUrl: string;
  private apiKey?: string;
  private fetchImpl: typeof fetch;

  constructor(options?: BookerBobOptions) {
    this.bookerBobApiUrl = options?.bookerBobApiUrl ?? process.env.BOOKERBOB_API_URL ?? "https://api.bookerbob.xyz";
    this.apiKey = options?.apiKey ?? process.env.BOOKERBOB_API_KEY;
    this.fetchImpl = options?.fetchImpl ?? globalThis.fetch;
  }

  /**
   * Ranks seller listings based on attested proof-of-purchase customer reviews.
   */
  async rank(listings: SellerListing[]): Promise<RankedListing[]> {
    if (listings.length === 0) return [];

    const sellers = listings.map((l) => l.seller);
    const url = `${this.bookerBobApiUrl.replace(/\/$/, "")}/v1/proven-reputation`;

    let scoreMap = new Map<string, { score: number; reviews: number }>();
    try {
      const res = await this.fetchImpl(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {}),
        },
        body: JSON.stringify({ sellers }),
      });

      if (res.ok) {
        const data = (await res.json()) as { scores: Record<string, { score: number; reviews: number }> };
        scoreMap = new Map(Object.entries(data.scores));
      }
    } catch {
      // Offline fallback: rank by refund float & price
    }

    const ranked: RankedListing[] = listings.map((listing) => {
      const entry = scoreMap.get(listing.seller);
      if (entry) {
        return {
          ...listing,
          score: entry.score,
          explanation: `BookerBob verified score ${entry.score} from ${entry.reviews} proven-customer reviews`,
        };
      }

      // Default baseline score derived from float & mode
      const floatVal = listing.refundFloat ? parseFloat(listing.refundFloat) : 0;
      const baseScore = listing.mode === "escrow" ? 80 : Math.min(70, 50 + floatVal * 0.1);
      return {
        ...listing,
        score: Math.round(baseScore),
        explanation: "Baseline score based on escrow/float metrics",
      };
    });

    // Sort descending by score
    return ranked.sort((a, b) => b.score - a.score);
  }
}
