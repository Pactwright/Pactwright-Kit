/** Accensa Bazaar search (MVP). ROADMAP K-13. */
import { toStroops } from "@pactwright/core";
import type { Discovery, SearchQuery, SellerListing } from "../types.ts";

export interface DiscoveryBazaarOptions {
  bazaarUrl?: string;
  fetchImpl?: typeof fetch;
  /** In-memory listings or mock data. */
  listings?: SellerListing[];
}

export class DiscoveryBazaar implements Discovery {
  private readonly bazaarUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly staticListings?: SellerListing[];

  constructor(options?: DiscoveryBazaarOptions) {
    this.bazaarUrl = options?.bazaarUrl ?? process.env.BAZAAR_URL ?? "https://bazaar.accensa.io";
    this.fetchImpl = options?.fetchImpl ?? globalThis.fetch;
    this.staticListings = options?.listings;
  }

  async search(query: SearchQuery): Promise<SellerListing[]> {
    let allListings: SellerListing[];

    if (this.staticListings) {
      allListings = [...this.staticListings];
    } else {
      const url = `${this.bazaarUrl.replace(/\/$/, "")}/api/catalog`;
      try {
        const res = await this.fetchImpl(url, {
          headers: { Accept: "application/json" },
        });
        if (!res.ok) {
          throw new Error(`Bazaar catalog returned HTTP ${res.status}`);
        }
        const data = (await res.json()) as { listings?: SellerListing[] } | SellerListing[];
        allListings = Array.isArray(data) ? data : (data.listings ?? []);
      } catch (err) {
        throw new Error(`Failed to query Bazaar catalog at ${url}: ${String(err)}`);
      }
    }

    const q = query.query.trim().toLowerCase();
    const maxPriceStroops = query.maxPrice ? toStroops(query.maxPrice) : undefined;
    const allowedModes = query.modes;

    return allListings.filter((listing) => {
      // Filter by text query
      if (q.length > 0) {
        const matchesUrl = listing.resourceUrl.toLowerCase().includes(q);
        const matchesSeller = listing.seller.toLowerCase().includes(q);
        if (!matchesUrl && !matchesSeller) return false;
      }

      // Filter by max price
      if (maxPriceStroops !== undefined) {
        try {
          const listingStroops = toStroops(listing.price);
          if (listingStroops > maxPriceStroops) return false;
        } catch {
          return false;
        }
      }

      // Filter by allowed modes
      if (allowedModes && allowedModes.length > 0) {
        if (!allowedModes.includes(listing.mode)) return false;
      }

      return true;
    });
  }
}
