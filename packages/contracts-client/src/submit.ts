/**
 * Send a call on the `pact` contract through an x402 facilitator's `POST /pact/submit`, which
 * pays the fee (accensa/x402-facilitator-stellar, docs/scheme_pact_stellar.md §6).
 *
 * The call is built and simulated here. When it needs someone's authorization (the seller's for
 * `settle` and `close_meter`), that party signs the auth entry; the facilitator never signs on
 * anyone's behalf. `record_verdict`, `release` and `extend_pact_ttl` need no auth.
 */
import { Networks, rpc, xdr } from "@stellar/stellar-sdk";
import { contract } from "@stellar/stellar-sdk";

export type PactSubmitFunction = "record_verdict" | "settle" | "close_meter" | "release" | "extend_pact_ttl";

/** SEP-43 signer for the party whose authorization the call needs. */
export interface AuthSigner {
  address: string;
  signAuthEntry: (preimageXdr: string) => Promise<{ signedAuthEntry: string; signerAddress?: string }>;
}

export interface PactSubmitOptions {
  facilitatorUrl: string;
  /** Sent as `Authorization: Bearer …` when the facilitator requires API keys. */
  apiKey?: string;
  /** CAIP-2 network, e.g. `stellar:testnet`. */
  network: "stellar:testnet" | "stellar:pubnet";
  rpcUrl: string;
  pactContractId: string;
  signer?: AuthSigner;
  fetchImpl?: typeof fetch;
}

export interface PactSubmitResult {
  transaction: string;
  function: PactSubmitFunction;
  feeStroops?: number;
}

const PASSPHRASE = { "stellar:testnet": Networks.TESTNET, "stellar:pubnet": Networks.PUBLIC };
const LEDGER_SECONDS = 5;

export async function submitPactCall(
  fn: PactSubmitFunction,
  /** Contract arguments as ScVals from any stellar-base copy (anything that serializes to XDR). */
  args: Array<{ toXDR(): Buffer }>,
  options: PactSubmitOptions,
): Promise<PactSubmitResult> {
  const networkPassphrase = PASSPHRASE[options.network];
  const tx = await contract.AssembledTransaction.build({
    contractId: options.pactContractId,
    method: fn,
    // Re-read through this package's XDR types, so values built with another stellar-base copy work.
    args: args.map((a) => xdr.ScVal.fromXDR(a.toXDR())),
    networkPassphrase,
    rpcUrl: options.rpcUrl,
    parseResultXdr: (r: xdr.ScVal) => r,
  });
  const needs = tx.needsNonInvokerSigningBy();
  if (needs.length) {
    if (!options.signer || needs.length !== 1 || needs[0] !== options.signer.address) {
      throw new Error(`${fn} needs authorization from [${needs.join(", ")}]`);
    }
    const latest = (await new rpc.Server(options.rpcUrl).getLatestLedger()).sequence;
    await tx.signAuthEntries({
      address: options.signer.address,
      signAuthEntry: options.signer.signAuthEntry,
      expiration: latest + Math.ceil(60 / LEDGER_SECONDS),
    });
    await tx.simulate();
  }

  const doFetch = options.fetchImpl ?? globalThis.fetch;
  const res = await doFetch(`${options.facilitatorUrl.replace(/\/$/, "")}/pact/submit`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(options.apiKey ? { Authorization: `Bearer ${options.apiKey}` } : {}),
    },
    body: JSON.stringify({ network: options.network, transaction: tx.built!.toXDR() }),
  });
  const body = (await res.json().catch(() => ({}))) as {
    success?: boolean;
    transaction?: string;
    errorReason?: string;
    feeStroops?: number;
  };
  if (!res.ok || !body.success || !body.transaction) {
    throw new Error(`/pact/submit ${fn} failed (HTTP ${res.status}): ${body.errorReason ?? "no transaction"}`);
  }
  return { transaction: body.transaction, function: fn, ...(body.feeStroops ? { feeStroops: body.feeStroops } : {}) };
}
