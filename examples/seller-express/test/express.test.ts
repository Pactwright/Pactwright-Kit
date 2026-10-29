import { describe, expect, it } from "vitest";
import { app } from "../src/index.ts";
import { Keypair } from "@pactwright/core";
import { DELIVERY_HEADER } from "@pactwright/seller";

// Helper to make mock requests to Express app via supertest-like fetch or custom listener
import http from "node:http";

interface MockResponse<T = Record<string, unknown>> {
  status: number;
  headers: http.IncomingHttpHeaders;
  body: T;
}

function requestApp<T = Record<string, unknown>>(
  method: string,
  path: string,
  headers: Record<string, string> = {},
): Promise<MockResponse<T>> {
  return new Promise((resolve, reject) => {
    const server = http.createServer(app);
    server.listen(0, () => {
      const addr = server.address();
      if (!addr || typeof addr === "string") {
        server.close();
        return reject(new Error("Unable to get server address"));
      }
      const port = addr.port;
      const req = http.request(
        `http://localhost:${port}${path}`,
        { method, headers },
        (res) => {
          let data = "";
          res.on("data", (chunk) => (data += chunk));
          res.on("end", () => {
            server.close();
            let parsed = data;
            try {
              parsed = JSON.parse(data);
            } catch {
              // ignore
            }
            resolve({
              status: res.statusCode || 0,
              headers: res.headers,
              body: parsed,
            });
          });
        },
      );
      req.on("error", (err) => {
        server.close();
        reject(err);
      });
      req.end();
    });
  });
}

describe("examples/seller-express", () => {
  it("serves GET /health with seller identity", async () => {
    const res = await requestApp("GET", "/health");
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.seller).toBeDefined();
  });

  it("returns 402 with pactwright extra on unprotected request to /translate", async () => {
    const res = await requestApp("GET", "/translate?to=es&text=Hello");
    expect(res.status).toBe(402);
    expect(res.body.x402Version).toBe(2);
    expect(res.body.accepts[0].scheme).toBe("exact");
    expect(res.body.accepts[0].extra.pactwright.condition.kind).toBe("document.translation");
    expect(res.body.accepts[0].extra.pactwright.condition.lang).toBe("es");
  });

  it("serves 200 with X-Pactwright-Delivery header when payment headers are provided", async () => {
    const buyerKey = Keypair.random();
    const pactId = "0a".repeat(32);

    const res = await requestApp("GET", "/translate?to=es&text=Hello", {
      "x-payment": JSON.stringify({
        scheme: "exact",
        network: "stellar:testnet",
        pactId,
        buyer: buyerKey.publicKey(),
        txHash: "0b".repeat(32),
      }),
      "x-pactwright-pact": pactId,
    });

    expect(res.status).toBe(200);
    expect(res.body.translated).toBe("Hola mundo");
    expect(res.headers[DELIVERY_HEADER.toLowerCase()]).toBeDefined();
    const delivery = res.headers[DELIVERY_HEADER.toLowerCase()] as string;
    expect(delivery).toMatch(/^sha256=[0-9a-f]{64};\s*sig=[A-Za-z0-9+/=]+$/);
  });
});
