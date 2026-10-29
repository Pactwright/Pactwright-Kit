/** Agent accounts: sponsored reserves + USDC trustline; budget top-ups (ADR-006). ROADMAP K-10. */
import {
  Account,
  Asset,
  Keypair,
  Networks,
  Operation,
  TransactionBuilder,
} from "@stellar/stellar-base";

export interface CreateAgentOptions {
  networkPassphrase?: string;
  usdcIssuer?: string;
  agentKeypair?: Keypair;
  submitTx?: (txXdr: string) => Promise<string>;
  sourceAccountSequence?: string;
}

export interface CreateAgentResult {
  address: string;
  tx: string;
  agentSecret?: string;
}

export interface TopUpOptions {
  networkPassphrase?: string;
  usdcIssuer?: string;
  submitTx?: (txXdr: string) => Promise<string>;
  sourceAccountSequence?: string;
}

const DEFAULT_USDC_ISSUER = "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5";

export async function createAgentAccount(
  sponsorSecret: string,
  options?: CreateAgentOptions,
): Promise<CreateAgentResult> {
  const sponsor = Keypair.fromSecret(sponsorSecret);
  const agent = options?.agentKeypair ?? Keypair.random();
  const passphrase = options?.networkPassphrase ?? Networks.TESTNET;
  const usdcIssuer = options?.usdcIssuer ?? DEFAULT_USDC_ISSUER;
  const usdcAsset = new Asset("USDC", usdcIssuer);

  const seq = options?.sourceAccountSequence ?? "1000";
  const sourceAccount = new Account(sponsor.publicKey(), seq);

  const tx = new TransactionBuilder(sourceAccount, {
    fee: "10000",
    networkPassphrase: passphrase,
  })
    // 1. Begin sponsoring reserves for the new agent account
    .addOperation(
      Operation.beginSponsoringFutureReserves({
        sponsoredId: agent.publicKey(),
      }),
    )
    // 2. Create the account with 0 XLM starting balance (sponsored by sponsor)
    .addOperation(
      Operation.createAccount({
        destination: agent.publicKey(),
        startingBalance: "0",
      }),
    )
    // 3. Establish the USDC trustline with zero agent XLM (sponsored)
    .addOperation(
      Operation.changeTrust({
        asset: usdcAsset,
        source: agent.publicKey(),
      }),
    )
    // 4. End sponsorship
    .addOperation(
      Operation.endSponsoringFutureReserves({
        source: agent.publicKey(),
      }),
    )
    .setTimeout(30)
    .build();

  tx.sign(sponsor);
  tx.sign(agent);

  const txXdr = tx.toXDR();
  let txHash: string;
  if (options?.submitTx) {
    txHash = await options.submitTx(txXdr);
  } else {
    txHash = tx.hash().toString("hex");
  }

  return {
    address: agent.publicKey(),
    tx: txHash,
    agentSecret: agent.secret(),
  };
}

export async function topUp(
  agent: string,
  amount: string,
  funderSecret: string,
  options?: TopUpOptions,
): Promise<string> {
  const funder = Keypair.fromSecret(funderSecret);
  const passphrase = options?.networkPassphrase ?? Networks.TESTNET;
  const usdcIssuer = options?.usdcIssuer ?? DEFAULT_USDC_ISSUER;
  const usdcAsset = new Asset("USDC", usdcIssuer);

  const seq = options?.sourceAccountSequence ?? "2000";
  const sourceAccount = new Account(funder.publicKey(), seq);

  const tx = new TransactionBuilder(sourceAccount, {
    fee: "10000",
    networkPassphrase: passphrase,
  })
    .addOperation(
      Operation.payment({
        destination: agent,
        asset: usdcAsset,
        amount,
      }),
    )
    .setTimeout(30)
    .build();

  tx.sign(funder);

  const txXdr = tx.toXDR();
  if (options?.submitTx) {
    return options.submitTx(txXdr);
  }

  return tx.hash().toString("hex");
}
