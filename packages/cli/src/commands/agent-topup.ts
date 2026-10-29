/** Top up an agent's budget. ROADMAP K-12. */
import { topUp, type TopUpOptions } from "@pactwright/agent";

export interface AgentTopupCommandOptions extends TopUpOptions {
  log?: (msg: string) => void;
  error?: (msg: string) => void;
}

export async function agentTopup(args: string[], options?: AgentTopupCommandOptions): Promise<void> {
  const log = options?.log ?? console.log;
  const errorLog = options?.error ?? console.error;

  let agent = "";
  let amount = "";
  let funderSecret = process.env.FUNDER_SECRET;

  const positional: string[] = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--funder-secret" && args[i + 1]) {
      funderSecret = args[i + 1];
      i++;
    } else if (!args[i]?.startsWith("--")) {
      positional.push(args[i]!);
    }
  }

  agent = positional[0] ?? "";
  amount = positional[1] ?? "";
  if (positional[2] && !funderSecret) {
    funderSecret = positional[2];
  }

  if (!agent || !amount || !funderSecret) {
    errorLog("usage: pactwright agent-topup <agent-address> <amount> [--funder-secret <secret>]");
    process.exitCode = 2;
    return;
  }

  try {
    const tx = await topUp(agent, amount, funderSecret, options);
    log(`✓ Agent budget topped up`);
    log(`  Agent:  ${agent}`);
    log(`  Amount: ${amount} USDC`);
    log(`  Tx:     ${tx}`);
  } catch (err) {
    errorLog(`Failed to top up agent account: ${String(err)}`);
    process.exitCode = 1;
  }
}
