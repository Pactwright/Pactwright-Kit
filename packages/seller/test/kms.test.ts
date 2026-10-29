import { describe, it, expect } from "vitest";
import { Keypair } from "@stellar/stellar-base";
import { resolveKmsSigner } from "../src/kms.ts";

describe("KmsSigner (P7-08, FR-S7, B13)", () => {
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
});
