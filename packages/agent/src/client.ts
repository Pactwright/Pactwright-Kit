/** createPactwright(): the buyer-side entry point. ARCHITECTURE §6.1. */
import type { Certificate, NetworkConfig, PactState } from "@pactwright/core";
import type { Discovery, Gate, RankedListing, Reputation, SearchQuery, Verifier, Wallet } from "@pactwright/adapters";
import { buy, type BuyOptions, type Pact } from "./buy.ts";
import { awaitPact, type AwaitOptions } from "./await.ts";
import { getCertificate } from "./certificate.ts";
import { find } from "./find.ts";

export interface PactwrightConfig {
  network: NetworkConfig;
  wallet: Wallet;
  verifierUrl: string;
  adapters: {
    discovery: Discovery;
    reputation: Reputation;
    gate: Gate;
    verifier: Verifier;
  };
}

export interface Pactwright {
  find(query: SearchQuery): Promise<RankedListing[]>;
  buy(listing: RankedListing, options: BuyOptions): Promise<Pact>;
  await(pact: Pact, options?: AwaitOptions): Promise<PactState>;
  certificate(pactId: string): Promise<Certificate>;
}

export function createPactwright(config: PactwrightConfig): Pactwright {
  return {
    find: (query) => find(config, query),
    buy: (listing, options) => buy(config, listing, options),
    await: (pact, options) => awaitPact(config, pact, options),
    certificate: (pactId) => getCertificate(config, pactId),
  };
}
