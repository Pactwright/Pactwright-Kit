/** Express middleware: pact(options). ROADMAP K-06. */
import type { RequestHandler, Request } from "express";
import { notImplemented } from "@pactwright/core";
import type { PactRouteOptions } from "./pact.ts";

export function pact(_options: PactRouteOptions<Request>): RequestHandler {
  return () => notImplemented("K-06");
}
