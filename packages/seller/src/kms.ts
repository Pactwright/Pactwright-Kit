/**
 * KMS-backed seller keys (P7-08, FR-S7, B13).
 * Keeps private signing keys in a KMS (e.g. HashiCorp Vault Transit, AWS KMS, or Cloud KMS)
 * so no seller secret key exists on disk or in the server environment.
 */
import { Keypair, StrKey, TransactionBuilder, Networks, xdr, type Transaction } from "@stellar/stellar-base";

export interface KmsSigner {
  getPublicKey(): Promise<string>;
  sign(data: Uint8Array): Promise<Uint8Array>;
  signMessage(msg: Uint8Array): Promise<Uint8Array>;
  signTransaction(txEnvelopeXdr: string, passphrase?: string): Promise<string>;
  isRemote(): boolean;
}

export interface VaultKmsOptions {
  vaultAddr?: string;
  vaultToken?: string;
  keyName: string;
  vaultMount?: string;
  publicKey?: string;
}

export interface HttpKmsOptions {
  endpoint: string;
  keyId?: string;
  token?: string;
  publicKey?: string;
}

export interface KmsSignerOptions {
  kmsKeyId?: string;
  kmsProvider?: "vault" | "http" | "custom" | "aws" | "gcp" | "mock";
  kmsEndpoint?: string;
  kmsToken?: string;
  vaultAddr?: string;
  vaultToken?: string;
  vaultKeyName?: string;
  vaultMount?: string;
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

  async signTransaction(txEnvelopeXdr: string, passphrase = Networks.TESTNET): Promise<string> {
    const tx = TransactionBuilder.fromXDR(txEnvelopeXdr, passphrase) as Transaction;
    tx.sign(this.keypair);
    return tx.toXDR();
  }

  isRemote(): boolean {
    return false;
  }
}

export class RemoteKmsSigner implements KmsSigner {
  private publicKeyStr?: string;
  private signFn: (data: Uint8Array) => Promise<Uint8Array>;
  private fetchPublicKeyFn?: () => Promise<string>;

  constructor(
    publicKey: string | undefined,
    signFn: (data: Uint8Array) => Promise<Uint8Array>,
    fetchPublicKeyFn?: () => Promise<string>,
  ) {
    this.publicKeyStr = publicKey;
    this.signFn = signFn;
    this.fetchPublicKeyFn = fetchPublicKeyFn;
  }

  async getPublicKey(): Promise<string> {
    if (!this.publicKeyStr) {
      if (!this.fetchPublicKeyFn) {
        throw new Error("RemoteKmsSigner has no configured public key and no fetchPublicKey provider");
      }
      this.publicKeyStr = await this.fetchPublicKeyFn();
    }
    return this.publicKeyStr;
  }

  async sign(data: Uint8Array): Promise<Uint8Array> {
    const sig = await this.signFn(data);
    if (!sig || sig.length !== 64) {
      throw new Error(`Remote KMS signature invalid: expected 64 bytes, received ${sig?.length}`);
    }
    return sig;
  }

  async signMessage(msg: Uint8Array): Promise<Uint8Array> {
    return this.sign(msg);
  }

  async signTransaction(txEnvelopeXdr: string, passphrase = Networks.TESTNET): Promise<string> {
    const tx = TransactionBuilder.fromXDR(txEnvelopeXdr, passphrase) as Transaction;
    const txHash = tx.hash();
    const sigBytes = await this.sign(txHash);

    const pubKey = await this.getPublicKey();
    const rawPub = StrKey.decodeEd25519PublicKey(pubKey);
    const hint = rawPub.subarray(28, 32);

    const decoratedSig = new xdr.DecoratedSignature({
      hint,
      signature: Buffer.from(sigBytes),
    });

    tx.signatures.push(decoratedSig);
    return tx.toXDR();
  }

  isRemote(): boolean {
    return true;
  }

