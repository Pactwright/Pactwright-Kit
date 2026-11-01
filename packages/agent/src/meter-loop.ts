/** v1: signs cumulative UsageVouchers in the background; never beyond cap (ADR-010). ROADMAP P7-02. */
import { Keypair } from "@stellar/stellar-base";
import {
  toStroops,
  usageMessage,
  type UsageVoucher,
} from "@pactwright/core";

export interface SignedUsageVoucher {
  voucher: UsageVoucher;
  signature: string;
  digestHex: string;
}

export interface MeterLoopOptions {
  signerKeypair?: Keypair;
  signerSecret?: string;
  intervalMs?: number;
  onVoucher?: (signed: SignedUsageVoucher) => Promise<void> | void;
  onError?: (err: Error) => void;
  maxRetries?: number;
}

export interface MeterLoop {
  /** Signs a cumulative voucher with additional units; throws if cap would be exceeded. */
  tick(unitsToAdd?: number): Promise<SignedUsageVoucher>;
  getUnits(): number;
  getLatestVoucher(): SignedUsageVoucher | null;
  stop(): void;
  isActive(): boolean;
}

export function startMeterLoop(
  pactId: string,
  unitPrice: string,
  cap: string,
  options?: MeterLoopOptions,
): MeterLoop {
  const unitPriceStroops = BigInt(toStroops(unitPrice));
  const capStroops = BigInt(toStroops(cap));

  let keypair: Keypair;
  if (options?.signerKeypair) {
    keypair = options.signerKeypair;
  } else if (options?.signerSecret) {
    keypair = Keypair.fromSecret(options.signerSecret);
  } else {
    keypair = Keypair.random();
  }

  let currentUnits = 0;
  let latestVoucher: SignedUsageVoucher | null = null;
  let active = true;
  let timer: ReturnType<typeof setInterval> | null = null;
  let inFlight = false;
  let retryCount = 0;
  const maxRetries = options?.maxRetries ?? 3;

  async function tick(unitsToAdd = 1): Promise<SignedUsageVoucher> {
    if (!active) {
      throw new Error("MeterLoop has already stopped");
    }
    if (inFlight) {
      return latestVoucher!;
    }
    inFlight = true;

    try {
      const nextUnits = currentUnits + unitsToAdd;
      const nextAmount = BigInt(nextUnits) * unitPriceStroops;

      if (nextAmount > capStroops) {
        const err = new Error(
          `Meter cap exceeded: requested ${nextUnits} units (${nextAmount} stroops) exceeds cap (${capStroops} stroops)`,
        );
        if (options?.onError) {
          options.onError(err);
        }
        throw err;
      }

      currentUnits = nextUnits;
      const voucher: UsageVoucher = {
        pactId,
        units: currentUnits,
      };

      const digest = usageMessage(voucher);
      const signature = keypair.sign(Buffer.from(digest)).toString("base64");
      const signed: SignedUsageVoucher = {
        voucher,
        signature,
        digestHex: Buffer.from(digest).toString("hex"),
      };

      latestVoucher = signed;

      if (options?.onVoucher) {
        try {
          await options.onVoucher(signed);
          retryCount = 0;
        } catch (voucherErr) {
          retryCount++;
          if (retryCount >= maxRetries) {
            stop();
          }
          throw voucherErr;
        }
      }

      return signed;
    } finally {
      inFlight = false;
    }
  }

  function stop(): void {
    active = false;
    if (timer !== null) {
      clearInterval(timer);
      timer = null;
    }
  }

  if (options?.intervalMs && options.intervalMs > 0) {
    timer = setInterval(() => {
      if (inFlight) return;
      tick().catch((err: unknown) => {
        if (options.onError && err instanceof Error) {
          options.onError(err);
        }
      });
    }, options.intervalMs);
  }

  return {
    tick,
    getUnits: () => currentUnits,
    getLatestVoucher: () => latestVoucher,
    stop,
    isActive: () => active,
  };
}
