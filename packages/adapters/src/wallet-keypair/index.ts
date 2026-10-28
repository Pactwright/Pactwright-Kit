/** Agent keypair wallet (MVP). ROADMAP K-13. */
import { notImplemented } from "@pactwright/core";
import type { AuthEntry, Wallet } from "../types.ts";

export class WalletKeypair implements Wallet {
  address(): string {
    return notImplemented("K-13");
  }

  signAuthEntry(_entry: AuthEntry): Promise<AuthEntry> {
    return notImplemented("K-13");
  }
}
