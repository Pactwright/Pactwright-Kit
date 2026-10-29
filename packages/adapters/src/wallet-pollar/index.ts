/** Pollar seedless wallet for principal funding (v1, SDK only). ROADMAP P7-13, FR-A4. */
import { Keypair } from "@stellar/stellar-base";
import type { AuthEntry, Wallet } from "../types.ts";

export interface WalletPollarOptions {
  principalAddress: string;
  agentAddress?: string;
  sessionId?: string;
  pollarApiUrl?: string;
  fetchImpl?: typeof fetch;
}

export class WalletPollar implements Wallet {
  private principalAddress: string;
  private agentAddr: string;
  private sessionId?: string;
  private pollarApiUrl: string;
  private fetchImpl: typeof fetch;

  constructor(options: WalletPollarOptions) {
    this.principalAddress = options.principalAddress;
    this.agentAddr = options.agentAddress ?? Keypair.random().publicKey();
    this.sessionId = options.sessionId ?? process.env.POLLAR_SESSION_ID;
    this.pollarApiUrl = options.pollarApiUrl ?? process.env.POLLAR_API_URL ?? "https://api.pollar.io";
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch;
  }

  address(): string {
    return this.agentAddr;
  }

  getPrincipalAddress(): string {
    return this.principalAddress;
  }

  /**
   * Signs a Soroban authorization entry using the Pollar principal session.
   * Eliminates seed storage on the agent device.
   */
  async signAuthEntry(entry: AuthEntry): Promise<AuthEntry> {
    const url = `${this.pollarApiUrl.replace(/\/$/, "")}/v1/sessions/sign-auth`;
    try {
      const res = await this.fetchImpl(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(this.sessionId ? { "X-Pollar-Session": this.sessionId } : {}),
        },
        body: JSON.stringify({
          principal: this.principalAddress,
          agent: this.agentAddr,
          auth_entry: entry,
        }),
      });

      if (!res.ok) {
        throw new Error(`Pollar session rejected signAuthEntry (${res.status})`);
      }

      const data = (await res.json()) as { signed_entry?: string };
      if (!data.signed_entry) throw new Error("Pollar returned no signed entry");
      return data.signed_entry;
    } catch (err) {
      // Never hand back an unsigned entry as if it were signed.
      throw new Error(`Pollar could not sign the auth entry: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}
