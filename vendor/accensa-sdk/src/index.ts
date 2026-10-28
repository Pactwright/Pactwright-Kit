import {
  SETTLEMENT_HEADER,
  parseSettlementHeader,
  settlementFromResult,
  routeFromResourceUrl,
  type RequestFacts,
  type Settlement,
  type X402SettleResult,
} from './settlement.js';
import { AccensaError, AccensaNetworkError } from './errors.js';
import { fetchWithRetry, type RetryOptions } from './retry.js';
import { signSettlementPayload } from './signing.js';
import {
  SETTLE_ENDPOINT,
  settleEndpointUrl,
  toSettleHookPayload,
  toSettleReportError,
  type SettleHookPayload,
  type SettleHookResult,
  type SettlementMethod,
} from './settle-report.js';

export { verifyReceipt, buildBatch, receiptLeaf, MAX_PROOF_LEN, type BatchInfo } from './merkle.js';
export { fetchWithRetry, HttpError, type RetryOptions } from './retry.js';
export {
  SETTLEMENT_HEADER,
  parseSettlementHeader,
  settlementFromResult,
  routeFromResourceUrl,
  type RequestFacts,
  type Settlement,
  type X402SettleResult,
} from './settlement.js';
export {
  AccensaError,
  AccensaAuthError,
  AccensaContractError,
  AccensaNetworkError,
  AccensaRateLimitError,
  AccensaTimeoutError,
} from './errors.js';
export {
  SETTLE_ENDPOINT,
  SETTLE_METHODS,
  settleEndpointUrl,
  toSettleHookPayload,
  toSettleMethod,
  isSettleMethod,
  type SettleHookPayload,
  type SettleHookResult,
  type SettlementMethod,
} from './settle-report.js';
export { signSettlementPayload } from './signing.js';

export interface AccensaHookOptions {
  /** Base URL of your Accensa deployment, e.g. https://accensa-dashboard.vercel.app */
  indexerUrl: string;
  /** Ed25519 private key in hex format to sign the settlement report. */
  privateKeyHex: string;
  /**
   * Identifies which key signed this report, when multiple keys are active
   * during a rollover. Passed to the indexer as the X-Key-Id header.
   */
  keyId?: string;
  /** Abandon a report after this many milliseconds. Defaults to 5000. */
  timeoutMs?: number;
  /** Injected in tests. Defaults to global fetch. */
  fetchImpl?: typeof fetch;
  /**
   * Retry policy for delivering the report (#123). Defaults to 3 retries
   * with exponential backoff starting at 200ms; a 4xx response from the
   * indexer is never retried, since the request itself won't become valid by
   * asking again.
   */
  retry?: RetryOptions;
  /**
   * Called when reporting fails, with the payload that could not be delivered.
   * Reporting is best-effort by design — a paid request must not fail because
   * attribution could not be recorded — but failures should be visible rather
   * than swallowed. Defaults to `console.error`.
   */
  onError?: (error: unknown, payload?: SettleHookPayload) => void;
}

export const DEFAULT_TIMEOUT_MS = 5_000;

export interface AttributableRequest {
  method?: string;
  path?: string;
  route?: { path?: string };
  headers?: Record<string, string | string[] | undefined>;
}

export async function reportSettlement(
  settlement: Settlement,
  opts: AccensaHookOptions,
): Promise<boolean> {
  if (!opts || typeof opts !== 'object') {
    reportToConsole(new AccensaError('Invalid options supplied to reportSettlement'));
    return false;
  }

  const report = opts.onError ?? reportToConsole;

  let body: SettleHookPayload | undefined;
  try {
    body = toSettleHookPayload(settlement);
  } catch (error) {
    report(error, body);
    return false;
  }

  if (!opts.indexerUrl || typeof opts.indexerUrl !== 'string') {
    report(new AccensaError('Missing or invalid indexerUrl in options'), body);
    return false;
  }

  const url = settleEndpointUrl(opts.indexerUrl);

  const doFetch = opts.fetchImpl ?? globalThis.fetch;
  if (typeof doFetch !== 'function') {
    report(new AccensaNetworkError('No fetch implementation available'), body);
    return false;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? DEFAULT_TIMEOUT_MS);

  try {
    const payload = JSON.stringify(body);
    const signatureHex = await signSettlementPayload(payload, opts.privateKeyHex);

    await fetchWithRetry(
      url,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Signature': signatureHex,
          ...(opts.keyId ? { 'X-Key-Id': opts.keyId } : {}),
        },
        body: payload,
        signal: controller.signal,
      },
      { fetchImpl: doFetch, ...opts.retry },
    );
    return true;
  } catch (error) {
    report(toSettleReportError(error, settlement.txHash, url), body);
    return false;
  } finally {
    clearTimeout(timer);
  }
}

function reportToConsole(error: unknown, payload?: SettleHookPayload): void {
  console.error('[accensa] could not report settlement', payload?.tx_hash ?? '', error);
}

export interface SettleHookOptions extends AccensaHookOptions {
  /**
   * HTTP method to attribute. The x402 payment payload identifies the resource
   * by URL and carries no method, so a server that paywalls more than one verb
   * on the same path must supply this itself. Defaults to GET.
   */
  method?: string;
}

export function createSettleHook(opts: SettleHookOptions) {
  let report = reportToConsole;
  if (opts && typeof opts === 'object' && typeof opts.onError === 'function') {
    report = opts.onError;
  }

  return async function onAfterSettle(ctx: {
    result: X402SettleResult;
    paymentPayload?: { resource?: { url?: string } };
  }): Promise<void> {
    try {
      if (!ctx || !ctx.result) return;
      const settlement = settlementFromResult(ctx.result, {
        route: routeFromResourceUrl(ctx.paymentPayload?.resource?.url),
        method: opts?.method ?? 'GET',
      });
      if (settlement) await reportSettlement(settlement, opts);
    } catch (error) {
      report(error);
    }
  };
}
