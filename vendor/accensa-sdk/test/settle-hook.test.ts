import { describe, it, expect, vi } from 'vitest';
import { generateKeyPairSync } from 'node:crypto';
import {
  createSettleHook,
  reportSettlement,
  verifyReceipt,
  buildBatch,
  receiptLeaf,
  AccensaNetworkError,
  type Settlement,
} from '../src/index.js';

const { privateKey: SIGNING_KEY } = generateKeyPairSync('ed25519');
const der = SIGNING_KEY.export({ format: 'der', type: 'pkcs8' }) as Buffer;
const PRIVATE_KEY_HEX = der.subarray(16).toString('hex');

const settlement: Settlement = Object.freeze({
  txHash: 'a'.repeat(64),
  route: '/api/hello',
  method: 'GET',
  requestId: 'req-1',
  payer: 'G' + 'A'.repeat(55),
  amount: '1000',
  network: 'stellar:testnet',
});

const okFetch = () =>
  vi.fn<typeof fetch>(async () => new Response(null, { status: 200 }));

const opts = (over: Partial<Parameters<typeof reportSettlement>[1]> = {}) => ({
  indexerUrl: 'https://accensa.test',
  privateKeyHex: PRIVATE_KEY_HEX,
  onError: vi.fn(),
  ...over,
});

describe('createSettleHook', () => {
  const result = {
    success: true,
    transaction: settlement.txHash,
    network: 'stellar:testnet',
    payer: settlement.payer,
    amount: '1000',
  };
  const resource = (url?: string) => ({ resource: { url } });

  it('reports the settle result attributed to the resource path', async () => {
    const fetchImpl = okFetch();
    await createSettleHook(opts({ fetchImpl }))({
      result,
      paymentPayload: resource('https://merchant.test/api/quote?x=1'),
    });

    expect(fetchImpl).toHaveBeenCalledOnce();
    const bodyStr = fetchImpl.mock.calls[0][1]?.body as string;
    const body = JSON.parse(bodyStr);
    expect(body).toMatchObject({
      tx_hash: settlement.txHash,
      route: '/api/quote',
      method: 'GET',
      payer: settlement.payer,
      amount: '1000',
      network: 'stellar:testnet',
    });
  });

  it('attributes to the configured method, normalised to upper case', async () => {
    const fetchImpl = okFetch();
    await createSettleHook({ ...opts({ fetchImpl }), method: 'post' })({
      result,
      paymentPayload: resource('/api/quote'),
    });
    expect(fetchImpl).toHaveBeenCalledOnce();
    const bodyStr = fetchImpl.mock.calls[0][1]?.body as string;
    const body = JSON.parse(bodyStr);
    expect(body.method).toBe('POST');
  });

  it('does not report a failed settlement', async () => {
    const fetchImpl = okFetch();
    await createSettleHook(opts({ fetchImpl }))({
      result: { ...result, success: false },
      paymentPayload: resource('/api/quote'),
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('resolves rather than rejecting when reporting fails', async () => {
    const onError = vi.fn();
    const failingFetch = vi.fn<typeof fetch>(async () => {
      throw new Error('ECONNREFUSED');
    });

    await expect(
      createSettleHook(
        opts({ fetchImpl: failingFetch, onError, retry: { maxRetries: 0 } }),
      )({ result, paymentPayload: resource('/api/quote') }),
    ).resolves.toBeUndefined();
    expect(onError.mock.calls[0][0]).toBeInstanceOf(AccensaNetworkError);
  });
});

describe('Merkle verification', () => {
  it('builds a batch and verifies receipts', () => {
    const leaves = [
      receiptLeaf('1'.repeat(64)),
      receiptLeaf('2'.repeat(64)),
      receiptLeaf('3'.repeat(64)),
    ];
    const batch = buildBatch(leaves);
    expect(batch.root).toBeDefined();
    for (const leaf of leaves) {
      expect(verifyReceipt(leaf, batch.proofs[leaf], batch.root)).toBe(true);
    }
  });
});
