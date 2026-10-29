/**
 * Network configuration. Refuses to load when anything is missing or inconsistent, so a
 * service can never silently fall back to testnet (ARCHITECTURE §12).
 */
import { StellarAddress } from "./schemas.ts";

export type NetworkName = "testnet" | "pubnet";

export interface NetworkConfig {
  network: NetworkName;
  passphrase: string;
  rpcUrl: string;
  usdcSac: string;
  pactContract?: string;
  receiptAnchor: string;
  facilitatorUrl: string;
}

export const PASSPHRASES: Record<NetworkName, string> = {
  testnet: "Test SDF Network ; September 2015",
  pubnet: "Public Global Stellar Network ; September 2015",
};

export class NetworkConfigError extends Error {
  constructor(public readonly problems: string[]) {
    super(`invalid network configuration:\n- ${problems.join("\n- ")}`);
    this.name = "NetworkConfigError";
  }
}

function isUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

/** Reads `STELLAR_NETWORK`, `STELLAR_NETWORK_PASSPHRASE`, `STELLAR_RPC_URL`, `USDC_SAC_ID`,
 *  `RECEIPT_ANCHOR_ID`, `FACILITATOR_URL` and optional `PACT_CONTRACT_ID`. Reports every
 *  problem at once. */
export function loadNetworkConfig(env: NodeJS.ProcessEnv): NetworkConfig {
  const problems: string[] = [];
  const get = (name: string): string => {
    const value = env[name]?.trim();
    if (!value) problems.push(`${name} is not set`);
    return value ?? "";
  };

  const network = get("STELLAR_NETWORK");
  const passphrase = get("STELLAR_NETWORK_PASSPHRASE");
  const rpcUrl = get("STELLAR_RPC_URL");
  const usdcSac = get("USDC_SAC_ID");
  const receiptAnchor = get("RECEIPT_ANCHOR_ID");
  const facilitatorUrl = get("FACILITATOR_URL");
  const pactContract = env.PACT_CONTRACT_ID?.trim() || undefined;

  if (network && network !== "testnet" && network !== "pubnet") {
    problems.push(`STELLAR_NETWORK must be "testnet" or "pubnet", got ${JSON.stringify(network)}`);
  }
  if ((network === "testnet" || network === "pubnet") && passphrase && passphrase !== PASSPHRASES[network]) {
    problems.push(`STELLAR_NETWORK_PASSPHRASE does not match STELLAR_NETWORK=${network}`);
  }
  // Pubnet guard (P7-14, ARCH §12)
  if (network === "pubnet" && env.PUBNET_CONFIRM_REAL_FUNDS !== "true") {
    problems.push('PUBNET_CONFIRM_REAL_FUNDS must be "true" when running on pubnet');
  }
  for (const [name, value] of [["STELLAR_RPC_URL", rpcUrl], ["FACILITATOR_URL", facilitatorUrl]] as const) {
    if (value && !isUrl(value)) problems.push(`${name} is not an http(s) URL`);
  }
  for (const [name, value] of [
    ["USDC_SAC_ID", usdcSac],
    ["RECEIPT_ANCHOR_ID", receiptAnchor],
    ["PACT_CONTRACT_ID", pactContract],
  ] as const) {
    if (value && !StellarAddress.safeParse(value).success) problems.push(`${name} is not a Stellar address`);
  }

  if (problems.length) throw new NetworkConfigError(problems);
  return {
    network: network as NetworkName,
    passphrase,
    rpcUrl,
    usdcSac,
    ...(pactContract ? { pactContract } : {}),
    receiptAnchor,
    facilitatorUrl,
  };
}
