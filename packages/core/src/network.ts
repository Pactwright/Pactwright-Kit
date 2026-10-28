/** Network configuration. Refuses to load when incomplete (no silent testnet fallback). */
import { notImplemented } from "./errors.ts";

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

export function loadNetworkConfig(_env: NodeJS.ProcessEnv): NetworkConfig {
  return notImplemented("K-04");
}
