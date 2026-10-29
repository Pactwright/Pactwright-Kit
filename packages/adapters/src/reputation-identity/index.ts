/** No re-ranking (MVP). ROADMAP K-13. */
import type { Reputation, RankedListing, SellerListing } from "../types.ts";

export class ReputationIdentity implements Reputation {
  async rank(listings: SellerListing[]): Promise<RankedListing[]> {
    return listings.map((listing) => ({
      ...listing,
      score: 1.0,
      explanation: "identity ranking: preserved input ordering (MVP)",
    }));
  }
}
