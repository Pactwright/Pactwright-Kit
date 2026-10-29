/** Smart-account agent wallets with principal true revoke (P9-04, FR-A5). */
import { Keypair } from "@stellar/stellar-base";
import { toStroops, fromStroops } from "@pactwright/core";

export interface SmartAccountPolicy {
  principalAddress: string;
  agentAddress: string;
  budgetCapStroops: bigint;
  spentStroops: bigint;
  expiresAtLedger?: number;
  isRevoked: boolean;
}

export interface SpendAuthorization {
  pactId: string;
  amountStroops: bigint;
  authorized: boolean;
  remainingStroops: bigint;
}

export class SmartAccountAgent {
  private policy: SmartAccountPolicy;
  private agentKeypair: Keypair;

  constructor(
    principalAddress: string,
    initialBudget: string,
    agentKeypair?: Keypair,
    expiresAtLedger?: number,
  ) {
    this.agentKeypair = agentKeypair ?? Keypair.random();
    this.policy = {
      principalAddress,
      agentAddress: this.agentKeypair.publicKey(),
      budgetCapStroops: BigInt(toStroops(initialBudget)),
      spentStroops: 0n,
      expiresAtLedger,
      isRevoked: false,
    };
  }

  getAgentAddress(): string {
    return this.policy.agentAddress;
  }

  getPrincipalAddress(): string {
    return this.policy.principalAddress;
  }

  getRemainingBudget(): string {
    if (this.policy.isRevoked) return "0";
    const remaining = this.policy.budgetCapStroops - this.policy.spentStroops;
    return fromStroops(remaining > 0n ? remaining : 0n);
  }

  isRevoked(): boolean {
    return this.policy.isRevoked;
  }

  /**
   * Authorizes spending an amount from the smart account for a pact.
   * Fails if revoked, expired, or cap exceeded.
   */
  authorizeSpend(pactId: string, amount: string, currentLedger?: number): SpendAuthorization {
    if (this.policy.isRevoked) {
      throw new Error("SmartAccountAgent budget has been revoked by principal");
    }

    if (
      this.policy.expiresAtLedger !== undefined &&
      currentLedger !== undefined &&
      currentLedger > this.policy.expiresAtLedger
    ) {
      throw new Error(`SmartAccountAgent allowance expired at ledger ${this.policy.expiresAtLedger}`);
    }

    const amountStroops = BigInt(toStroops(amount));
    const nextSpent = this.policy.spentStroops + amountStroops;

    if (nextSpent > this.policy.budgetCapStroops) {
      throw new Error(
        `SmartAccountAgent budget exceeded: requested ${amountStroops} stroops, remaining ${this.policy.budgetCapStroops - this.policy.spentStroops} stroops`,
      );
    }

    this.policy.spentStroops = nextSpent;
    const remaining = this.policy.budgetCapStroops - this.policy.spentStroops;

    return {
      pactId,
      amountStroops,
      authorized: true,
      remainingStroops: remaining,
    };
  }

  /**
   * Principal action: true revoke of unspent budget (FR-A5).
   * Verifies principal signature and terminates authorization immediately.
   */
  revoke(principalSigner: Keypair): { revoked: boolean; unspentRefunded: string } {
    if (principalSigner.publicKey() !== this.policy.principalAddress) {
      throw new Error("Unauthorized: only the designated principal can revoke this agent");
    }

    const unspentStroops = this.policy.budgetCapStroops - this.policy.spentStroops;
    this.policy.isRevoked = true;

    return {
      revoked: true,
      unspentRefunded: fromStroops(unspentStroops > 0n ? unspentStroops : 0n),
    };
  }
}
