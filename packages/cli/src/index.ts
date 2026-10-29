#!/usr/bin/env node
/** `pactwright <command>` (ROADMAP K-12). */
import { verify } from "./commands/verify.ts";
import { pact } from "./commands/pact.ts";
import { agentCreate } from "./commands/agent-create.ts";
import { agentTopup } from "./commands/agent-topup.ts";

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

const args = process.argv.slice(2);
if (import.meta.url === `file://${process.argv[1]}`) {
  const [name, ...cmdArgs] = args;
  const command = name ? commands[name] : undefined;
  if (!command) {
    console.error(`usage: pactwright <${Object.keys(commands).join("|")}> [...args]`);
    process.exit(2);
  }
  await command(cmdArgs);
}
