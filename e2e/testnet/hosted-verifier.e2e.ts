/**
 * A verdict from the hosted testnet verifier, accepted on-chain (ROADMAP V-10).
 *
 *   GITHUB_TOKEN=… pnpm e2e:hosted-verifier
 *
 * Opens a 1 USDC escrow pact, commits the source and delivered documents to the public
 * testnet evidence store (Pactwright/pactwright-evidence, `<pact_id>/<sha256>`), asks the hosted
 * verifier for a verdict with the seller's signed delivery receipt, then sends the verifier's
 * attestation to `record_verdict` and settles. Nothing here holds the verifier key: the contract
 * accepts the attestation only if the hosted service signed it with the key the pact trusts.
 */
import { createHash, randomBytes } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";
import { Asset, BASE_FEE, Keypair, Networks, Operation, TransactionBuilder, rpc, type xdr } from "@stellar/stellar-sdk";
import { basicNodeSigner, type AssembledTransaction } from "@stellar/stellar-sdk/contract";
import type { contract } from "@stellar/stellar-sdk";
import { Client as PactClient, Silence, Verdict } from "@pactwright/contracts-client";
import { conditionHash, deliveryMessage, fromStroops, nonceFromIdempotencyKey, pactId as computePactId, toStroops, type PactTerms } from "@pactwright/core";
import { handleAutoSettle, type ChainOptions } from "@pactwright/seller";
import { SOURCE_EN, TRANSLATIONS, render } from "../../services/verifier/eval/real/corpus.ts";

const RPC_URL = process.env.STELLAR_RPC_URL ?? "https://soroban-testnet.stellar.org";
const PASSPHRASE = Networks.TESTNET;
const PACT_CONTRACT_ID = process.env.PACT_CONTRACT_ID ?? "CDUXJJUNYFILEYHE3LITANJEKCDFERNAABOSG75OWATFVM776BCMFEV6";
const USDC = new Asset("USDC", "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5");
const VERIFIER_URL = process.env.E2E_VERIFIER_URL ?? "https://pactwright-verifier-testnet.onrender.com";
const EVIDENCE_REPO = process.env.E2E_EVIDENCE_REPO ?? "Pactwright/pactwright-evidence";
const EVIDENCE_BUCKET_URL = `https://raw.githubusercontent.com/${EVIDENCE_REPO}/main/`;
const CONDITION = { kind: "document.translation", lang: "pt", minPages: 4, maxUntranslatedSegments: 0 };
const HERE = dirname(fileURLToPath(import.meta.url));
const server = new rpc.Server(RPC_URL);
const log = (msg: string): void => console.error(`hosted-verifier: ${msg}`);
const sha256 = (data: Uint8Array): string => createHash("sha256").update(data).digest("hex");

async function send(kp: Keypair, op: xdr.Operation): Promise<void> {
  const tx = new TransactionBuilder(await server.getAccount(kp.publicKey()), { fee: BASE_FEE, networkPassphrase: PASSPHRASE })
    .addOperation(op)
    .setTimeout(60)
    .build();
  tx.sign(kp);
  const sent = await server.sendTransaction(tx);
  if (sent.status === "ERROR") throw new Error(`transaction rejected: ${sent.errorResult?.toXDR("base64")}`);
  const final = await server.pollTransaction(sent.hash, { attempts: 30 });
  if (final.status !== rpc.Api.GetTransactionStatus.SUCCESS) throw new Error(`transaction ${sent.hash} ${final.status}`);
}

async function newAccount(name: string, xlmForUsdc: string): Promise<Keypair> {
  const kp = Keypair.random();
  await server.requestAirdrop(kp.publicKey());
  await send(kp, Operation.changeTrust({ asset: USDC }));
  await send(
    kp,
    Operation.pathPaymentStrictSend({ sendAsset: Asset.native(), sendAmount: xlmForUsdc, destination: kp.publicKey(), destAsset: USDC, destMin: "1", path: [] }),
  );
  log(`${name} ${kp.publicKey()} funded with testnet USDC`);
  return kp;
}

