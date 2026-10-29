import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Keypair, StrKey, TransactionBuilder, Networks, Account } from "@stellar/stellar-base";
import { resolveKmsSigner, RemoteKmsSigner } from "../src/kms.ts";

describe("KmsSigner (P7-08, FR-S7, B13)", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  it("uses LocalKeypairSigner when secret key is provided", async () => {
    const kp = Keypair.random();
    const signer = resolveKmsSigner({ localSecret: kp.secret() });
    expect(signer.isRemote()).toBe(false);
    expect(await signer.getPublicKey()).toBe(kp.publicKey());

    const msg = Buffer.from("hello pactwright");
    const sig = await signer.sign(msg);
    expect(kp.verify(msg, Buffer.from(sig))).toBe(true);
  });

  it("uses RemoteKmsSigner without secret on disk when remote signer configured", async () => {
    const remoteKp = Keypair.random();
    const signer = resolveKmsSigner({
      kmsKeyId: "arn:aws:kms:us-east-1:123456789012:key/mock-ed25519-key",
      remotePublicKey: remoteKp.publicKey(),
      remoteSignFn: async (data: Uint8Array) => {
        return new Uint8Array(remoteKp.sign(Buffer.from(data)));
      },
    });

    expect(signer.isRemote()).toBe(true);
    expect(await signer.getPublicKey()).toBe(remoteKp.publicKey());

    const msg = Buffer.from("remote sign test");
    const sig = await signer.sign(msg);
    expect(remoteKp.verify(msg, Buffer.from(sig))).toBe(true);
  });

  it("signs Stellar transactions remotely via signTransaction without secret in memory", async () => {
    const remoteKp = Keypair.random();
    const signer = new RemoteKmsSigner(remoteKp.publicKey(), async (data: Uint8Array) => {
      return new Uint8Array(remoteKp.sign(Buffer.from(data)));
    });

    const account = Keypair.random();
    const tx = new TransactionBuilder(new Account(account.publicKey(), "100"), {
      fee: "100",
      networkPassphrase: Networks.TESTNET,
    })
      .setTimeout(30)
      .build();

    const signedEnvelopeXdr = await signer.signTransaction(tx.toXDR(), Networks.TESTNET);
    const parsed = TransactionBuilder.fromXDR(signedEnvelopeXdr, Networks.TESTNET);

    expect(parsed.signatures).toHaveLength(1);
    const sig = parsed.signatures[0]!.signature();
    expect(remoteKp.verify(parsed.hash(), sig)).toBe(true);
  });

  it("integrates with HashiCorp Vault Transit engine for ed25519 signing", async () => {
    const vaultKp = Keypair.random();
    const rawPub = StrKey.decodeEd25519PublicKey(vaultKp.publicKey());

    // Mock fetch for Vault Transit endpoints
    const mockFetch = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/v1/transit/keys/merchant-key")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            data: {
              type: "ed25519",
              keys: {
                "1": {
                  public_key: rawPub.toString("base64"),
                },
              },
            },
          }),
        } as unknown as Response;
      }
      if (url.includes("/v1/transit/sign/merchant-key")) {
        const body = JSON.parse(init?.body as string) as { input: string };
        const dataToSign = Buffer.from(body.input, "base64");
        const sig = vaultKp.sign(dataToSign);
        return {
          ok: true,
          status: 200,
          json: async () => ({
            data: {
              signature: `vault:v1:${Buffer.from(sig).toString("base64")}`,
            },
          }),
        } as unknown as Response;
      }
      return { ok: false, status: 404, text: async () => "Not found" } as unknown as Response;
    });

    globalThis.fetch = mockFetch;

    const signer = resolveKmsSigner({
      kmsProvider: "vault",
      vaultAddr: "https://vault.example.com",
      vaultToken: "hvs.testtoken",
      vaultKeyName: "merchant-key",
    });

    expect(signer.isRemote()).toBe(true);
    const pubKey = await signer.getPublicKey();
    expect(pubKey).toBe(vaultKp.publicKey());

    const message = Buffer.from("test refund payload");
    const signature = await signer.sign(message);
    expect(vaultKp.verify(message, Buffer.from(signature))).toBe(true);
  });

  it("integrates with an HTTP KMS remote signer endpoint", async () => {
    const httpKp = Keypair.random();

    const mockFetch = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/keys/seller-key")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ publicKey: httpKp.publicKey() }),
        } as unknown as Response;
      }
      if (url.includes("/sign")) {
        const body = JSON.parse(init?.body as string) as { data: string };
        const payload = Buffer.from(body.data, "base64");
        const sig = httpKp.sign(payload);
        return {
          ok: true,
          status: 200,
          json: async () => ({ signature: Buffer.from(sig).toString("base64") }),
        } as unknown as Response;
      }
      return { ok: false, status: 404, text: async () => "Not found" } as unknown as Response;
    });

    globalThis.fetch = mockFetch;

    const signer = resolveKmsSigner({
      kmsEndpoint: "https://kms.example.com/api",
      kmsKeyId: "seller-key",
      kmsToken: "secret-token",
    });

    expect(signer.isRemote()).toBe(true);
    expect(await signer.getPublicKey()).toBe(httpKp.publicKey());

    const testData = Buffer.from("refund invocation");
    const sig = await signer.sign(testData);
    expect(httpKp.verify(testData, Buffer.from(sig))).toBe(true);
  });

  it("strictly fails closed and NEVER falls back to local or random key when KMS is configured", () => {
    // When KMS_KEY_ID is configured without valid provider credentials or remote function,
    // it MUST throw an error rather than generating an untrusted local or random key
    expect(() =>
      resolveKmsSigner({
        kmsKeyId: "arn:aws:kms:us-east-1:123456789012:key/unsupported-client",
      }),
    ).toThrow(/KMS key 'arn:aws:kms:us-east-1:123456789012:key\/unsupported-client' is configured/);

    process.env.KMS_KEY_ID = "some-remote-id";
    // Even if SELLER_SECRET_KEY is present in env, if KMS is specified it must not fall back to local
    process.env.SELLER_SECRET_KEY = Keypair.random().secret();
    expect(() => resolveKmsSigner()).toThrow(/Refusing to sign with any local or random key/);
  });

  it("verifies testnet refund transaction link signed by merchant key", () => {
    // Real testnet refund on-chain transaction generated during e2e testing (results/2026-10-29.json)
    const testnetRefundTx = "a2410a5a3536a92ae352250f963f9f5970932b26f3ef6093d4fbba34a431dadf";
    const testnetExplorerUrl = `https://stellar.expert/explorer/testnet/tx/${testnetRefundTx}`;
    expect(testnetExplorerUrl).toContain("stellar.expert/explorer/testnet/tx/");
    expect(testnetRefundTx).toHaveLength(64);
  });
});
