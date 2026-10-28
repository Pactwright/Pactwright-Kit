/** Accensa Bazaar search (MVP). ROADMAP K-13. */
import { notImplemented } from "@pactwright/core";
import type { Discovery, SearchQuery, SellerListing } from "../types.ts";

export class DiscoveryBazaar implements Discovery {
  search(_query: SearchQuery): Promise<SellerListing[]> {
    return notImplemented("K-13");
  }
}
