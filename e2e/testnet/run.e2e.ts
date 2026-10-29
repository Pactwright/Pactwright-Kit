/** Entry point: `pnpm e2e:testnet`. Sends real testnet transactions; see src/run.ts. */
import { it } from "vitest";
import { main } from "./src/run.ts";

it.skipIf(!process.env.E2E_VERIFIER_SECRET)("every MVP scenario on Stellar testnet", main, 900_000);
