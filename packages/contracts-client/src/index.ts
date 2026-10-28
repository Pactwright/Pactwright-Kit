import { Buffer } from "buffer";
import { Address } from "@stellar/stellar-sdk";
import {
  AssembledTransaction,
  Client as ContractClient,
  Spec as ContractSpec,
} from "@stellar/stellar-sdk/contract";
import type {
  ClientOptions as ContractClientOptions,
  MethodOptions,
  Result,
} from "@stellar/stellar-sdk/contract";
import type {
  u32,
  i32,
  u64,
  i64,
  u128,
  i128,
  u256,
  i256,
  Option,
  Timepoint,
  Duration,
} from "@stellar/stellar-sdk/contract";
export * from "@stellar/stellar-sdk";
export * as contract from "@stellar/stellar-sdk/contract";
export * as rpc from "@stellar/stellar-sdk/rpc";

declare const window: any;
if (typeof window !== "undefined") {
  //@ts-ignore Buffer exists
  window.Buffer = window.Buffer || Buffer;
}





export interface Pact {
  /**
 * From the ALLOW attestation, or `cap` under `Silence::Pay`.
 */
allowed_amount: i128;
  buyer: string;
  cap: i128;
  condition_hash: Buffer;
  envelope_hash: Option<Buffer>;
  meter: Metering;
  opened_ledger: u32;
  paid_to_seller: i128;
  returned_to_buyer: i128;
  seller: string;
  settle_deadline: u32;
  silence: Silence;
  state: PactState;
  verdict_deadline: u32;
  /**
 * Snapshot of `Config.verifier` at open (ADR-014).
 */
verifier: Buffer;
}


export interface Config {
  admin: string;
  /**
 * Upper bound on `settle_deadline - now` at open.
 */
max_pact_ledgers: u32;
  /**
 * The only accepted token (USDC SAC).
 */
token: string;
  verifier: Buffer;
}

/**
 * What happens if no verdict arrives by `verdict_deadline`. Agreed at open (ADR-011).
 */
export enum Silence {
  Refund = 1,
  Pay = 2,
}

export enum Verdict {
  Allow = 1,
  Deny = 2,
}

/**
 * Whether a pact is metered. A contract enum rather than `Option<MeterTerms>`, which the
 * SDK cannot convert inside a `#[contracttype]` struct.
 */
export type Metering = {tag: "None", values: void} | {tag: "Units", values: readonly [MeterTerms]};

/**
 * Lifecycle state. Terminal states are `Settled` and `Released` (invariant 1).
 */
export enum PactState {
  Funded = 1,
  Allowed = 2,
  Denied = 3,
  Settled = 4,
  Released = 5,
}


/**
 * Present only on metered pacts. Metered pacts never take a verdict (invariant 8).
 */
export interface MeterTerms {
  /**
 * Per-pact ed25519 public key held by the buyer's SDK; signs `UsageVoucher`s.
 */
meter_key: Buffer;
  /**
 * Stroops of `Config.token` per unit.
 */
unit_price: i128;
}


/**
 * Arguments of `open`, bundled in one struct.
 */
export interface OpenParams {
  buyer: string;
  cap: i128;
  condition_hash: Buffer;
  meter: Metering;
  /**
 * `u64_be(sha256(idempotency_key)[0..8])` — retries reuse the same pact.
 */
nonce: u64;
  seller: string;
  settle_deadline: u32;
  silence: Silence;
  verdict_deadline: u32;
}


/**
 * Compact, Soroban-verifiable form of a Witness verdict-v1 envelope (ADR-003).
 */
export interface VerdictAttestation {
  /**
 * Amount owed to the seller, `<= cap` (partial delivery).
 */
amount: i128;
  condition_hash: Buffer;
  /**
 * sha256 of the canonical verdict-v1 envelope.
 */
envelope_hash: Buffer;
  issued_ledger: u32;
  pact_id: Buffer;
  verdict: Verdict;
}

