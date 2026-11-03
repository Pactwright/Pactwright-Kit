/**
 * Vercel Function entrypoint for the verifier. ROADMAP V-10.
 *
 * Builds the same app as `main.ts`, once per function instance, and hands Vercel a Node request
 * listener. Configuration comes from the project's environment variables; an incomplete one
 * fails every request with the list of problems instead of serving a half-configured verifier.
 * Bundled by `scripts/build-vercel.mjs`.
 */
import type { IncomingMessage, ServerResponse } from "node:http";
import { getRequestListener } from "@hono/node-server";
import { loadVerifierConfig, VerifierConfigError } from "./config.ts";
import { buildVerifierApp } from "./server.ts";

type Listener = (req: IncomingMessage, res: ServerResponse) => void;

let listener: Promise<Listener> | undefined;

function build(): Promise<Listener> {
  return (async () => {
    const app = await buildVerifierApp(loadVerifierConfig(process.env));
    return getRequestListener(app.fetch) as Listener;
  })();
}

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  listener ??= build();
  let serve: Listener;
  try {
    serve = await listener;
  } catch (e) {
    // Rebuild on the next request: a transient failure (database unreachable) shouldn't stick.
    listener = undefined;
    const problems = e instanceof VerifierConfigError ? e.problems : ["the verifier could not start"];
    console.error(JSON.stringify({ level: "error", msg: "verifier failed to start", problems }));
    res.statusCode = 503;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ error: "not_configured", problems }));
    return;
  }
  serve(req, res);
}
