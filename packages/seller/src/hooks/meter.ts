/** v1: keep the latest usage voucher; call close_meter. ROADMAP P7-03. */
import { Keypair } from "@stellar/stellar-base";
import { usageMessage, type UsageVoucher } from "@pactwright/core";

export interface StoredMeterVoucher {
  pactId: string;
  units: number;
  signature: string;
  buyerPublicKey: string;
  receivedAt: number;
}

export interface MeterHookOptions {
  facilitatorUrl?: string;
  fetchImpl?: typeof fetch;
  apiKey?: string;
}

export interface CloseMeterResult {
  closed: boolean;
  pactId: string;
  units: number;
  txHash?: string;
  error?: string;
}

export class MeterHook {
  private vouchers = new Map<string, StoredMeterVoucher>();
  private facilitatorUrl: string;
  private fetchImpl: typeof fetch;
  private apiKey?: string;

  constructor(options?: MeterHookOptions) {
    this.facilitatorUrl =
      options?.facilitatorUrl ?? process.env.FACILITATOR_URL ?? "https://facilitator.pactwright.dev";
    this.fetchImpl = options?.fetchImpl ?? globalThis.fetch;
    this.apiKey = options?.apiKey ?? process.env.FACILITATOR_API_KEY;
  }

  /**
   * Validates and records an incoming usage voucher.
   * Ensures the signature is valid for the buyer key and units are monotonically increasing.
   */
  async onUsageVoucher(
    pactId: string,
    voucher: { units?: number; signature: string; voucher?: { units: number } },
    buyerPublicKey: string,
  ): Promise<StoredMeterVoucher> {
    const units = typeof voucher.units === "number" ? voucher.units : voucher.voucher?.units;
    if (typeof units !== "number") {
      throw new Error("Missing or invalid units in usage voucher");
    }

    const usageVoucher: UsageVoucher = {
      pactId,
      units,
    };

    const digest = usageMessage(usageVoucher);
    const keypair = Keypair.fromPublicKey(buyerPublicKey);

    const valid = keypair.verify(Buffer.from(digest), Buffer.from(voucher.signature, "base64"));
    if (!valid) {
      throw new Error(`Invalid voucher signature for pact ${pactId} from buyer ${buyerPublicKey}`);
    }

    const existing = this.vouchers.get(pactId);
    if (existing && units <= existing.units) {
      throw new Error(
        `Voucher units must strictly increase: received ${units}, current is ${existing.units}`,
      );
    }

    const stored: StoredMeterVoucher = {
      pactId,
      units,
      signature: voucher.signature,
      buyerPublicKey,
      receivedAt: Date.now(),
    };

    this.vouchers.set(pactId, stored);
    return stored;
  }

  getLatestVoucher(pactId: string): StoredMeterVoucher | undefined {
    return this.vouchers.get(pactId);
  }

  /**
   * Submits the latest voucher to close the meter via /pact/submit.
   */
  async closeMeter(pactId: string): Promise<CloseMeterResult> {
    const latest = this.vouchers.get(pactId);
    if (!latest) {
      throw new Error(`No usage voucher found for pact ${pactId}`);
    }

    const url = `${this.facilitatorUrl.replace(/\/$/, "")}/pact/submit`;
    const payload = {
      action: "close_meter",
      pact_id: pactId,
      units: latest.units,
      signature: latest.signature,
    };

    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (this.apiKey) {
      headers["Authorization"] = `Bearer ${this.apiKey}`;
    }

    try {
      const res = await this.fetchImpl(url, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const text = await res.text();
        return {
          closed: false,
          pactId,
          units: latest.units,
          error: `Facilitator rejected close_meter (${res.status}): ${text}`,
        };
      }

      const data = (await res.json().catch(() => ({}))) as {
        tx_hash?: string;
        hash?: string;
        transaction?: string;
        success?: boolean;
        errorReason?: string;
      };
      const txHash = data.tx_hash ?? data.hash ?? data.transaction;
      if (!txHash || data.success === false) {
        return {
          closed: false,
          pactId,
          units: latest.units,
          error: data.errorReason ?? "Facilitator returned no transaction hash for close_meter",
        };
      }
      return {
        closed: true,
        pactId,
        units: latest.units,
        txHash,
      };
    } catch (err: unknown) {
      return {
        closed: false,
        pactId,
        units: latest.units,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }
}

export function createMeterHook(options?: MeterHookOptions): MeterHook {
  return new MeterHook(options);
}
