# Seller Middleware: Express & Hono Parity and Migration Guide

This guide describes the API parity between the `@pactwright/seller` middleware implementations for Express and Hono, and explains how to migrate between them or run both side-by-side (ROADMAP P7-07, P9-08, FR-I3).

## Feature Parity Matrix

| Feature | Express (`pact(...)`) | Hono (`pactHono(...)`) |
|---|---|---|
| Automatic 402 Payment Required response | ✅ Supported | ✅ Supported |
| `WWW-Authenticate` and `accepts` payload | ✅ Supported | ✅ Supported |
| Reads `X-Payment` and `X-Pactwright-Pact` | ✅ Supported | ✅ Supported |
| Signed `X-Pactwright-Delivery` header | ✅ Supported | ✅ Supported |
| Refusal of terminal pacts (409 Conflict) | ✅ Supported | ✅ Supported |
| Settle & Dispute hooks compatibility | ✅ Supported | ✅ Supported |
| KMS-backed key signing support | ✅ Supported | ✅ Supported |

## Express Usage

```typescript
import express from "express";
import { pact } from "@pactwright/seller";

const app = express();

app.use(
  "/api/translate",
  pact({
    price: "0.50",
    description: "Translation API",
    condition: { kind: "document.translation" },
  }),
);

app.post("/api/translate", (req, res) => {
  res.json({ result: "Translated text" });
});

app.listen(3000);
```

## Hono Usage

```typescript
import { Hono } from "hono";
import { pactHono } from "@pactwright/seller";

const app = new Hono();

app.use(
  "/api/translate",
  pactHono({
    price: "0.50",
    description: "Translation API",
    condition: { kind: "document.translation" },
  }),
);

app.post("/api/translate", (c) => {
  return c.json({ result: "Translated text" });
});

export default app;
```

## Migration Steps (Express → Hono)

1. Replace `import { pact } from "@pactwright/seller"` with `import { pactHono } from "@pactwright/seller"`.
2. Replace Express route handlers `(req, res)` with Hono context handlers `(c)`.
3. Route options (`PactRouteOptions`) and configuration (`SellerConfig`) parameters are identical and fully compatible across both runtimes.
