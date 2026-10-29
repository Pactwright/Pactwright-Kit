import { describe, it, expect } from "vitest";
import { Keypair, Operation, TransactionBuilder, Account, Networks, Address, xdr, Asset } from "@stellar/stellar-base";
import { createRefundSigner } from "../src/refund-signer.ts";

describe("RefundSigner (P7-15, F-12, Q5)", () => {
  const merchantKey = Keypair.random();
  const signer = createRefundSigner(merchantKey.secret());
  const source = new Account(merchantKey.publicKey(), "100");

  it("signs transaction when operation is invokeContract refund", () => {
    const contractId = Buffer.alloc(32, 1);
    const contractAddress = Address.contract(contractId).toScAddress();

    const hostFn = xdr.HostFunction.hostFunctionTypeInvokeContract(
      new xdr.InvokeContractArgs({
        contractAddress,
        functionName: "refund",
        args: [xdr.ScVal.scvString("payment_123")],
      }),
    );

    const tx = new TransactionBuilder(source, {
      fee: "100",
      networkPassphrase: Networks.TESTNET,
    })
      .addOperation(
        Operation.invokeHostFunction({
          func: hostFn,
          auth: [],
        }),
      )
      .setTimeout(30)
      .build();

    const signedXdr = signer.signTransaction(tx.toXDR());
    expect(signedXdr).toBeDefined();

    const parsed = TransactionBuilder.fromXDR(signedXdr, Networks.TESTNET);
    expect(parsed.signatures.length).toBe(1);
  });

  it("rejects non-refund operations", () => {
    const dest = Keypair.random();
    const tx = new TransactionBuilder(source, {
      fee: "100",
      networkPassphrase: Networks.TESTNET,
    })
      .addOperation(
        Operation.payment({
          destination: dest.publicKey(),
          asset: Asset.native(),
          amount: "10",
        }),
      )
      .setTimeout(30)
      .build();

    expect(() => signer.signTransaction(tx.toXDR())).toThrow(/not invokeHostFunction/);
  });
});
