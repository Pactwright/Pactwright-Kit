/** Pollar seedless wallet for principal funding (v1, SDK only). ROADMAP P7-13. */
import { notImplemented } from "@pactwright/core";
import type { AuthEntry, Wallet } from "../types.ts";

export class WalletPollar implements Wallet {
  address(): string {
    return notImplemented("P7-13");
  }

  signAuthEntry(_entry: AuthEntry): Promise<AuthEntry> {
    return notImplemented("P7-13");
  }
}
