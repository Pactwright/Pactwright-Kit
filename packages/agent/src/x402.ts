/**
 * Built-in x402 payments for the agent (ROADMAP K-08, K-09).
 *
 * - M0 (`exact`): the stock `@x402/stellar` exact client, a signed USDC transfer to the seller.
 * - M2 (`pact`): `PactClientScheme`, a signed `pact.open` that moves the cap into escrow, as the
 *   facilitator's `pact` scheme expects (accensa/x402-facilitator-stellar,
 *   docs/scheme_pact_stellar.md).
 *
 * Both sign only Soroban auth entries (SEP-43): the facilitator builds, pays for and submits the
 * transaction, and the agent never needs XLM for fees.
 */
import { Networks, nativeToScVal, rpc, xdr } from "@stellar/stellar-sdk";
import { contract } from "@stellar/stellar-sdk";
import { x402Client, x402HTTPClient } from "@x402/core/client";
import type { PaymentRequired, PaymentRequirements, SchemeNetworkClient } from "@x402/core/types";
import { ExactStellarScheme } from "@x402/stellar/exact/client";
import { findDefaultAsset, type ClientStellarSigner } from "@x402/stellar";
import { conditionHash } from "@pactwright/core";
import type { Wallet } from "@pactwright/adapters";
import type { PaymentProvider } from "./buy.ts";

const DEFAULT_RPC = { "stellar:testnet": "https://soroban-testnet.stellar.org" } as Record<string, string>;
const PASSPHRASE: Record<string, string> = { "stellar:testnet": Networks.TESTNET, "stellar:pubnet": Networks.PUBLIC };
const LEDGER_SECONDS = 5;

/** A Kit wallet as an x402 Stellar client signer (SEP-43 `signAuthEntry`). */
export function walletSigner(wallet: Wallet): ClientStellarSigner {
  return {
    address: wallet.address(),
    signAuthEntry: async (authEntry: string) => ({
      signedAuthEntry: await wallet.signAuthEntry(authEntry),
      signerAddress: wallet.address(),
    }),
  };
}

interface PactTermsExtra {
  condition: Record<string, unknown>;
  silence?: "refund" | "pay";
  deadlines?: { verdictLedgers: number; settleLedgers: number };
}

/** Client side of the `pact` scheme: a buyer-signed `pact.open`. */
export class PactClientScheme implements SchemeNetworkClient {
  readonly scheme = "pact";
  /** Same asset defaults as upstream `exact` (USDC), so x402 spend controls apply unchanged. */
  readonly findDefaultAsset = findDefaultAsset;

  constructor(
    private readonly signer: ClientStellarSigner,
    private readonly nonce: bigint,
    private readonly rpcUrl?: string,
  ) {}

  async createPaymentPayload(x402Version: number, req: PaymentRequirements) {
    const terms = req.extra.pactwright as PactTermsExtra | undefined;
    const pactContract = req.extra.pactContract;
    if (typeof pactContract !== "string" || !terms?.condition) {
      throw new Error("pact requirements need extra.pactContract and extra.pactwright.condition");
    }
    const networkPassphrase = PASSPHRASE[req.network];
    const rpcUrl = this.rpcUrl ?? DEFAULT_RPC[req.network];
    if (!networkPassphrase || !rpcUrl) throw new Error(`unsupported network ${req.network}`);

    const latest = (await new rpc.Server(rpcUrl).getLatestLedger()).sequence;
    const deadlines = terms.deadlines ?? { verdictLedgers: 120, settleLedgers: 720 };
    const entries: Record<string, xdr.ScVal> = {
      buyer: nativeToScVal(this.signer.address, { type: "address" }),
      cap: nativeToScVal(BigInt(req.amount), { type: "i128" }),
      condition_hash: xdr.ScVal.scvBytes(Buffer.from(conditionHash(terms.condition), "hex")),
      meter: xdr.ScVal.scvVec([xdr.ScVal.scvSymbol("None")]),
      nonce: nativeToScVal(this.nonce, { type: "u64" }),
      seller: nativeToScVal(req.payTo, { type: "address" }),
      settle_deadline: xdr.ScVal.scvU32(latest + deadlines.settleLedgers),
      silence: xdr.ScVal.scvU32(terms.silence === "pay" ? 2 : 1),
      verdict_deadline: xdr.ScVal.scvU32(latest + deadlines.verdictLedgers),
    };
    const params = xdr.ScVal.scvMap(
      Object.keys(entries)
        .sort()
        .map((k) => new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol(k), val: entries[k]! })),
    );

    const tx = await contract.AssembledTransaction.build({
      contractId: pactContract,
      method: "open",
      args: [params],
      networkPassphrase,
      rpcUrl,
      parseResultXdr: (r: xdr.ScVal) => r,
    });
    const missing = tx.needsNonInvokerSigningBy();
    if (missing.length !== 1 || missing[0] !== this.signer.address) {
      throw new Error(`expected to sign as ${this.signer.address}, contract asked for [${missing.join(", ")}]`);
    }
    await tx.signAuthEntries({
      address: this.signer.address,
      signAuthEntry: this.signer.signAuthEntry,
      expiration: latest + Math.ceil(req.maxTimeoutSeconds / LEDGER_SECONDS),
    });
    await tx.simulate();
    if (tx.needsNonInvokerSigningBy().length > 0) throw new Error("pact.open still needs signatures after signing");
    return { x402Version, payload: { transaction: tx.built!.toXDR() } };
  }
}

/**
 * The built-in payment provider: signs the x402 payment the seller asked for with the agent's
 * wallet. `exact` for M0, `pact` for M2.
 */
export function x402Payment(options: { wallet: Wallet; rpcUrl?: string }): PaymentProvider {
  const signer = walletSigner(options.wallet);
  return {
    async pay(request) {
      const client = new x402Client()
        .register("stellar:*", new ExactStellarScheme(signer, options.rpcUrl ? { url: options.rpcUrl } : undefined))
        .register("stellar:*", new PactClientScheme(signer, request.nonce, options.rpcUrl));
      const only: PaymentRequired = { ...request.paymentRequired, accepts: [request.requirement] };
      const payload = await client.createPaymentPayload(only);
      return { headers: new x402HTTPClient(client).encodePaymentSignatureHeader(payload) };
    },
  };
}