  /**
   * Constructs a RemoteKmsSigner backed by HashiCorp Vault Transit engine.
   * Native Ed25519 keys are supported by Vault Transit.
   */
  static fromVault(options: VaultKmsOptions): RemoteKmsSigner {
    const addr = (options.vaultAddr ?? process.env.VAULT_ADDR ?? "http://127.0.0.1:8200").replace(/\/$/, "");
    const token = options.vaultToken ?? process.env.VAULT_TOKEN ?? "";
    const mount = options.vaultMount ?? "transit";
    const keyName = options.keyName;

    const fetchPublicKey = async (): Promise<string> => {
      const url = `${addr}/v1/${mount}/keys/${keyName}`;
      const res = await fetch(url, {
        headers: { "X-Vault-Token": token, Accept: "application/json" },
      });
      if (!res.ok) {
        throw new Error(`Vault Transit get key failed (HTTP ${res.status}): ${await res.text()}`);
      }
      const json = (await res.json()) as {
        data?: {
          type?: string;
          keys?: Record<string, { public_key?: string }>;
        };
      };
      if (json.data?.type && json.data.type !== "ed25519") {
        throw new Error(`Vault key ${keyName} is of type '${json.data.type}', but ed25519 is required`);
      }
      const latestKey = Object.values(json.data?.keys ?? {}).pop();
      if (!latestKey?.public_key) {
        throw new Error(`Vault key ${keyName} has no valid public_key in response`);
      }
      const raw = Buffer.from(latestKey.public_key, "base64");
      return StrKey.encodeEd25519PublicKey(raw);
    };

    const sign = async (data: Uint8Array): Promise<Uint8Array> => {
      const url = `${addr}/v1/${mount}/sign/${keyName}`;
      const b64Input = Buffer.from(data).toString("base64");
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "X-Vault-Token": token,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({ input: b64Input }),
      });
      if (!res.ok) {
        throw new Error(`Vault Transit sign failed (HTTP ${res.status}): ${await res.text()}`);
      }
      const json = (await res.json()) as { data?: { signature?: string } };
      const rawSigStr = json.data?.signature;
      if (!rawSigStr) {
        throw new Error(`Vault Transit sign response missing signature for key ${keyName}`);
      }
      // Vault Transit signatures have the format "vault:v1:<base64-signature>"
      const parts = rawSigStr.split(":");
      const b64Sig = parts.length >= 3 ? parts[2] : parts[0];
      if (!b64Sig) {
        throw new Error(`Vault Transit signature format invalid for key ${keyName}`);
      }
      return new Uint8Array(Buffer.from(b64Sig, "base64"));
    };

    return new RemoteKmsSigner(options.publicKey, sign, fetchPublicKey);
  }

  /**
   * Constructs a RemoteKmsSigner backed by an HTTP remote signer endpoint.
   */
  static fromHttpEndpoint(options: HttpKmsOptions): RemoteKmsSigner {
    const endpoint = options.endpoint.replace(/\/$/, "");
    const token = options.token ?? process.env.KMS_TOKEN;
    const keyId = options.keyId ?? "default";

    const fetchPublicKey = async (): Promise<string> => {
      const url = `${endpoint}/keys/${keyId}`;
      const headers: Record<string, string> = { Accept: "application/json" };
      if (token) headers.Authorization = `Bearer ${token}`;
      const res = await fetch(url, { headers });
      if (!res.ok) {
        throw new Error(`HTTP KMS get key failed (HTTP ${res.status}): ${await res.text()}`);
      }
      const json = (await res.json()) as { publicKey?: string };
      if (!json.publicKey) {
        throw new Error(`HTTP KMS response missing publicKey`);
      }
      return json.publicKey;
    };

    const sign = async (data: Uint8Array): Promise<Uint8Array> => {
      const url = `${endpoint}/sign`;
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        Accept: "application/json",
      };
      if (token) headers.Authorization = `Bearer ${token}`;
      const res = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify({
          keyId,
          data: Buffer.from(data).toString("base64"),
        }),
      });
      if (!res.ok) {
        throw new Error(`HTTP KMS sign failed (HTTP ${res.status}): ${await res.text()}`);
      }
      const json = (await res.json()) as { signature?: string };
      if (!json.signature) {
        throw new Error(`HTTP KMS response missing signature`);
      }
      return new Uint8Array(Buffer.from(json.signature, "base64"));
    };

    return new RemoteKmsSigner(options.publicKey, sign, fetchPublicKey);
  }
}

/**
 * Resolves a KmsSigner. When KMS_KEY_ID or remote signer options are present,
 * the key is fetched/signed remotely with NO secret key loaded from disk.
 *
 * Strict security rule: Never fall back to a local or random key when KMS is configured.
 */
export function resolveKmsSigner(options?: KmsSignerOptions): KmsSigner {
  const env = process.env;
  const kmsKeyId = options?.kmsKeyId ?? env.KMS_KEY_ID ?? env.AWS_KMS_KEY_ARN;
  const vaultAddr = options?.vaultAddr ?? env.VAULT_ADDR;
  const kmsEndpoint = options?.kmsEndpoint ?? env.KMS_ENDPOINT;
  const kmsProvider = options?.kmsProvider;

  // 1. Direct remote signing function & public key
  if (options?.remoteSignFn && options?.remotePublicKey) {
    return new RemoteKmsSigner(options.remotePublicKey, options.remoteSignFn);
  }

  // 2. HashiCorp Vault Transit Engine
  if (kmsProvider === "vault" || vaultAddr || (kmsKeyId && kmsKeyId.startsWith("vault:"))) {
    const keyName =
      options?.vaultKeyName ??
      (kmsKeyId ? kmsKeyId.replace(/^vault:(transit\/keys\/)?/, "") : "merchant-key");
    return RemoteKmsSigner.fromVault({
      vaultAddr,
      vaultToken: options?.vaultToken ?? env.VAULT_TOKEN,
      keyName,
      vaultMount: options?.vaultMount,
      publicKey: options?.remotePublicKey ?? env.KMS_PUBLIC_KEY,
    });
  }

  // 3. HTTP Remote Signer Endpoint
  if (kmsProvider === "http" || kmsEndpoint) {
    if (!kmsEndpoint) {
      throw new Error("KMS provider 'http' configured but KMS_ENDPOINT is missing");
    }
    return RemoteKmsSigner.fromHttpEndpoint({
      endpoint: kmsEndpoint,
      keyId: kmsKeyId,
      token: options?.kmsToken ?? env.KMS_TOKEN,
      publicKey: options?.remotePublicKey ?? env.KMS_PUBLIC_KEY,
    });
  }

  // 4. KMS key ID configured without supported transport: strictly fail closed.
  // Never fall back to local or random key!
  if (kmsKeyId) {
    throw new Error(
      `KMS key '${kmsKeyId}' is configured: configure VAULT_ADDR/VAULT_TOKEN, KMS_ENDPOINT, or pass remoteSignFn and remotePublicKey. Refusing to sign with any local or random key (FR-S7, P7-08).`,
    );
  }

  // 5. Explicit local secret key (dev/staging only when KMS is not configured)
  const localSecret = options?.localSecret ?? env.SELLER_SECRET_KEY ?? env.DELIVERY_SECRET_KEY;
  if (localSecret) {
    return new LocalKeypairSigner(localSecret);
  }

  // 6. Ephemeral keypair fallback for local tests when NO KMS is configured
  return new LocalKeypairSigner(Keypair.random().secret());
}
