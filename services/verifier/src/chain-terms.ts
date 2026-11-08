/**
 * Checks a verdict request's terms against sources the caller can't edit. ADR-019.
 *
 * The contract trusts any attestation whose `pact_id` and `condition_hash` match the pact, so the
 * verifier must judge the pact's own frozen condition, for the pact's own parties and cap, against a
 * delivery receipt signed by the pact's own seller. Terms that disagree with the chain are refused
 * before anything is signed.
 */
import { conditionHash, pactId as derivePactId, toStroops, type PactTerms } from "@pactwright/core";
import { Client, Keypair, StrKey, rpc, xdr } from "@pactwright/contracts-client";

/** The Stellar account data entry where a seller publishes a delivery key other than its account key. */
export const DELIVERY_KEY_DATA_NAME = "pactwright.delivery_key";

/** The fields of an on-chain pact that the request's terms must match. */
export interface OnChainPact {
  buyer: string;
  seller: string;
  /** Stroops. */
  cap: bigint;
  /** Hex. */
  conditionHash: string;
  /** `PactState`: 1 Funded, 2 Allowed, 3 Denied, 4 Settled, 5 Released. */
  state: number;
}

export interface ChainReader {
  /** The pact, or null when the contract has no pact with this id. Throws when the chain can't be read. */
  getPact(pactIdHex: string): Promise<OnChainPact | null>;
  /** Hex of the seller's published delivery key, or null when it publishes none. Throws when the chain can't be read. */
  sellerDeliveryKey(seller: string): Promise<string | null>;
}

const FUNDED = 1;

/** Returns why the terms can't be judged; an empty list means they match the chain. */
export async function checkTermsAgainstChain(terms: PactTerms, milestone: string, reader: ChainReader): Promise<string[]> {
  const problems: string[] = [];
  const condHash = conditionHash(terms.condition);
  if (terms.conditionHash.toLowerCase() !== condHash) {
    problems.push("conditionHash is not the hash of condition");
  }
  let derived: string | undefined;
  try {
    derived = derivePactId(terms.buyer, terms.seller, BigInt(terms.nonce), condHash);
  } catch {
    problems.push("buyer, seller or nonce can't derive a pact_id");
  }
  if (derived !== undefined && derived !== terms.pactId.toLowerCase()) {
    problems.push("pactId is not derived from buyer, seller, nonce and the condition");
  }

  if (terms.mode === "escrow") {
    const pact = await reader.getPact(terms.pactId.toLowerCase());
    if (!pact) {
      problems.push("no pact with this pactId on the configured pact contract");
    } else {
      if (pact.buyer !== terms.buyer) problems.push("buyer does not match the pact on-chain");
      if (pact.seller !== terms.seller) problems.push("seller does not match the pact on-chain");
      if (pact.conditionHash.toLowerCase() !== condHash) problems.push("condition does not match the pact's condition_hash on-chain");
      let cap: bigint | undefined;
      try {
        cap = toStroops(terms.cap);
      } catch {
        problems.push("cap is not a valid amount");
      }
      if (cap !== undefined && cap !== pact.cap) problems.push("cap does not match the pact on-chain");
      if (milestone === "delivery" && pact.state !== FUNDED) problems.push("the pact is no longer waiting for a verdict");
    }
  }

  problems.push(...(await deliveryKeyProblems(terms, reader)));
  return problems;
}

async function deliveryKeyProblems(terms: PactTerms, reader: ChainReader): Promise<string[]> {
  if (!terms.deliveryKey) return ["deliveryKey is required"];
  if (!StrKey.isValidEd25519PublicKey(terms.seller)) {
    return ["the seller must be a Stellar account (G…) so its delivery key can be checked"];
  }
  const key = terms.deliveryKey.toLowerCase();
  if (key === Buffer.from(StrKey.decodeEd25519PublicKey(terms.seller)).toString("hex")) return [];
  const published = await reader.sellerDeliveryKey(terms.seller);
  if (published === key) return [];
  return [`deliveryKey is neither the seller's account key nor the key in its "${DELIVERY_KEY_DATA_NAME}" account entry`];
}

/** A data entry value as a hex key: 32 raw bytes, or 64 hex characters. Anything else is no key. */
export function deliveryKeyFromDataValue(value: Uint8Array): string | null {
  const bytes = Buffer.from(value);
  if (bytes.length === 32) return bytes.toString("hex");
  const text = bytes.toString("utf8").trim().toLowerCase();
  return /^[0-9a-f]{64}$/.test(text) ? text : null;
}

/** Reads pacts from the configured `pact` contract and delivery keys from account data entries. */
export function rpcChainReader(options: { rpcUrl: string; networkPassphrase: string; pactContractId: string }): ChainReader {
  const server = new rpc.Server(options.rpcUrl, { allowHttp: options.rpcUrl.startsWith("http://") });
  const client = new Client({
    contractId: options.pactContractId,
    networkPassphrase: options.networkPassphrase,
    rpcUrl: options.rpcUrl,
    allowHttp: options.rpcUrl.startsWith("http://"),
  });
  return {
    async getPact(pactIdHex) {
      const tx = await client.get_pact({ pact_id: Buffer.from(pactIdHex, "hex") });
      const result = tx.result;
      // A contract error (NotFound) is "no such pact"; a failed read throws above.
      if (result.isErr()) return null;
      const pact = result.unwrap();
      return {
        buyer: pact.buyer,
        seller: pact.seller,
        cap: BigInt(pact.cap),
        conditionHash: Buffer.from(pact.condition_hash).toString("hex"),
        state: Number(pact.state),
      };
    },
    async sellerDeliveryKey(seller) {
      const key = xdr.LedgerKey.data(
        new xdr.LedgerKeyData({ accountId: Keypair.fromPublicKey(seller).xdrAccountId(), dataName: DELIVERY_KEY_DATA_NAME }),
      );
      const res = await server.getLedgerEntries(key);
      const entry = res.entries[0];
      if (!entry) return null;
      return deliveryKeyFromDataValue(entry.val.data().dataValue());
    },
  };
}
