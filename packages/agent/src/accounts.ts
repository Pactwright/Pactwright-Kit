/** Agent accounts: sponsored reserves + USDC trustline; budget top-ups (ADR-006). ROADMAP K-10. */
import {
  Account,
  Asset,
  Keypair,
  Networks,
  Operation,
  TransactionBuilder,
  rpc,
  type Transaction,
} from "@stellar/stellar-sdk";

export interface CreateAgentOptions {
  networkPassphrase?: string;
  usdcIssuer?: string;
  /** Loads the source account's sequence and submits the transaction, unless overridden below. */
  rpcUrl?: string;
  agentKeypair?: Keypair;
  /** Submits the signed transaction and returns its hash. Default: through `rpcUrl`. */
  submitTx?: (txXdr: string) => Promise<string>;
  /** The source account's current sequence. Default: read through `rpcUrl`. */
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
  /** Loads the source account's sequence and submits the transaction, unless overridden below. */
  rpcUrl?: string;
  submitTx?: (txXdr: string) => Promise<string>;
  sourceAccountSequence?: string;
}

const DEFAULT_USDC_ISSUER = "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5";

async function sourceAccount(address: string, options: { rpcUrl?: string; sourceAccountSequence?: string }): Promise<Account> {
  if (options.sourceAccountSequence) return new Account(address, options.sourceAccountSequence);
  if (!options.rpcUrl) throw new Error("rpcUrl or sourceAccountSequence is required to build the transaction");
  return new rpc.Server(options.rpcUrl).getAccount(address);
}

/** Submits through `submitTx`, or through `rpcUrl` and waits for success. Never returns an unsent hash. */
async function submit(tx: Transaction, options: { rpcUrl?: string; submitTx?: (txXdr: string) => Promise<string> }): Promise<string> {
  if (options.submitTx) return options.submitTx(tx.toXDR());
  if (!options.rpcUrl) throw new Error("rpcUrl or submitTx is required: the transaction was not submitted");
  const server = new rpc.Server(options.rpcUrl);
  const sent = await server.sendTransaction(tx);
  if (sent.status === "ERROR") throw new Error(`transaction rejected: ${sent.errorResult?.toXDR("base64") ?? "unknown"}`);
  const final = await server.pollTransaction(sent.hash, { attempts: 30 });
  if (final.status !== rpc.Api.GetTransactionStatus.SUCCESS) throw new Error(`transaction ${sent.hash} ${final.status}`);
  return sent.hash;
}

export async function createAgentAccount(
  sponsorSecret: string,
  options?: CreateAgentOptions,
): Promise<CreateAgentResult> {
  const sponsor = Keypair.fromSecret(sponsorSecret);
  const agent = options?.agentKeypair ?? Keypair.random();
  const passphrase = options?.networkPassphrase ?? Networks.TESTNET;
  const usdcIssuer = options?.usdcIssuer ?? DEFAULT_USDC_ISSUER;
  const usdcAsset = new Asset("USDC", usdcIssuer);

  const tx = new TransactionBuilder(await sourceAccount(sponsor.publicKey(), options ?? {}), {
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

  const txHash = await submit(tx, options ?? {});

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

  const tx = new TransactionBuilder(await sourceAccount(funder.publicKey(), options ?? {}), {
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

  return submit(tx, options ?? {});
}
