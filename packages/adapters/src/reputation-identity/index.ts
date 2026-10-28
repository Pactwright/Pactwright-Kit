/** No re-ranking (MVP). ROADMAP K-13. */
import { notImplemented } from "@pactwright/core";
import type { Reputation, RankedListing, SellerListing } from "../types.ts";

export class ReputationIdentity implements Reputation {
  rank(_listings: SellerListing[]): Promise<RankedListing[]> {
    return notImplemented("K-13");
  }
}
