/**
 * Submits one Soroban contract call and waits for it to land. Used by the seller hooks to send
 * `RefundVault.refund` (M0) and `pact.settle` (M2) as real transactions.
 */
import { Address, BASE_FEE, Contract, TransactionBuilder, nativeToScVal, rpc, xdr } from "@stellar/stellar-sdk";

/** Signs a transaction envelope (base64 XDR) and returns the signed envelope. */
export type EnvelopeSigner = (txEnvelopeXdr: string, networkPassphrase: string) => string | Promise<string>;

export interface ChainOptions {
  rpcUrl: string;
  networkPassphrase: string;
  /** Account that pays the fee and whose auth the call needs (the seller / vault merchant). */
  source: string;
  sign: EnvelopeSigner;
  /** How many one-second polls to wait for the transaction. Default 30. */
  pollAttempts?: number;
}

export interface SubmittedCall {
  txHash: string;
  ledger: number;
}

export class ChainSubmitError extends Error {
  constructor(message: string, public readonly txHash?: string) {
    super(message);
    this.name = "ChainSubmitError";
  }
}

export const scv = {
  address: (a: string): xdr.ScVal => new Address(a).toScVal(),
  bytes32: (hex: string): xdr.ScVal => xdr.ScVal.scvBytes(Buffer.from(hex, "hex")),
  i128: (v: bigint): xdr.ScVal => nativeToScVal(v, { type: "i128" }),
  u32: (v: number): xdr.ScVal => xdr.ScVal.scvU32(v),
};

export async function invokeContract(
  options: ChainOptions,
  contractId: string,
  method: string,
  args: xdr.ScVal[],
): Promise<SubmittedCall> {
  const server = new rpc.Server(options.rpcUrl, { allowHttp: options.rpcUrl.startsWith("http://") });
  const account = await server.getAccount(options.source);
  const built = new TransactionBuilder(account, { fee: BASE_FEE, networkPassphrase: options.networkPassphrase })
    .addOperation(new Contract(contractId).call(method, ...args))
    .setTimeout(60)
    .build();

  let prepared;
  try {
    prepared = await server.prepareTransaction(built);
  } catch (e) {
    throw new ChainSubmitError(`${method} simulation failed: ${e instanceof Error ? e.message : String(e)}`);
  }

  const signedXdr = await options.sign(prepared.toXDR(), options.networkPassphrase);
  const signed = TransactionBuilder.fromXDR(signedXdr, options.networkPassphrase);
  const sent = await server.sendTransaction(signed);
  if (sent.status === "ERROR") {
    throw new ChainSubmitError(`${method} was rejected: ${sent.errorResult?.toXDR("base64") ?? "unknown error"}`, sent.hash);
  }

  const final = await server.pollTransaction(sent.hash, { attempts: options.pollAttempts ?? 30 });
  if (final.status !== rpc.Api.GetTransactionStatus.SUCCESS) {
    throw new ChainSubmitError(`${method} transaction ${sent.hash} ended with status ${final.status}`, sent.hash);
  }
  return { txHash: sent.hash, ledger: final.ledger };
}
