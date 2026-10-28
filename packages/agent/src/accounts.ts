/** Agent accounts: sponsored reserves + USDC trustline; budget top-ups (ADR-006). ROADMAP K-10. */
import { notImplemented } from "@pactwright/core";

export interface CreateAgentResult {
  address: string;
  tx: string;
}

export async function createAgentAccount(_sponsorSecret: string): Promise<CreateAgentResult> {
  return notImplemented("K-10");
}

export async function topUp(_agent: string, _amount: string, _funderSecret: string): Promise<string> {
  return notImplemented("K-10");
}
