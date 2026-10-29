/** Agent keypair wallet (MVP). ROADMAP K-13. */
import { Keypair } from "@pactwright/core";
import { xdr } from "@stellar/stellar-base";
import type { AuthEntry, Wallet } from "../types.ts";

export class WalletKeypair implements Wallet {
  private readonly keypair: Keypair;

  constructor(keypairOrSecret?: Keypair | string) {
    if (!keypairOrSecret) {
      this.keypair = Keypair.random();
    } else if (typeof keypairOrSecret === "string") {
      this.keypair = keypairOrSecret.startsWith("S")
        ? Keypair.fromSecret(keypairOrSecret)
        : Keypair.fromRawEd25519Seed(Buffer.from(keypairOrSecret.replace(/^0x/, ""), "hex"));
    } else {
      this.keypair = keypairOrSecret;
    }
  }

  address(): string {
    return this.keypair.publicKey();
  }

  getKeypair(): Keypair {
    return this.keypair;
  }

  async signAuthEntry(entry: AuthEntry): Promise<AuthEntry> {
    try {
      const authEntry = xdr.SorobanAuthorizationEntry.fromXDR(entry, "base64");
      const signature = this.keypair.sign(authEntry.toXDR());
      // Return base64 signature or encoded entry
      return Buffer.from(signature).toString("base64");
    } catch {
      // If raw payload or mock string
      const signature = this.keypair.sign(Buffer.from(entry, "utf8"));
      return Buffer.from(signature).toString("base64");
    }
  }
}
