import express, { type Request, type Response } from "express";
import { createMeterHook, type MeterHook } from "@pactwright/seller";

export interface ServerInstance {
  app: express.Express;
  meterHook: MeterHook;
  pactId: string;
  buyerAddress: string;
}

export function createMeteredServer(pactId: string, buyerAddress: string): ServerInstance {
  const app = express();
  app.use(express.json());

  const meterHook = createMeterHook();

  // Endpoint to receive usage vouchers
  app.post("/meter/voucher", async (req: Request, res: Response) => {
    const { voucher, signature } = req.body as {
      voucher: { units: number };
      signature: string;
    };

    try {
      const stored = await meterHook.onUsageVoucher(pactId, { units: voucher.units, signature }, buyerAddress);
      res.json({ ok: true, units: stored.units });
    } catch (err: unknown) {
      res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  // Endpoint to conclude session
  app.post("/meter/stop", async (_req: Request, res: Response) => {
    try {
      const result = await meterHook.closeMeter(pactId);
      res.json(result);
    } catch (err: unknown) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  return { app, meterHook, pactId, buyerAddress };
}
