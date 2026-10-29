/**
 * Real testnet run of every MVP scenario in ARCHITECTURE §13 (ROADMAP K-16, L-01).
 *
 *   E2E_VERIFIER_SECRET=S… pnpm e2e:testnet
 *
 * Every step is a real transaction on Stellar testnet against the deployed `pact` contract and
 * real testnet USDC. The Kit's own code does the work: `@pactwright/core` hashing, the
 * verifier's `document.translation` rules and `signVerdict`, `@pactwright/contracts-client`,
 * and the seller's refund and settle hooks.
 *
 * Not covered here: the model that reads a delivery. Each scenario supplies the reading the
 * model would return (a fixture), so the verdict depends only on the deterministic rules.
 * Fresh buyer and seller accounts are funded by friendbot each run and buy USDC on the
 * testnet DEX. The verifier key must be the one configured in the `pact` contract.
 */
import { createHash, randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  Address,
  Asset,
  BASE_FEE,
  Keypair,
  Operation,
  TransactionBuilder,
  Networks,
  rpc,
  type xdr,
} from "@stellar/stellar-sdk";
import { basicNodeSigner, type AssembledTransaction } from "@stellar/stellar-sdk/contract";
import type { contract } from "@stellar/stellar-sdk";
import {
  conditionHash,
  fromStroops,
  nonceFromIdempotencyKey,
  pactId as computePactId,
  receiptLeaf,
  toStroops,
  type PactTerms,
} from "@pactwright/core";
import { Client as PactClient, Silence, Verdict } from "@pactwright/contracts-client";
import {
  createRefundSigner,
  handleAutoSettle,
  handleDisputeRefund,
  handleM0Refund,
  invokeContract,
  scv,
  type ChainOptions,
} from "@pactwright/seller";
import { challengeNonDelivery, decideDocumentTranslation, signVerdict } from "@pactwright/verifier";

// ---- configuration ----------------------------------------------------------
const RPC_URL = process.env.STELLAR_RPC_URL ?? "https://soroban-testnet.stellar.org";
const PASSPHRASE = Networks.TESTNET;
const PACT_CONTRACT_ID = process.env.PACT_CONTRACT_ID ?? "CDUXJJUNYFILEYHE3LITANJEKCDFERNAABOSG75OWATFVM776BCMFEV6";
const USDC_SAC_ID = process.env.USDC_SAC_ID ?? "CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA";
const USDC = new Asset("USDC", "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5");
const REFUND_VAULT_WASM_SHA256 = "2be8571d61d92f1bf673854acda3db6e06e9ba6cff5b4205edec31627cbc374e";
const REFUND_WINDOW_LEDGERS = 17_280; // ~1 day
const HERE = dirname(fileURLToPath(import.meta.url));

const verifierSecret = process.env.E2E_VERIFIER_SECRET;
if (!verifierSecret) throw new Error("E2E_VERIFIER_SECRET is not set (the pact contract's verifier key)");
const verifier = Keypair.fromSecret(verifierSecret);
const server = new rpc.Server(RPC_URL);
const runId = new Date().toISOString().replace(/[:.]/g, "-");
const log = (msg: string): void => console.error(`e2e: ${msg}`);

// ---- transactions -------------------------------------------------------------
interface Step {
  label: string;
  tx: string;
  ledger: number;
}

function signerFor(kp: Keypair): (envelope: string, passphrase: string) => string {
  return (envelope, passphrase) => {
    const tx = TransactionBuilder.fromXDR(envelope, passphrase);
    tx.sign(kp);
    return tx.toXDR();
  };
}

function chainFor(kp: Keypair): ChainOptions {
  return { rpcUrl: RPC_URL, networkPassphrase: PASSPHRASE, source: kp.publicKey(), sign: signerFor(kp) };
}

/** Sends one operation (classic or Soroban) and waits for it. */
async function send(kp: Keypair, op: xdr.Operation, soroban = false): Promise<Step & { returnValue?: xdr.ScVal }> {
  const account = await server.getAccount(kp.publicKey());
  let tx = new TransactionBuilder(account, { fee: BASE_FEE, networkPassphrase: PASSPHRASE }).addOperation(op).setTimeout(60).build();
  if (soroban) tx = await server.prepareTransaction(tx);
  tx.sign(kp);
  const sent = await server.sendTransaction(tx);
  if (sent.status === "ERROR") throw new Error(`transaction rejected: ${sent.errorResult?.toXDR("base64")}`);
  const final = await server.pollTransaction(sent.hash, { attempts: 30 });
  if (final.status !== rpc.Api.GetTransactionStatus.SUCCESS) throw new Error(`transaction ${sent.hash} ${final.status}`);
  return { label: "", tx: sent.hash, ledger: final.ledger, returnValue: final.returnValue };
}

