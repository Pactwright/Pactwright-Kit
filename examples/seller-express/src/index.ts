/**
 * Smallest protected seller endpoint with Express (ROADMAP K-15).
 * x402 paywall (verified and settled by the facilitator before serving), a signed
 * X-Pactwright-Delivery receipt, and translated content.
 */
import express, { type Request, type Response } from "express";
import type { FacilitatorClient } from "@x402/core/server";
import { pact, runStartupChecks, resolveSellerConfig, type SellerConfig } from "@pactwright/seller";

export function createApp(
  overrides?: Partial<SellerConfig>,
  facilitator?: FacilitatorClient,
): express.Express {
  const config = resolveSellerConfig(overrides);
  const app = express();
  app.use(express.json());

  app.get("/health", (_req: Request, res: Response) => {
    res.json({ ok: true, seller: config.sellerAddress });
  });

  // Smallest protected endpoint: /translate
  app.get(
    "/translate",
    pact(
      {
        mode: "exact-refund",
        price: "0.25",
        asset: "USDC",
        condition: (req: Request) => ({
          kind: "document.translation",
          lang: (req.query.to as string) || "es",
          minPages: 1,
        }),
        verify: { minAmount: "0.10" },
        refundWindowLedgers: 17280,
      },
      config,
      facilitator,
    ),
    (req: Request, res: Response) => {
      const targetLang = (req.query.to as string) || "es";
      const text = (req.query.text as string) || "Hello world";
      const translated =
        targetLang === "es" ? "Hola mundo" : `[Translated to ${targetLang}]: ${text}`;

      res.json({
        text,
        targetLang,
        translated,
        pages: 1,
      });
    },
  );
  return app;
}

const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 4000;

const isMain =
  process.argv[1] && (process.argv[1].endsWith("index.ts") || process.argv[1].endsWith("index.js"));
if (process.env.NODE_ENV !== "test" && isMain) {
  runStartupChecks()
    .catch((err) => {
      console.warn("Startup check warning:", err.message);
    })
    .finally(() => {
      createApp().listen(port, () => {
        console.log(`Seller Express example listening on http://localhost:${port}`);
      });
    });
}
