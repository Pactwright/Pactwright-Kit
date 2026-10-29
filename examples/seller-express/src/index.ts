/**
 * Smallest protected seller endpoint with Express (ROADMAP K-15).
 * Enforces X-PAYMENT (402), signs X-Pactwright-Delivery receipt, and returns translated content.
 */
import express, { type Request, type Response } from "express";
import { pact, runStartupChecks, resolveSellerConfig } from "@pactwright/seller";

export const app = express();
app.use(express.json());

const config = resolveSellerConfig();

app.get("/health", (_req: Request, res: Response) => {
  res.json({ ok: true, seller: config.sellerAddress });
});

// Smallest protected endpoint: /translate
app.get(
  "/translate",
  pact({
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
  }),
  (req: Request, res: Response) => {
    const targetLang = (req.query.to as string) || "es";
    const text = (req.query.text as string) || "Hello world";
    const translated = targetLang === "es" ? "Hola mundo" : `[Translated to ${targetLang}]: ${text}`;

    res.json({
      text,
      targetLang,
      translated,
      pages: 1,
    });
  },
);

const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 4000;

const isMain = process.argv[1] && (process.argv[1].endsWith("index.ts") || process.argv[1].endsWith("index.js"));
if (process.env.NODE_ENV !== "test" && isMain) {
  runStartupChecks()
    .catch((err) => {
      console.warn("Startup check warning:", err.message);
    })
    .finally(() => {
      app.listen(port, () => {
        console.log(`Seller Express example listening on http://localhost:${port}`);
      });
    });
}