async function ledgerOf(hash: string): Promise<number> {
  const tx = await server.getTransaction(hash);
  if (tx.status !== rpc.Api.GetTransactionStatus.SUCCESS) throw new Error(`transaction ${hash} ${tx.status}`);
  return tx.ledger;
}

async function latestLedger(): Promise<number> {
  return (await server.getLatestLedger()).sequence;
}

async function waitForLedger(target: number): Promise<void> {
  while ((await latestLedger()) <= target) await new Promise((r) => setTimeout(r, 2000));
}

function pactClient(kp: Keypair): PactClient {
  return new PactClient({
    contractId: PACT_CONTRACT_ID,
    networkPassphrase: PASSPHRASE,
    rpcUrl: RPC_URL,
    publicKey: kp.publicKey(),
    ...basicNodeSigner(kp, PASSPHRASE),
  });
}

/** Signs and sends an assembled contract call; returns its result and the transaction. */
async function sendCall<T>(assembled: AssembledTransaction<T | contract.Result<T>>, label: string): Promise<{ value: T; step: Step }> {
  const sent = await assembled.signAndSend();
  const hash = sent.sendTransactionResponse?.hash;
  const final = sent.getTransactionResponse;
  if (!hash || final?.status !== rpc.Api.GetTransactionStatus.SUCCESS) throw new Error(`${label}: transaction did not succeed`);
  const result = sent.result;
  const value = isResult(result) ? result.unwrap() : result;
  return { value, step: { label, tx: hash, ledger: final.ledger } };
}

function isResult<T>(r: T | contract.Result<T>): r is contract.Result<T> {
  return typeof r === "object" && r !== null && "unwrap" in r && typeof r.unwrap === "function";
}

// ---- accounts ------------------------------------------------------------------
async function newAccount(name: string, xlmForUsdc: string): Promise<Keypair> {
  const kp = Keypair.random();
  await server.requestAirdrop(kp.publicKey());
  await send(kp, Operation.changeTrust({ asset: USDC }));
  await send(
    kp,
    Operation.pathPaymentStrictSend({
      sendAsset: Asset.native(),
      sendAmount: xlmForUsdc,
      destination: kp.publicKey(),
      destAsset: USDC,
      destMin: "1",
      path: [],
    }),
  );
  log(`${name} ${kp.publicKey()} funded with testnet USDC`);
  return kp;
}

async function deployRefundVault(seller: Keypair): Promise<string> {
  const wasm = readFileSync(join(HERE, "..", "fixtures", "refund_vault.wasm"));
  const hash = createHash("sha256").update(wasm).digest();
  if (hash.toString("hex") !== REFUND_VAULT_WASM_SHA256) throw new Error("refund_vault.wasm hash mismatch");
  await send(seller, Operation.uploadContractWasm({ wasm }), true);
  const created = await send(
    seller,
    Operation.createCustomContract({ address: Address.fromString(seller.publicKey()), wasmHash: hash, salt: randomBytes(32) }),
    true,
  );
  const vault = Address.fromScVal(created.returnValue!).toString();
  const chain = chainFor(seller);
  await invokeContract(chain, vault, "initialize", [
    scv.address(seller.publicKey()),
    scv.address(USDC_SAC_ID),
    scv.u32(REFUND_WINDOW_LEDGERS),
  ]);
  await invokeContract(chain, vault, "deposit", [scv.address(seller.publicKey()), scv.i128(toStroops("3"))]);
  log(`RefundVault ${vault} (Accensa v0.2.0) funded with 3 USDC`);
  return vault;
}

// ---- verdicts ------------------------------------------------------------------
const CONDITION = { kind: "document.translation", lang: "pt", minPages: 4, maxUntranslatedSegments: 0 };
const COND_HASH = conditionHash(CONDITION);

type Reading = Parameters<typeof decideDocumentTranslation>[0];
const READINGS: Record<string, Reading> = {
  complete: { detectedLanguage: "pt-BR", pageCount: 4, isTranslationOfSource: true, untranslatedSegments: 0, notes: "fixture" },
  partial: { detectedLanguage: "pt", pageCount: 3, isTranslationOfSource: true, untranslatedSegments: 0, notes: "fixture" },
  half: { detectedLanguage: "pt", pageCount: 2, isTranslationOfSource: true, untranslatedSegments: 0, notes: "fixture" },
  wrongLanguage: { detectedLanguage: "es", pageCount: 4, isTranslationOfSource: true, untranslatedSegments: 0, notes: "fixture" },
};

