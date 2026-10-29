/**
 * A RefundVault refund signed through a real KMS (ROADMAP P7-08, FR-S7).
 *
 *   VAULT_ADDR=… VAULT_TOKEN=… KMS_KEY_ID=vault:<transit key> pnpm e2e:kms
 *
 * The RefundVault's merchant is the Vault transit key (ed25519): its private key exists only
 * inside Vault. Every merchant transaction (trustline, deposit, refund) is signed through
 * `resolveKmsSigner`, and the refund itself is sent by the seller's `handleM0Refund`. Stellar
 * accepts them only if Vault produced valid signatures for that key.
 */
import { createHash, randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";
import { Address, Asset, BASE_FEE, Keypair, Networks, Operation, TransactionBuilder, rpc, type xdr } from "@stellar/stellar-sdk";
import { toStroops } from "@pactwright/core";
import { handleM0Refund, invokeContract, resolveKmsSigner, scv, type ChainOptions } from "@pactwright/seller";

const RPC_URL = process.env.STELLAR_RPC_URL ?? "https://soroban-testnet.stellar.org";
const USDC_SAC_ID = "CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA";
const USDC = new Asset("USDC", "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5");
const WASM_SHA256 = "2be8571d61d92f1bf673854acda3db6e06e9ba6cff5b4205edec31627cbc374e";
const HERE = dirname(fileURLToPath(import.meta.url));
const server = new rpc.Server(RPC_URL);

/** Builds one operation, lets `sign` sign the envelope, submits and waits. */
async function submit(source: string, op: xdr.Operation, sign: (env: string) => Promise<string>, soroban = false) {
  let tx = new TransactionBuilder(await server.getAccount(source), { fee: BASE_FEE, networkPassphrase: Networks.TESTNET })
    .addOperation(op)
    .setTimeout(60)
    .build();
  if (soroban) tx = await server.prepareTransaction(tx);
  const signed = TransactionBuilder.fromXDR(await sign(tx.toXDR()), Networks.TESTNET);
  const sent = await server.sendTransaction(signed);
  if (sent.status === "ERROR") throw new Error(`rejected: ${sent.errorResult?.toXDR("base64")}`);
  const final = await server.pollTransaction(sent.hash, { attempts: 30 });
  if (final.status !== rpc.Api.GetTransactionStatus.SUCCESS) throw new Error(`${sent.hash} ${final.status}`);
  return { hash: sent.hash, returnValue: final.returnValue };
}

const localSign = (kp: Keypair) => async (env: string) => {
  const tx = TransactionBuilder.fromXDR(env, Networks.TESTNET);
  tx.sign(kp);
  return tx.toXDR();
};

it.skipIf(!process.env.VAULT_ADDR || !process.env.KMS_KEY_ID)(
  "a RefundVault refund signed by a Vault transit key lands on testnet",
  async () => {
    const kms = resolveKmsSigner();
    expect(kms.isRemote()).toBe(true);
    const merchant = await kms.getPublicKey();
    const kmsSign = (env: string, passphrase = Networks.TESTNET) => kms.signTransaction(env, passphrase);

    // Accounts: the merchant (Vault key) and a buyer who will receive the refund.
    await server.requestAirdrop(merchant);
    await submit(merchant, Operation.changeTrust({ asset: USDC }), (env) => kmsSign(env));
    const helper = Keypair.random();
    await server.requestAirdrop(helper.publicKey());
    await submit(helper.publicKey(), Operation.changeTrust({ asset: USDC }), localSign(helper));
    // Testnet USDC for the merchant's float, bought on the DEX.
    await submit(
      helper.publicKey(),
      Operation.pathPaymentStrictSend({ sendAsset: Asset.native(), sendAmount: "30", destination: merchant, destAsset: USDC, destMin: "1", path: [] }),
      localSign(helper),
    );

    // A fresh Accensa RefundVault (v0.2.0) whose merchant is the Vault key.
    const wasm = readFileSync(join(HERE, "fixtures", "refund_vault.wasm"));
    const wasmHash = createHash("sha256").update(wasm).digest();
    expect(wasmHash.toString("hex")).toBe(WASM_SHA256);
    await submit(helper.publicKey(), Operation.uploadContractWasm({ wasm }), localSign(helper), true);
    const created = await submit(
      helper.publicKey(),
      Operation.createCustomContract({ address: Address.fromString(helper.publicKey()), wasmHash, salt: randomBytes(32) }),
      localSign(helper),
      true,
    );
    const vault = Address.fromScVal(created.returnValue!).toString();
    const helperChain: ChainOptions = { rpcUrl: RPC_URL, networkPassphrase: Networks.TESTNET, source: helper.publicKey(), sign: localSign(helper) };
    await invokeContract(helperChain, vault, "initialize", [scv.address(merchant), scv.address(USDC_SAC_ID), scv.u32(17_280)]);

    // Merchant transactions are signed only by Vault.
    const merchantChain: ChainOptions = { rpcUrl: RPC_URL, networkPassphrase: Networks.TESTNET, source: merchant, sign: kmsSign };
    await invokeContract(merchantChain, vault, "deposit", [scv.address(merchant), scv.i128(toStroops("2"))]);

    const buyer = helper.publicKey();
    const refund = await handleM0Refund(
      {
        pactId: randomBytes(32).toString("hex"),
        buyer,
        price: "1",
        verdict: "deny",
        paidAtLedger: (await server.getLatestLedger()).sequence,
      },
      { refundVaultId: vault, chain: merchantChain },
    );
    expect(refund.refunded).toBe(true);
    expect(refund.txHash).toMatch(/^[0-9a-f]{64}$/);

    // The network accepted it, and its only signature is the Vault key's.
    const tx = await server.getTransaction(refund.txHash!);
    expect(tx.status).toBe(rpc.Api.GetTransactionStatus.SUCCESS);
    if (tx.status !== rpc.Api.GetTransactionStatus.SUCCESS) return;
    const signatures = tx.envelopeXdr.v1().signatures();
    expect(signatures).toHaveLength(1);
    expect(Buffer.from(signatures[0]!.hint()).equals(Keypair.fromPublicKey(merchant).signatureHint())).toBe(true);

    const report = { date: new Date().toISOString(), kms: "HashiCorp Vault transit (ed25519)", merchant, refundVault: vault, refundTx: refund.txHash, ledger: tx.ledger };
    mkdirSync(join(HERE, "results"), { recursive: true });
    writeFileSync(join(HERE, "results", `kms-${report.date.slice(0, 10)}.json`), JSON.stringify(report, null, 2) + "\n");
  },
  600_000,
);
