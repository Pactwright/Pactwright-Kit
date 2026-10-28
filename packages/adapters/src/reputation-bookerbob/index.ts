/** BookerBob proven-customer ranking (v2). ROADMAP P9-01. */
import { notImplemented } from "@pactwright/core";
import type { Reputation, RankedListing, SellerListing } from "../types.ts";

export class ReputationBookerBob implements Reputation {
  rank(_listings: SellerListing[]): Promise<RankedListing[]> {
    return notImplemented("P9-01");
  }
}
