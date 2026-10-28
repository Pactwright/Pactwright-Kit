import { HttpError } from './retry.js';
import {
  AccensaAuthError,
  AccensaContractError,
  AccensaError,
  AccensaNetworkError,
} from './errors.js';
import type { Settlement } from './settlement.js';

export type SettlementMethod =
  | 'GET'
  | 'POST'
  | 'PUT'
  | 'PATCH'
  | 'DELETE'
  | 'HEAD'
  | 'OPTIONS';

export interface SettlementReportBody {
  tx_hash: string;
  route: string;
  method: SettlementMethod;
  request_id?: string | null;
  payer?: string | null;
  amount?: string | null;
  network?: string | null;
  reported_at?: string;
}

export interface SettlementReportResultBody {
  recorded: boolean;
  txHash: string;
  matchedExistingPayment: boolean;
}

/** Path the Accensa app exposes for merchant-reported route attribution. */
export const SETTLE_ENDPOINT = '/api/hook/settle';

/** The full settle URL for an indexer base URL, tolerating a trailing slash. */
export function settleEndpointUrl(indexerUrl: string): string {
  return `${indexerUrl.replace(/\/$/, '')}${SETTLE_ENDPOINT}`;
}

/**
 * The body POSTed to `/api/hook/settle`, and the exact bytes that get signed.
 */
export type SettleHookPayload = SettlementReportBody;

/** What the indexer answers after a report is recorded or staged. */
export type SettleHookResult = SettlementReportResultBody;

/**
 * The HTTP methods `/api/hook/settle` can attribute a payment to.
 */
export const SETTLE_METHODS = [
  'GET',
  'POST',
  'PUT',
  'PATCH',
  'DELETE',
  'HEAD',
  'OPTIONS',
] as const satisfies readonly SettlementMethod[];

/** Narrows an arbitrary string to a method the settle endpoint accepts. */
export function isSettleMethod(method: string): method is SettlementMethod {
  return (SETTLE_METHODS as readonly string[]).includes(method);
}

/**
 * Normalizes a request's method into one the settle endpoint accepts.
 */
export function toSettleMethod(method: string): SettlementMethod {
  const normalized = method.trim().toUpperCase();
  if (!isSettleMethod(normalized)) {
    throw new AccensaContractError(
      `Cannot report a settlement for ${JSON.stringify(method)}: ${SETTLE_ENDPOINT} accepts only ` +
        `${SETTLE_METHODS.join(', ')}.`,
    );
  }
  return normalized;
}

/** Builds the wire body for one settlement. */
export function toSettleHookPayload(settlement: Settlement): SettleHookPayload {
  return {
    tx_hash: settlement.txHash,
    route: settlement.route,
    method: toSettleMethod(settlement.method),
    request_id: settlement.requestId,
    payer: settlement.payer,
    amount: settlement.amount,
    network: settlement.network,
    reported_at: new Date().toISOString(),
  };
}

/**
 * Classifies a failed settlement report into the SDK error a caller branches on.
 */
export function toSettleReportError(error: unknown, txHash: string, url: string): AccensaError {
  if (error instanceof AccensaError) return error;

  if (error instanceof HttpError) {
    const status = error.status;
    const message = `Accensa returned ${status} for ${txHash}`;
    return status === 401 || status === 403
      ? new AccensaAuthError(message, { status, path: SETTLE_ENDPOINT })
      : new AccensaError(message, { status });
  }

  const causeText = error instanceof Error ? error.message : String(error);
  return new AccensaNetworkError(
    `Failed to reach the Accensa indexer at ${SETTLE_ENDPOINT}: ${causeText}`,
    { url, cause: error },
  );
}