export const Errors = {
  1: {message:"NotInitialized"},
  2: {message:"AlreadyExists"},
  3: {message:"PactNotFound"},
  4: {message:"InvalidState"},
  5: {message:"InvalidAmount"},
  6: {message:"SelfDealing"},
  7: {message:"BadDeadlines"},
  8: {message:"VerdictWindowClosed"},
  9: {message:"SettleWindowClosed"},
  10: {message:"NotReleasable"},
  11: {message:"AttestationMismatch"},
  /**
   * Reserved: `ed25519_verify` traps on a bad signature rather than returning.
   */
  12: {message:"BadSignature"},
  13: {message:"NotMetered"},
  14: {message:"IsMetered"},
  15: {message:"Unauthorized"}
}






export enum ReleaseReason {
  Denied = 1,
  Silence = 2,
  Deadline = 3,
}


export interface Client {
  /**
   * Construct and simulate a open transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Opens a pact and moves `cap` into escrow. Buyer auth. Returns `pact_id`.
   */
  open: ({params}: {params: OpenParams}, options?: MethodOptions) => Promise<AssembledTransaction<Result<Buffer>>>

  /**
   * Construct and simulate a settle transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Pays `actual` to the seller and returns the rest to the buyer. Seller auth.
   */
  settle: ({pact_id, actual}: {pact_id: Buffer, actual: i128}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a release transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Returns the full escrow to the buyer when the release rules allow it. No auth.
   */
  release: ({pact_id}: {pact_id: Buffer}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a get_pact transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  get_pact: ({pact_id}: {pact_id: Buffer}, options?: MethodOptions) => Promise<AssembledTransaction<Result<Pact>>>

  /**
   * Construct and simulate a get_config transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  get_config: (options?: MethodOptions) => Promise<AssembledTransaction<Result<Config>>>

  /**
   * Construct and simulate a close_meter transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Settles a metered pact from the buyer's latest signed usage voucher. Seller auth.
   */
  close_meter: ({pact_id, units, signature}: {pact_id: Buffer, units: u32, signature: Buffer}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a set_verifier transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Rotates the verifier key for **new** pacts only (ADR-014). Admin auth.
   */
  set_verifier: ({key}: {key: Buffer}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a record_verdict transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Records the single verdict for a non-metered pact. No auth: the signature is the authority.
   */
  record_verdict: ({pact_id, attestation, signature}: {pact_id: Buffer, attestation: VerdictAttestation, signature: Buffer}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a extend_pact_ttl transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Bumps the TTL of a non-terminal pact. No auth.
   */
  extend_pact_ttl: ({pact_id}: {pact_id: Buffer}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

}
export class Client extends ContractClient {
  static override async deploy<T = Client>(
        /** Constructor/Initialization Args for the contract's `__constructor` method */
        {admin, token, verifier, max_pact_ledgers}: {admin: string, token: string, verifier: Buffer, max_pact_ledgers: u32},
    /** Options for initializing a Client as well as for calling a method, with extras specific to deploying. */
    options: MethodOptions &
      Omit<ContractClientOptions, "contractId"> & {
        /** The hash of the Wasm blob, which must already be installed on-chain. */
        wasmHash: Buffer | string;
        /** Salt used to generate the contract's ID. Passed through to {@link Operation.createCustomContract}. Default: random. */
        salt?: Buffer | Uint8Array;
        /** The format used to decode `wasmHash`, if it's provided as a string. */
        format?: "hex" | "base64";
      }
  ): Promise<AssembledTransaction<T>> {
    return ContractClient.deploy({admin, token, verifier, max_pact_ledgers}, options)
  }
  constructor(override readonly options: ContractClientOptions) {
    super(
      new ContractSpec([ "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",
        "AAAAAQAAAAAAAAAAAAAABkNvbmZpZwAAAAAABAAAAAAAAAAFYWRtaW4AAAAAAAATAAAAL1VwcGVyIGJvdW5kIG9uIGBzZXR0bGVfZGVhZGxpbmUgLSBub3dgIGF0IG9wZW4uAAAAABBtYXhfcGFjdF9sZWRnZXJzAAAABAAAACNUaGUgb25seSBhY2NlcHRlZCB0b2tlbiAoVVNEQyBTQUMpLgAAAAAFdG9rZW4AAAAAAAATAAAAAAAAAAh2ZXJpZmllcgAAA+4AAAAg",
        "AAAAAwAAAFNXaGF0IGhhcHBlbnMgaWYgbm8gdmVyZGljdCBhcnJpdmVzIGJ5IGB2ZXJkaWN0X2RlYWRsaW5lYC4gQWdyZWVkIGF0IG9wZW4gKEFEUi0wMTEpLgAAAAAAAAAAB1NpbGVuY2UAAAAAAgAAAC1BbnlvbmUgbWF5IGByZWxlYXNlYCB0aGUgZXNjcm93IHRvIHRoZSBidXllci4AAAAAAAAGUmVmdW5kAAAAAAABAAAAJFRoZSBzZWxsZXIgbWF5IGBzZXR0bGVgIHVwIHRvIGBjYXBgLgAAAANQYXkAAAAAAg==",
        "AAAAAwAAAAAAAAAAAAAAB1ZlcmRpY3QAAAAAAgAAAAAAAAAFQWxsb3cAAAAAAAABAAAAAAAAAAREZW55AAAAAg==",
        "AAAAAgAAAIxXaGV0aGVyIGEgcGFjdCBpcyBtZXRlcmVkLiBBIGNvbnRyYWN0IGVudW0gcmF0aGVyIHRoYW4gYE9wdGlvbjxNZXRlclRlcm1zPmAsIHdoaWNoIHRoZQpTREsgY2Fubm90IGNvbnZlcnQgaW5zaWRlIGEgYCNbY29udHJhY3R0eXBlXWAgc3RydWN0LgAAAAAAAAAITWV0ZXJpbmcAAAACAAAAAAAAABNWZXJkaWN0LWdhdGVkIHBhY3QuAAAAAAROb25lAAAAAQAAAFBNZXRlcmVkIHBhY3Q7IHNldHRsZWQgd2l0aCBzaWduZWQgdXNhZ2Ugdm91Y2hlcnMsIG5ldmVyIGEgdmVyZGljdCAoaW52YXJpYW50IDgpLgAAAAVVbml0cwAAAAAAAAEAAAfQAAAACk1ldGVyVGVybXMAAA==",
        "AAAAAwAAAExMaWZlY3ljbGUgc3RhdGUuIFRlcm1pbmFsIHN0YXRlcyBhcmUgYFNldHRsZWRgIGFuZCBgUmVsZWFzZWRgIChpbnZhcmlhbnQgMSkuAAAAAAAAAAlQYWN0U3RhdGUAAAAAAAAFAAAAAAAAAAZGdW5kZWQAAAAAAAEAAAAAAAAAB0FsbG93ZWQAAAAAAgAAAAAAAAAGRGVuaWVkAAAAAAADAAAAAAAAAAdTZXR0bGVkAAAAAAQAAAAAAAAACFJlbGVhc2VkAAAABQ==",
        "AAAAAQAAAFBQcmVzZW50IG9ubHkgb24gbWV0ZXJlZCBwYWN0cy4gTWV0ZXJlZCBwYWN0cyBuZXZlciB0YWtlIGEgdmVyZGljdCAoaW52YXJpYW50IDgpLgAAAAAAAAAKTWV0ZXJUZXJtcwAAAAAAAgAAAEtQZXItcGFjdCBlZDI1NTE5IHB1YmxpYyBrZXkgaGVsZCBieSB0aGUgYnV5ZXIncyBTREs7IHNpZ25zIGBVc2FnZVZvdWNoZXJgcy4AAAAACW1ldGVyX2tleQAAAAAAA+4AAAAgAAAAI1N0cm9vcHMgb2YgYENvbmZpZy50b2tlbmAgcGVyIHVuaXQuAAAAAAp1bml0X3ByaWNlAAAAAAAL",
        "AAAAAQAAACtBcmd1bWVudHMgb2YgYG9wZW5gLCBidW5kbGVkIGluIG9uZSBzdHJ1Y3QuAAAAAAAAAAAKT3BlblBhcmFtcwAAAAAACQAAAAAAAAAFYnV5ZXIAAAAAAAATAAAAAAAAAANjYXAAAAAACwAAAAAAAAAOY29uZGl0aW9uX2hhc2gAAAAAA+4AAAAgAAAAAAAAAAVtZXRlcgAAAAAAB9AAAAAITWV0ZXJpbmcAAABIYHU2NF9iZShzaGEyNTYoaWRlbXBvdGVuY3lfa2V5KVswLi44XSlgIOKAlCByZXRyaWVzIHJldXNlIHRoZSBzYW1lIHBhY3QuAAAABW5vbmNlAAAAAAAABgAAAAAAAAAGc2VsbGVyAAAAAAATAAAAAAAAAA9zZXR0bGVfZGVhZGxpbmUAAAAABAAAAAAAAAAHc2lsZW5jZQAAAAfQAAAAB1NpbGVuY2UAAAAAAAAAABB2ZXJkaWN0X2RlYWRsaW5lAAAABA==",
        "AAAAAQAAAExDb21wYWN0LCBTb3JvYmFuLXZlcmlmaWFibGUgZm9ybSBvZiBhIFdpdG5lc3MgdmVyZGljdC12MSBlbnZlbG9wZSAoQURSLTAwMykuAAAAAAAAABJWZXJkaWN0QXR0ZXN0YXRpb24AAAAAAAYAAAA3QW1vdW50IG93ZWQgdG8gdGhlIHNlbGxlciwgYDw9IGNhcGAgKHBhcnRpYWwgZGVsaXZlcnkpLgAAAAAGYW1vdW50AAAAAAALAAAAAAAAAA5jb25kaXRpb25faGFzaAAAAAAD7gAAACAAAAAsc2hhMjU2IG9mIHRoZSBjYW5vbmljYWwgdmVyZGljdC12MSBlbnZlbG9wZS4AAAANZW52ZWxvcGVfaGFzaAAAAAAAA+4AAAAgAAAAAAAAAA1pc3N1ZWRfbGVkZ2VyAAAAAAAABAAAAAAAAAAHcGFjdF9pZAAAAAPuAAAAIAAAAAAAAAAHdmVyZGljdAAAAAfQAAAAB1ZlcmRpY3QA",
        "AAAABAAAAAAAAAAAAAAABUVycm9yAAAAAAAADwAAAAAAAAAOTm90SW5pdGlhbGl6ZWQAAAAAAAEAAAAAAAAADUFscmVhZHlFeGlzdHMAAAAAAAACAAAAAAAAAAxQYWN0Tm90Rm91bmQAAAADAAAAAAAAAAxJbnZhbGlkU3RhdGUAAAAEAAAAAAAAAA1JbnZhbGlkQW1vdW50AAAAAAAABQAAAAAAAAALU2VsZkRlYWxpbmcAAAAABgAAAAAAAAAMQmFkRGVhZGxpbmVzAAAABwAAAAAAAAATVmVyZGljdFdpbmRvd0Nsb3NlZAAAAAAIAAAAAAAAABJTZXR0bGVXaW5kb3dDbG9zZWQAAAAAAAkAAAAAAAAADU5vdFJlbGVhc2FibGUAAAAAAAAKAAAAAAAAABNBdHRlc3RhdGlvbk1pc21hdGNoAAAAAAsAAABKUmVzZXJ2ZWQ6IGBlZDI1NTE5X3ZlcmlmeWAgdHJhcHMgb24gYSBiYWQgc2lnbmF0dXJlIHJhdGhlciB0aGFuIHJldHVybmluZy4AAAAAAAxCYWRTaWduYXR1cmUAAAAMAAAAAAAAAApOb3RNZXRlcmVkAAAAAAANAAAAAAAAAAlJc01ldGVyZWQAAAAAAAAOAAAAAAAAAAxVbmF1dGhvcml6ZWQAAAAP",
        "AAAABQAAAAAAAAAAAAAABk9wZW5lZAAAAAAAAgAAAARwYWN0AAAABm9wZW5lZAAAAAAACQAAAAAAAAAHcGFjdF9pZAAAAAPuAAAAIAAAAAAAAAAAAAAABWJ1eWVyAAAAAAAAEwAAAAAAAAAAAAAABnNlbGxlcgAAAAAAEwAAAAAAAAAAAAAAA2NhcAAAAAALAAAAAAAAAAAAAAAOY29uZGl0aW9uX2hhc2gAAAAAA+4AAAAgAAAAAAAAAAAAAAAHbWV0ZXJlZAAAAAABAAAAAAAAAAAAAAAHc2lsZW5jZQAAAAfQAAAAB1NpbGVuY2UAAAAAAAAAAAAAAAAQdmVyZGljdF9kZWFkbGluZQAAAAQAAAAAAAAAAAAAAA9zZXR0bGVfZGVhZGxpbmUAAAAABAAAAAAAAAAC",
        "AAAABQAAAAAAAAAAAAAAB1NldHRsZWQAAAAAAgAAAARwYWN0AAAAB3NldHRsZWQAAAAAAwAAAAAAAAAHcGFjdF9pZAAAAAPuAAAAIAAAAAAAAAAAAAAACXRvX3NlbGxlcgAAAAAAAAsAAAAAAAAAAAAAAAh0b19idXllcgAAAAsAAAAAAAAAAg==",
        "AAAABQAAAAAAAAAAAAAACFJlbGVhc2VkAAAAAgAAAARwYWN0AAAACHJlbGVhc2VkAAAAAwAAAAAAAAAHcGFjdF9pZAAAAAPuAAAAIAAAAAAAAAAAAAAABnJlYXNvbgAAAAAH0AAAAA1SZWxlYXNlUmVhc29uAAAAAAAAAAAAAAAAAAAIdG9fYnV5ZXIAAAALAAAAAAAAAAI=",
        "AAAABQAAAAAAAAAAAAAAC01ldGVyQ2xvc2VkAAAAAAIAAAAEcGFjdAAAAAxtZXRlcl9jbG9zZWQAAAAEAAAAAAAAAAdwYWN0X2lkAAAAA+4AAAAgAAAAAAAAAAAAAAAFdW5pdHMAAAAAAAAEAAAAAAAAAAAAAAAJdG9fc2VsbGVyAAAAAAAACwAAAAAAAAAAAAAACHRvX2J1eWVyAAAACwAAAAAAAAAC",
        "AAAABQAAAAAAAAAAAAAAC1ZlcmlmaWVyU2V0AAAAAAIAAAAEcGFjdAAAAAx2ZXJpZmllcl9zZXQAAAABAAAAAAAAAANrZXkAAAAD7gAAACAAAAAAAAAAAg==",
        "AAAAAwAAAAAAAAAAAAAADVJlbGVhc2VSZWFzb24AAAAAAAADAAAAAAAAAAZEZW5pZWQAAAAAAAEAAAAAAAAAB1NpbGVuY2UAAAAAAgAAAAAAAAAIRGVhZGxpbmUAAAAD",
        "AAAABQAAAAAAAAAAAAAAD1ZlcmRpY3RSZWNvcmRlZAAAAAACAAAABHBhY3QAAAAHdmVyZGljdAAAAAAEAAAAAAAAAAdwYWN0X2lkAAAAA+4AAAAgAAAAAAAAAAAAAAAHdmVyZGljdAAAAAfQAAAAB1ZlcmRpY3QAAAAAAAAAAAAAAAAGYW1vdW50AAAAAAALAAAAAAAAAAAAAAANZW52ZWxvcGVfaGFzaAAAAAAAA+4AAAAgAAAAAAAAAAI=" ]),
      options
    )
  }
  public readonly fromJSON = {
    open: this.txFromJSON<Result<Buffer>>,
        settle: this.txFromJSON<Result<void>>,
        release: this.txFromJSON<Result<void>>,
        get_pact: this.txFromJSON<Result<Pact>>,
        get_config: this.txFromJSON<Result<Config>>,
        close_meter: this.txFromJSON<Result<void>>,
        set_verifier: this.txFromJSON<Result<void>>,
        record_verdict: this.txFromJSON<Result<void>>,
        extend_pact_ttl: this.txFromJSON<Result<void>>
  }
}