function terms(mode: "exact-refund" | "escrow", buyer: Keypair, seller: Keypair, nonce: bigint, cap: string): PactTerms {
  return {
    pactId: computePactId(buyer.publicKey(), seller.publicKey(), nonce, COND_HASH),
    mode,
    buyer: buyer.publicKey(),
    seller: seller.publicKey(),
    resourceUrl: "https://e2e.pactwright.invalid/translate",
    cap,
    nonce: nonce.toString(),
    conditionHash: COND_HASH,
    condition: CONDITION,
    verifier: verifier.rawPublicKey().toString("hex"),
    metered: false,
    refundWindowLedgers: REFUND_WINDOW_LEDGERS,
  };
}

async function verdictFor(t: PactTerms, reading: Reading, milestone: "delivery" | `dispute-${number}`, ledger: number) {
  const decision = decideDocumentTranslation(reading, CONDITION, toStroops(t.cap));
  const delivered = Buffer.from(`delivery for ${t.pactId} (${reading.pageCount} pages, ${reading.detectedLanguage})`);
  const signed = await signVerdict({
    terms: t,
    decision,
    evidence: [
      {
        type: "document",
        uri: `e2e://${t.pactId}/delivery.txt`,
        sha256: createHash("sha256").update(delivered).digest("hex"),
        mimeType: "text/plain",
        uploader: t.buyer,
        createdAt: new Date().toISOString(),
      },
    ],
    verifierKey: verifier,
    milestone,
    ledgerSeq: ledger,
  });
  return { decision, signed };
}

// ---- scenarios -----------------------------------------------------------------
interface ScenarioResult {
  scenario: string;
  mode: "M0" | "M2";
  outcome: string;
  pactId: string;
  toSeller: string;
  toBuyer: string;
  receiptLeaf: string;
  steps: Step[];
}

const results: ScenarioResult[] = [];
const nonceFor = (name: string): bigint => nonceFromIdempotencyKey(`e2e-${runId}-${name}`);

async function pay(buyer: Keypair, seller: Keypair, amount: string, label: string): Promise<Step> {
  const step = await invokeContract(chainFor(buyer), USDC_SAC_ID, "transfer", [
    scv.address(buyer.publicKey()),
    scv.address(seller.publicKey()),
    scv.i128(toStroops(amount)),
  ]);
  return { label, tx: step.txHash, ledger: step.ledger };
}

async function m0(name: string, buyer: Keypair, seller: Keypair, vault: string, price: string, reading: Reading | "no-delivery") {
  const t = terms("exact-refund", buyer, seller, nonceFor(name), price);
  const paid = await pay(buyer, seller, price, "x402 exact payment to seller");
  const steps = [paid];

  let verdict: "allow" | "deny";
  let allowed: string | undefined;
  let envelopeHash: string | null = null;
  if (reading === "no-delivery") {
    // The seller never delivers: the challenge webhook doesn't answer in time, so DENY.
    const challenge = await challengeNonDelivery(t.pactId, { sellerWebhookUrl: "http://127.0.0.1:9/never-answers", timeoutMs: 2000 });
    if (challenge.status !== "deny") throw new Error(`${name}: expected a non-delivery DENY`);
    verdict = "deny";
  } else {
    const { decision, signed } = await verdictFor(t, reading, "delivery", paid.ledger);
    verdict = decision.verdict === "ALLOW" ? "allow" : "deny";
    allowed = decision.verdict === "ALLOW" ? fromStroops(decision.amount) : undefined;
    envelopeHash = signed.envelopeSha256;
  }

  const refund = await handleM0Refund(
    { pactId: t.pactId, buyer: buyer.publicKey(), price, verdict, allowedAmount: allowed, paidAtLedger: paid.ledger },
    { refundVaultId: vault, chain: { ...chainFor(seller), sign: refundSignerFor(seller) } },
  );
  if (refund.txHash) steps.push({ label: "RefundVault.refund", tx: refund.txHash, ledger: refund.ledger! });
  const toBuyer = refund.refunded ? toStroops(refund.refundAmount) : 0n;
  const toSeller = toStroops(price) - toBuyer;
  results.push({
    scenario: name,
    mode: "M0",
    outcome: toBuyer === 0n ? `ALLOW, seller keeps ${price}` : `${verdict.toUpperCase()}, ${fromStroops(toBuyer)} refunded`,
    pactId: t.pactId,
    toSeller: fromStroops(toSeller),
    toBuyer: fromStroops(toBuyer),
    receiptLeaf: receiptLeaf({
      pactId: t.pactId,
      transition: toBuyer > 0n ? "refunded" : "paid",
      toSeller,
      toBuyer,
      envelopeHash,
      ledger: steps.at(-1)!.ledger,
    }),
    steps,
  });
  log(`${name}: ${results.at(-1)!.outcome}`);
  return { t, paid };
}

