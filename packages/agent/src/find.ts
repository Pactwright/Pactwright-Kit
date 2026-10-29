import type { RankedListing, SearchQuery } from "@pactwright/adapters";
import type { PactwrightConfig } from "./client.ts";

/** Discovery → reputation ranking. ROADMAP K-08. */
export async function find(config: PactwrightConfig, query: SearchQuery): Promise<RankedListing[]> {
  const listings = await config.adapters.discovery.search(query);
  return config.adapters.reputation.rank(listings);
}
