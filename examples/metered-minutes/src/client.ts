import type { Keypair } from "@stellar/stellar-base";
import { startMeterLoop, type MeterLoop, type SignedUsageVoucher } from "@pactwright/agent";

export interface MeteredClientSession {
  loop: MeterLoop;
  vouchersSent: number;
}

export function startMeteredClient(
  pactId: string,
  buyerKeypair: Keypair,
  unitPrice = "0.05",
  cap = "0.50",
  onVoucherSent?: (voucher: SignedUsageVoucher) => Promise<void> | void,
): MeteredClientSession {
  let vouchersSent = 0;

  const loop = startMeterLoop(pactId, unitPrice, cap, {
    signerKeypair: buyerKeypair,
    onVoucher: async (signed) => {
      vouchersSent++;
      if (onVoucherSent) {
        await onVoucherSent(signed);
      }
    },
  });

  return { loop, vouchersSent };
}