/** The seller's refund key may only sign `RefundVault.refund`; the refund signer enforces that. */
function refundSignerFor(seller: Keypair) {
  const signer = createRefundSigner(seller.secret());
  return (envelope: string, passphrase: string) => signer.signTransaction(envelope, passphrase);
}

async function m2Open(name: string, buyer: Keypair, seller: Keypair, verdictLedgers: number, settleLedgers: number) {
  const nonce = nonceFor(name);
  const t = terms("escrow", buyer, seller, nonce, "1");
  const now = await latestLedger();
  const open = await sendCall<Buffer>(
    await pactClient(buyer).open({
      params: {
        buyer: buyer.publicKey(),
        seller: seller.publicKey(),
        cap: toStroops("1"),
        nonce,
        condition_hash: Buffer.from(COND_HASH, "hex"),
        meter: { tag: "None", values: undefined },
        silence: Silence.Refund,
        verdict_deadline: now + verdictLedgers,
        settle_deadline: now + settleLedgers,
      },
    }),
    "open (1 USDC locked in escrow)",
  );
  const onChainId = Buffer.from(open.value).toString("hex");
  if (onChainId !== t.pactId) throw new Error(`${name}: Kit pact_id ${t.pactId} != contract ${onChainId}`);
  return { t, open: open.step, verdictDeadline: now + verdictLedgers };
}

async function recordVerdict(seller: Keypair, t: PactTerms, reading: Reading, openLedger: number) {
  const { decision, signed } = await verdictFor(t, reading, "delivery", openLedger);
  const a = signed.attestation!;
  const recorded = await sendCall(
    await pactClient(seller).record_verdict({
      pact_id: Buffer.from(t.pactId, "hex"),
      attestation: {
        pact_id: Buffer.from(a.attestation.pactId, "hex"),
        condition_hash: Buffer.from(a.attestation.conditionHash, "hex"),
        envelope_hash: Buffer.from(a.attestation.envelopeHash, "hex"),
        verdict: decision.verdict === "ALLOW" ? Verdict.Allow : Verdict.Deny,
        amount: BigInt(a.attestation.amount),
        issued_ledger: a.attestation.issuedLedger,
      },
      signature: Buffer.from(a.signature, "base64"),
    }),
    `record_verdict (${decision.verdict}${decision.verdict === "ALLOW" ? ` ${fromStroops(decision.amount)}` : ""}, verifier-signed)`,
  );
  return { decision, envelopeHash: signed.envelopeSha256, step: recorded.step };
}

