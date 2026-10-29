/** Agent keypair wallet (MVP). ROADMAP K-13. */
import { Keypair } from "@pactwright/core";
import { hash, xdr } from "@stellar/stellar-base";
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

  /**
   * SEP-43 `signAuthEntry`: signs sha256 of the authorization preimage, the message Soroban
   * verifies for address credentials. Anything that isn't a Soroban authorization preimage is
   * refused rather than signed.
   */
  async signAuthEntry(entry: AuthEntry): Promise<AuthEntry> {
    let preimage: xdr.HashIdPreimage;
    try {
      preimage = xdr.HashIdPreimage.fromXDR(entry, "base64");
    } catch {
      throw new Error("not a Soroban authorization preimage (base64 HashIdPreimage XDR)");
    }
    if (preimage.switch() !== xdr.EnvelopeType.envelopeTypeSorobanAuthorization()) {
      throw new Error("refusing to sign: preimage is not a Soroban authorization");
    }
    return Buffer.from(this.keypair.sign(hash(preimage.toXDR()))).toString("base64");
  }

}
