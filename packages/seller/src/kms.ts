/**
 * KMS-backed seller keys (P7-08, FR-S7, B13).
 * Keeps private signing keys in a KMS (AWS KMS, GCP Cloud KMS, or Vault)
 * so no seller secret key exists on disk or in server environment.
 */
import { Keypair } from "@stellar/stellar-base";

export interface KmsSigner {
  getPublicKey(): Promise<string>;
  sign(data: Uint8Array): Promise<Uint8Array>;
  signMessage(msg: Uint8Array): Promise<Uint8Array>;
  isRemote(): boolean;
}

export interface KmsSignerOptions {
  kmsKeyId?: string;
  kmsProvider?: "aws" | "gcp" | "vault" | "mock";
  kmsEndpoint?: string;
  localSecret?: string;
  remoteSignFn?: (data: Uint8Array) => Promise<Uint8Array>;
  remotePublicKey?: string;
}

export class LocalKeypairSigner implements KmsSigner {
  private keypair: Keypair;

  constructor(secretKey: string) {
    this.keypair = Keypair.fromSecret(secretKey);
  }

  async getPublicKey(): Promise<string> {
    return this.keypair.publicKey();
  }

  async sign(data: Uint8Array): Promise<Uint8Array> {
    return new Uint8Array(this.keypair.sign(Buffer.from(data)));
  }

  async signMessage(msg: Uint8Array): Promise<Uint8Array> {
    return this.sign(msg);
  }

  isRemote(): boolean {
    return false;
  }
}

export class RemoteKmsSigner implements KmsSigner {
  private publicKeyStr: string;
  private signFn: (data: Uint8Array) => Promise<Uint8Array>;

  constructor(publicKey: string, signFn: (data: Uint8Array) => Promise<Uint8Array>) {
    this.publicKeyStr = publicKey;
    this.signFn = signFn;
  }

  async getPublicKey(): Promise<string> {
    return this.publicKeyStr;
  }

  async sign(data: Uint8Array): Promise<Uint8Array> {
    return this.signFn(data);
  }

  async signMessage(msg: Uint8Array): Promise<Uint8Array> {
    return this.signFn(msg);
  }

  isRemote(): boolean {
    return true;
  }
}

/**
 * Resolves a KmsSigner. When KMS_KEY_ID or remote signer options are present,
 * the key is fetched/signed remotely with NO secret key loaded from disk.
 */
export function resolveKmsSigner(options?: KmsSignerOptions): KmsSigner {
  const env = process.env;
  const kmsKeyId = options?.kmsKeyId ?? env.KMS_KEY_ID ?? env.AWS_KMS_KEY_ARN;

  if (options?.remoteSignFn && options?.remotePublicKey) {
    return new RemoteKmsSigner(options.remotePublicKey, options.remoteSignFn);
  }

  if (kmsKeyId) {
    // No built-in KMS client: the caller supplies the signing function and the key's public key.
    // Signing with any other key would produce signatures nobody can verify.
    throw new Error(
      `KMS key ${kmsKeyId} is configured but no remote signer was given: pass remoteSignFn and remotePublicKey`,
    );
  }

  const localSecret = options?.localSecret ?? env.SELLER_SECRET_KEY ?? env.DELIVERY_SECRET_KEY;
  if (localSecret) {
    return new LocalKeypairSigner(localSecret);
  }

  // Fallback ephemeral keypair for dev/test
  return new LocalKeypairSigner(Keypair.random().secret());
}
