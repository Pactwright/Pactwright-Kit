#!/usr/bin/env node
/** `pactwright <command>` (ROADMAP K-12). */
import { realpathSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { verify } from "./commands/verify.ts";
import { pact } from "./commands/pact.ts";
import { agentCreate } from "./commands/agent-create.ts";
import { agentTopup } from "./commands/agent-topup.ts";

export { verify, type VerifyCommandOptions } from "./commands/verify.ts";
export { pact, type PactCommandOptions } from "./commands/pact.ts";
export { agentCreate, type AgentCreateCommandOptions } from "./commands/agent-create.ts";
export { agentTopup, type AgentTopupCommandOptions } from "./commands/agent-topup.ts";

export const VERSION = "0.1.0";

const commands: Record<string, (args: string[]) => Promise<void>> = {
  verify,
  pact,
  "agent-create": agentCreate,
  "agent-topup": agentTopup,
};

export function showHelp(): void {
  console.log(`Usage: pactwright <command> [options]

Commands:
  verify        Verify a signed verdict offline
  pact          Display terms, receipt, or certificate for a pact
  agent-create  Create and fund an agent keypair with testnet USDC
  agent-topup   Top up an existing agent keypair from a sponsor account

Options:
  --help, -h     Show help
  --version, -v  Show version number`);
}

export function showVersion(): void {
  console.log(VERSION);
}

function isDirectExecution(): boolean {
  if (!process.argv[1]) return false;
  try {
    const realEntry = realpathSync(process.argv[1]);
    const realUrl = pathToFileURL(realEntry).href;
    const currentUrl = import.meta.url;
    return currentUrl === realUrl || currentUrl.replace(/\.ts$/, ".js") === realUrl || realUrl.replace(/\.ts$/, ".js") === currentUrl;
  } catch {
    return import.meta.url === `file://${process.argv[1]}`;
  }
}

if (isDirectExecution()) {
  const args = process.argv.slice(2);
  const [name, ...cmdArgs] = args;

  if (!name || name === "--help" || name === "-h" || name === "help") {
    showHelp();
    process.exit(0);
  }

  if (name === "--version" || name === "-v" || name === "version") {
    showVersion();
    process.exit(0);
  }

  const command = commands[name];
  if (!command) {
    console.error(`usage: pactwright <${Object.keys(commands).join("|")}> [...args]`);
    process.exit(2);
  }

  try {
    await command(cmdArgs);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(msg);
    process.exit(1);
  }
}