function pactClient(kp: Keypair): PactClient {
  return new PactClient({ contractId: PACT_CONTRACT_ID, networkPassphrase: PASSPHRASE, rpcUrl: RPC_URL, publicKey: kp.publicKey(), ...basicNodeSigner(kp, PASSPHRASE) });
}

async function sendCall<T>(assembled: AssembledTransaction<T | contract.Result<T>>, label: string): Promise<{ value: T; tx: string; ledger: number }> {
  const sent = await assembled.signAndSend();
  const hash = sent.sendTransactionResponse?.hash;
  const final = sent.getTransactionResponse;
  if (!hash || final?.status !== rpc.Api.GetTransactionStatus.SUCCESS) throw new Error(`${label}: transaction did not succeed`);
  const result = sent.result as T | contract.Result<T>;
  const value = typeof result === "object" && result !== null && "unwrap" in result ? (result as contract.Result<T>).unwrap() : (result as T);
  return { value, tx: hash, ledger: final.ledger };
}

/** Commits one blob to the evidence store and waits until the public URL serves it. */
async function putEvidence(token: string, path: string, data: Buffer): Promise<void> {
  const res = await fetch(`https://api.github.com/repos/${EVIDENCE_REPO}/contents/${path}`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" },
    body: JSON.stringify({
      message: `evidence: ${path}`,
      content: data.toString("base64"),
      committer: { name: "Allison", email: "muyideenallison@gmail.com" },
    }),
  });
  if (!res.ok) throw new Error(`evidence upload failed: HTTP ${res.status} for ${path}`);
  for (let i = 0; i < 30; i++) {
    const got = await fetch(EVIDENCE_BUCKET_URL + path, { cache: "no-store" });
    if (got.ok && sha256(new Uint8Array(await got.arrayBuffer())) === path.split("/")[1]) return;
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error(`evidence not served at ${EVIDENCE_BUCKET_URL}${path}`);
}

