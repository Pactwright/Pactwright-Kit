import { notImplemented } from "@pactwright/core";
import type { RankedListing, SearchQuery } from "@pactwright/adapters";
import type { PactwrightConfig } from "./client.ts";

/** Discovery → reputation ranking. ROADMAP K-08. */
export async function find(_config: PactwrightConfig, _query: SearchQuery): Promise<RankedListing[]> {
  return notImplemented("K-08");
}
