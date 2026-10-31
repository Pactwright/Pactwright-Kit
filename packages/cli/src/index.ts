#!/usr/bin/env node
/** `pactwright <command>` (ROADMAP K-12). */
import { verify } from "./commands/verify.ts";
import { pact } from "./commands/pact.ts";
import { agentCreate } from "./commands/agent-create.ts";
import { agentTopup } from "./commands/agent-topup.ts";
import { readFileSync, realpathSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";

export { verify, type VerifyCommandOptions } from "./commands/verify.ts";
export { pact, type PactCommandOptions } from "./commands/pact.ts";
export { agentCreate, type AgentCreateCommandOptions } from "./commands/agent-create.ts";
export { agentTopup, type AgentTopupCommandOptions } from "./commands/agent-topup.ts";

const commands: Record<string, (args: string[]) => Promise<void>> = {
  verify,
  pact,
  "agent-create": agentCreate,
  "agent-topup": agentTopup,
};

const usage = `Usage: pactwright <command> [args]

Commands:
  verify <envelope>       Verify a signed envelope offline
  pact <pact-id>          Read a pact from the facilitator
  agent-create            Create an agent account
  agent-topup             Add USDC to an agent budget

Options:
  -h, --help              Show this help
  -v, --version           Show the installed version`;

const args = process.argv.slice(2);
const invokedPath = process.argv[1];
const isDirectEntry =
  invokedPath !== undefined &&
  (() => {
    try {
      return import.meta.url === pathToFileURL(realpathSync(invokedPath)).href;
    } catch {
      return false;
    }
  })();

if (isDirectEntry) {
  const [name, ...cmdArgs] = args;
  if (name === "--help" || name === "-h" || name === undefined) {
    console.log(usage);
    if (name === undefined) process.exitCode = 2;
  } else if (name === "--version" || name === "-v") {
    const packageJson = JSON.parse(
      readFileSync(fileURLToPath(new URL("../package.json", import.meta.url)), "utf8"),
    ) as {
      version: string;
    };
    console.log(packageJson.version);
  } else {
    const command = commands[name];
    if (!command) {
      console.error(`Unknown command: ${name}\n\n${usage}`);
      process.exitCode = 2;
    } else {
      await command(cmdArgs);
    }
  }
}