export async function main(): Promise<void> {
  const buyer = await newAccount("buyer", "80");
  const config = await pactClient(buyer).get_config();
  const onChainVerifier = Buffer.from(config.result.unwrap().verifier).toString("hex");
  if (onChainVerifier !== verifier.rawPublicKey().toString("hex")) {
    throw new Error("E2E_VERIFIER_SECRET is not the verifier configured in the pact contract");
  }

  const seller = await newAccount("seller", "40");
  const vault = await deployRefundVault(seller);

  // M0: paid up front; the seller's RefundVault refunds on DENY or a short delivery.
  const m0Allow = await m0("M0 ALLOW", buyer, seller, vault, "1", READINGS.complete!);
  await m0("M0 DENY", buyer, seller, vault, "1", READINGS.wrongLanguage!);
  await m0("M0 non-delivery", buyer, seller, vault, "0.5", "no-delivery");

  // M2 ALLOW (partial): 3 of 4 pages → 0.75 to the seller, 0.25 back, via the seller's auto-settle hook.
  {
    const { t, open } = await m2Open("M2 ALLOW", buyer, seller, 120, 720);
    const v = await recordVerdict(seller, t, READINGS.partial!, open.ledger);
    const settled = await handleAutoSettle(
      { pactId: t.pactId, verdict: "allow", allowedAmount: fromStroops(v.decision.amount) },
      { chain: chainFor(seller), pactContractId: PACT_CONTRACT_ID },
    );
    const settleStep = { label: "settle (0.75 to seller, 0.25 back to buyer)", tx: settled.txHash!, ledger: await ledgerOf(settled.txHash!) };
    push("M2 ALLOW", "M2", "ALLOW 0.75 of 1, settled", t, v.decision.amount, toStroops("1") - v.decision.amount, "settled", v.envelopeHash, [open, v.step, settleStep]);
  }

  // M2 DENY: wrong language → the whole cap goes back.
  {
    const { t, open } = await m2Open("M2 DENY", buyer, seller, 120, 720);
    const v = await recordVerdict(seller, t, READINGS.wrongLanguage!, open.ledger);
    const released = await sendCall(await pactClient(buyer).release({ pact_id: Buffer.from(t.pactId, "hex") }), "release (1 USDC back to buyer)");
    push("M2 DENY", "M2", "DENY, full refund", t, 0n, toStroops("1"), "released", v.envelopeHash, [open, v.step, released.step]);
  }

  // M2 silence: no verdict by the verdict deadline; Silence::Refund lets anyone release.
  {
    const { t, open, verdictDeadline } = await m2Open("M2 silence", buyer, seller, 6, 720);
    log(`M2 silence: waiting for ledger ${verdictDeadline + 1}`);
    await waitForLedger(verdictDeadline);
    const released = await sendCall(await pactClient(seller).release({ pact_id: Buffer.from(t.pactId, "hex") }), "release after the verdict deadline (silence = Refund)");
    push("M2 silence", "M2", "no verdict, refunded by silence policy", t, 0n, toStroops("1"), "released", null, [open, released.step]);
  }

  // Dispute on the M0 ALLOW purchase: re-verification finds 2 of 4 pages → 0.5 refunded.
  {
    const { t, paid } = m0Allow;
    const { decision, signed } = await verdictFor(t, READINGS.half!, "dispute-1", paid.ledger);
    const res = await handleDisputeRefund(
      {
        pactId: t.pactId,
        buyer: buyer.publicKey(),
        price: "1",
        verdict: "allow",
        allowedAmount: fromStroops(decision.amount),
        envelopeHash: signed.envelopeSha256,
        ledger: paid.ledger,
      },
      { refundVaultId: vault, chain: { ...chainFor(seller), sign: refundSignerFor(seller) } },
    );
    if (!res.txHash) throw new Error(`dispute refund not submitted: ${res.error}`);
    const step = { label: "RefundVault.refund (dispute-1)", tx: res.txHash, ledger: await ledgerOf(res.txHash) };
    results.push({
      scenario: "Dispute refund",
      mode: "M0",
      outcome: `dispute-1: 2 of 4 pages, ${res.refundAmount} refunded`,
      pactId: t.pactId,
      toSeller: fromStroops(toStroops("1") - toStroops(res.refundAmount)),
      toBuyer: res.refundAmount,
      receiptLeaf: res.receiptLeaf,
      steps: [step],
    });
    log(`Dispute refund: ${results.at(-1)!.outcome}`);
  }

  // ---- report ----
  const report = {
    network: "testnet",
    runAt: new Date().toISOString(),
    pactContract: PACT_CONTRACT_ID,
    usdc: USDC_SAC_ID,
    refundVault: vault,
    buyer: buyer.publicKey(),
    seller: seller.publicKey(),
    verifier: verifier.publicKey(),
    modelReading: "fixture (rules, signing and every transaction are real)",
    scenarios: results,
  };
  const outDir = join(HERE, "..", "results");
  mkdirSync(outDir, { recursive: true });
  const file = join(outDir, `${report.runAt.slice(0, 10)}.json`);
  writeFileSync(file, JSON.stringify(report, null, 2) + "\n");
  console.log(markdown(report));
  log(`report: ${file}`);
}

function push(
  scenario: string,
  mode: "M0" | "M2",
  outcome: string,
  t: PactTerms,
  toSeller: bigint,
  toBuyer: bigint,
  transition: "settled" | "released",
  envelopeHash: string | null,
  steps: Step[],
): void {
  results.push({
    scenario,
    mode,
    outcome,
    pactId: t.pactId,
    toSeller: fromStroops(toSeller),
    toBuyer: fromStroops(toBuyer),
    receiptLeaf: receiptLeaf({ pactId: t.pactId, transition, toSeller, toBuyer, envelopeHash, ledger: steps.at(-1)!.ledger }),
    steps,
  });
  log(`${scenario}: ${outcome}`);
}

function markdown(report: { scenarios: ScenarioResult[] }): string {
  const rows = report.scenarios.flatMap((s) =>
    s.steps.map(
      (st, i) =>
        `| ${i === 0 ? `**${s.scenario}**` : ""} | ${i === 0 ? s.outcome : ""} | ${st.label} | [\`${st.tx.slice(0, 8)}…\`](https://stellar.expert/explorer/testnet/tx/${st.tx}) |`,
    ),
  );
  return ["| Scenario | Outcome | Step | Transaction |", "|---|---|---|---|", ...rows].join("\n");
}

