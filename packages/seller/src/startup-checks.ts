/** Fails fast: USDC trustline present, network config complete, keys loadable. ROADMAP K-06. */
import { loadNetworkConfig, StellarAddress } from "@pactwright/core";

export interface StartupCheckOptions {
  env?: NodeJS.ProcessEnv;
  fetchImpl?: typeof fetch;
}

export async function runStartupChecks(options?: StartupCheckOptions): Promise<void> {
  const env = options?.env ?? process.env;
  const net = loadNetworkConfig(env);

  // 1. Check seller delivery key
  const deliveryKey = env.SELLER_DELIVERY_KEY?.trim();
  if (!deliveryKey || !/^[0-9a-fA-F]{64}$/.test(deliveryKey)) {
    throw new Error(
      "SELLER_DELIVERY_KEY is missing or invalid: must be a 64-character hex-encoded 32-byte ed25519 seed.",
    );
  }

  // 2. Check seller account address
  const sellerAddress = (env.SELLER_ADDRESS ?? env.SELLER_SIGNING_KEY_REF)?.trim();
  if (!sellerAddress) {
    throw new Error("SELLER_ADDRESS (or SELLER_SIGNING_KEY_REF) is not set.");
  }
  const parsedAddress = StellarAddress.safeParse(sellerAddress);
  if (!parsedAddress.success) {
    throw new Error(`SELLER_ADDRESS is invalid: "${sellerAddress}" is not a valid Stellar address.`);
  }

  // 3. Check USDC trustline
  const doFetch = options?.fetchImpl ?? globalThis.fetch;
  if (typeof doFetch !== "function") {
    throw new Error("No fetch implementation available for startup trustline check.");
  }

  // Determine Horizon base URL
  const horizonUrl = env.STELLAR_HORIZON_URL?.trim().replace(/\/$/, "") ||
    (net.network === "pubnet"
      ? "https://horizon.stellar.org"
      : "https://horizon-testnet.stellar.org");

  const accountUrl = `${horizonUrl}/accounts/${sellerAddress}`;

  let res: Response;
  try {
    res = await doFetch(accountUrl);
  } catch (err) {
    throw new Error(`Failed to reach Horizon at ${accountUrl} to verify seller account: ${String(err)}`);
  }

  if (res.status === 404) {
    throw new Error(`Seller account ${sellerAddress} does not exist on Stellar ${net.network}.`);
  }
  if (!res.ok) {
    throw new Error(`Horizon returned HTTP ${res.status} when checking seller account ${sellerAddress}.`);
  }

  interface AccountResponse {
    balances?: Array<{
      asset_type: string;
      asset_code?: string;
      asset_issuer?: string;
    }>;
  }

  let data: AccountResponse;
  try {
    data = (await res.json()) as AccountResponse;
  } catch (err) {
    throw new Error(`Failed to parse Horizon account data for ${sellerAddress}: ${String(err)}`);
  }

  const hasUsdc = data.balances?.some(
    (b) => b.asset_code === "USDC" || b.asset_type === "liquidity_pool_shares",
  );

  if (!hasUsdc) {
    throw new Error(`Seller account ${sellerAddress} does not have a USDC trustline.`);
  }
}
