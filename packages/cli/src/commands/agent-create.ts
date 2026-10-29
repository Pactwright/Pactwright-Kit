/** Create an agent account with sponsored reserves + trustline. ROADMAP K-12. */
import { createAgentAccount, type CreateAgentOptions } from "@pactwright/agent";

export interface AgentCreateCommandOptions extends CreateAgentOptions {
  log?: (msg: string) => void;
  error?: (msg: string) => void;
}

export async function agentCreate(args: string[], options?: AgentCreateCommandOptions): Promise<void> {
  const log = options?.log ?? console.log;
  const errorLog = options?.error ?? console.error;

  let sponsorSecret = process.env.SPONSOR_SECRET;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--sponsor-secret" && args[i + 1]) {
      sponsorSecret = args[i + 1];
      i++;
    } else if (!args[i]?.startsWith("--") && !sponsorSecret) {
      sponsorSecret = args[i];
    }
  }

  if (!sponsorSecret) {
    errorLog("usage: pactwright agent-create [--sponsor-secret <secret>]");
    process.exitCode = 2;
    return;
  }

  try {
    const result = await createAgentAccount(sponsorSecret, options);
    log(`✓ Agent account created`);
    log(`  Address: ${result.address}`);
    log(`  Tx:      ${result.tx}`);
    if (result.agentSecret) {
      log(`  Secret:  ${result.agentSecret}`);
    }
  } catch (err) {
    errorLog(`Failed to create agent account: ${String(err)}`);
    process.exitCode = 1;
  }
}
