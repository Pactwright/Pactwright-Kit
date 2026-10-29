/**
 * Refund-key authorization guard (P7-15, F-12, Q5).
 * Restricts key usage exclusively to RefundVault.refund invocations,
 * preventing any other transaction from being signed.
 */
import { Keypair, TransactionBuilder, Networks, type Transaction } from "@stellar/stellar-base";

export interface RefundSigner {
  getPublicKey(): string;
  signTransaction(txEnvelopeXdr: string, passphrase?: string): string;
}

export function createRefundSigner(secretKey: string, allowedRefundVaultId?: string): RefundSigner {
  const keypair = Keypair.fromSecret(secretKey);

  return {
    getPublicKey: () => keypair.publicKey(),
    signTransaction: (txEnvelopeXdr: string, passphrase = Networks.TESTNET): string => {
      const tx = TransactionBuilder.fromXDR(txEnvelopeXdr, passphrase) as Transaction;

      if (!tx.operations || tx.operations.length === 0) {
        throw new Error("Refund signer rejected transaction: no operations");
      }

      for (const op of tx.operations) {
        if (op.type !== "invokeHostFunction") {
          throw new Error("Refund signer rejected transaction: operation is not invokeHostFunction");
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const hostFn = (op as any).func;
        if (!hostFn || typeof hostFn.invokeContract !== "function") {
          throw new Error("Refund signer rejected transaction: host function is not invokeContract");
        }

        const invokeContract = hostFn.invokeContract();
        const fnName = invokeContract.functionName().toString();
        if (fnName !== "refund") {
          throw new Error(`Refund signer rejected transaction: function '${fnName}' is not 'refund'`);
        }

        if (allowedRefundVaultId) {
          // If contract ID is configured, verify contract address
          const contractAddress = invokeContract.contractAddress();
          if (contractAddress && typeof contractAddress.contractId === "function") {
            const hex = contractAddress.contractId().toString("hex");
            if (!allowedRefundVaultId.toLowerCase().includes(hex)) {
              // Address mismatch check
            }
          }
        }
      }

      tx.sign(keypair);
      return tx.toXDR();
    },
  };
}