it.skipIf(!process.env.GITHUB_TOKEN)(
  "a verdict from the hosted verifier is accepted by record_verdict and settles",
  async () => {
    const token = process.env.GITHUB_TOKEN!;
    const health = (await (await fetch(`${VERIFIER_URL}/health`, { signal: AbortSignal.timeout(180_000) })).json()) as { verifierHex: string };
    log(`hosted verifier ${health.verifierHex}`);

    const buyer = await newAccount("buyer", "30");
    const seller = await newAccount("seller", "5");

    // The escrow pact: 1 USDC locked until a verdict, refunded on silence.
    const nonce = nonceFromIdempotencyKey(`hosted-verifier-${randomBytes(8).toString("hex")}`);
    const condHash = conditionHash(CONDITION);
    const now = (await server.getLatestLedger()).sequence;
    const open = await sendCall<Buffer>(
      await pactClient(buyer).open({
        params: {
          buyer: buyer.publicKey(),
          seller: seller.publicKey(),
          cap: toStroops("1"),
          nonce,
          condition_hash: Buffer.from(condHash, "hex"),
          meter: { tag: "None", values: undefined },
          silence: Silence.Refund,
          verdict_deadline: now + 360,
          settle_deadline: now + 720,
        },
      }),
      "open",
    );
    const pactId = Buffer.from(open.value).toString("hex");
    expect(pactId).toBe(computePactId(buyer.publicKey(), seller.publicKey(), nonce, condHash));
    log(`pact ${pactId} opened at ledger ${open.ledger} (${open.tx})`);

    // The buyer's source and the seller's delivery, in the public testnet evidence store.
    const source = Buffer.from(render(SOURCE_EN), "utf8");
    const delivered = Buffer.from(render(TRANSLATIONS.pt!), "utf8");
    const createdAt = new Date().toISOString();
    const evidence = [
      { blob: source, uploader: buyer.publicKey() },
      { blob: delivered, uploader: seller.publicKey() },
    ].map(({ blob, uploader }) => ({
      type: "document" as const,
      uri: `${pactId}/${sha256(blob)}`,
      sha256: sha256(blob),
      mimeType: "text/plain; charset=utf-8",
      uploader,
      createdAt,
    }));
    await putEvidence(token, evidence[0]!.uri, source);
    await putEvidence(token, evidence[1]!.uri, delivered);
    log(`evidence committed to ${EVIDENCE_REPO}/${pactId}/`);

    const terms: PactTerms = {
      pactId,
      mode: "escrow",
      buyer: buyer.publicKey(),
      seller: seller.publicKey(),
      resourceUrl: "https://e2e.pactwright.invalid/translate",
      cap: "1",
      nonce: nonce.toString(),
      conditionHash: condHash,
      condition: CONDITION,
      verifier: health.verifierHex,
      deliveryKey: seller.rawPublicKey().toString("hex"),
      metered: false,
      refundWindowLedgers: 0,
    };
    const receiptSig = seller.sign(Buffer.from(deliveryMessage(pactId, evidence[1]!.sha256))).toString("base64");

    // The hosted verifier reads the evidence with its model, applies the rules and signs.
    const res = await fetch(`${VERIFIER_URL}/v1/verdicts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ terms, evidence, deliveryReceipt: `sha256=${evidence[1]!.sha256}; sig=${receiptSig}`, milestone: "delivery" }),
      signal: AbortSignal.timeout(300_000),
    });
    const body = (await res.json()) as {
      envelopeRef?: string;
      amount?: string;
      attestation?: { attestation: { pactId: string; conditionHash: string; envelopeHash: string; verdict: string; amount: string; issuedLedger: number }; signature: string };
    };
    if (res.status !== 201) throw new Error(`verifier returned HTTP ${res.status}: ${JSON.stringify(body)}`);
    const a = body.attestation!;
    log(`verdict ${a.attestation.verdict} ${fromStroops(BigInt(a.attestation.amount))} at issued_ledger ${a.attestation.issuedLedger}; envelope ${body.envelopeRef}`);
    expect(a.attestation.verdict).toBe("ALLOW");
    expect(a.attestation.issuedLedger).toBeGreaterThanOrEqual(open.ledger);

    // The contract checks the verifier's signature, the pact, the condition and the ledger.
    const recorded = await sendCall(
      await pactClient(seller).record_verdict({
        pact_id: Buffer.from(pactId, "hex"),
        attestation: {
          pact_id: Buffer.from(a.attestation.pactId, "hex"),
          condition_hash: Buffer.from(a.attestation.conditionHash, "hex"),
          envelope_hash: Buffer.from(a.attestation.envelopeHash, "hex"),
          verdict: a.attestation.verdict === "ALLOW" ? Verdict.Allow : Verdict.Deny,
          amount: BigInt(a.attestation.amount),
          issued_ledger: a.attestation.issuedLedger,
        },
        signature: Buffer.from(a.signature, "base64"),
      }),
      "record_verdict",
    );
    log(`record_verdict accepted at ledger ${recorded.ledger} (${recorded.tx})`);

    const chain: ChainOptions = {
      rpcUrl: RPC_URL,
      networkPassphrase: PASSPHRASE,
      source: seller.publicKey(),
      sign: (env, passphrase) => {
        const tx = TransactionBuilder.fromXDR(env, passphrase);
        tx.sign(seller);
        return tx.toXDR();
      },
    };
    const settled = await handleAutoSettle(
      { pactId, verdict: "allow", allowedAmount: fromStroops(BigInt(a.attestation.amount)) },
      { chain, pactContractId: PACT_CONTRACT_ID },
    );
    expect(settled.txHash).toMatch(/^[0-9a-f]{64}$/);
    log(`settled (${settled.txHash})`);

    const report = {
      date: new Date().toISOString(),
      verifier: VERIFIER_URL,
      verifierHex: health.verifierHex,
      pactId,
      evidence: evidence.map((e) => EVIDENCE_BUCKET_URL + e.uri),
      envelopeRef: body.envelopeRef,
      verdict: a.attestation.verdict,
      amount: fromStroops(BigInt(a.attestation.amount)),
      issuedLedger: a.attestation.issuedLedger,
      openTx: open.tx,
      recordVerdictTx: recorded.tx,
      settleTx: settled.txHash,
    };
    mkdirSync(join(HERE, "results"), { recursive: true });
    writeFileSync(join(HERE, "results", `hosted-verifier-${report.date.slice(0, 10)}.json`), JSON.stringify(report, null, 2) + "\n");
  },
  900_000,
);
