import { describe, expect, it, vi } from 'vitest';

import {
  createInMemorySecureStorageBoundary,
  secureStorageKeys,
} from '../../platform/secure-storage/secureStorageBoundary';
import {
  createFetchEvidenceUploadApiClient,
  DEFAULT_EVIDENCE_SYNC_TIMEOUT_MS,
} from './evidenceUploadApiClient';

describe('createFetchEvidenceUploadApiClient', () => {
  it('defaults the sync timeout to a LAN-hiccup-tolerant 15 seconds', () => {
    // A 5s default aborted slow-but-alive LAN calls mid-flight, leaving
    // POSTs the server still committed flagged as 'sync-issue'.
    expect(DEFAULT_EVIDENCE_SYNC_TIMEOUT_MS).toBe(15000);
  });

  it('aborts requests after the configured timeout and surfaces a network error', async () => {
    const fetchImplementation = vi.fn(
      (_url: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new Error('Request aborted.')));
        }),
    );
    const client = createFetchEvidenceUploadApiClient({
      baseUrl: 'http://192.168.0.10:4100',
      secureStorage: createInMemorySecureStorageBoundary({
        [secureStorageKeys.sessionAccessToken]: 'access-token',
      }),
      fetchImplementation: fetchImplementation as unknown as typeof fetch,
      timeoutMs: 20,
    });

    await expect(
      client.getReportSubmissionStatus('tag-report:wp-1:tag-1'),
    ).rejects.toMatchObject({
      name: 'EvidenceUploadApiError',
      kind: 'network',
    });
    expect(fetchImplementation).toHaveBeenCalledTimes(1);
  });

  it('attaches the stored bearer token to sync requests', async () => {
    const fetchImplementation = vi.fn(async () =>
      new Response(JSON.stringify({ reportState: 'submitted-pending-review' }), { status: 200 }),
    );
    const client = createFetchEvidenceUploadApiClient({
      baseUrl: 'http://192.168.0.10:4100/',
      secureStorage: createInMemorySecureStorageBoundary({
        [secureStorageKeys.sessionAccessToken]: 'access-token',
      }),
      fetchImplementation: fetchImplementation as unknown as typeof fetch,
    });

    await client.getReportSubmissionStatus('tag-report:wp-1:tag-1');

    const [url, init] = fetchImplementation.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(
      'http://192.168.0.10:4100/sync/report-submissions/tag-report%3Awp-1%3Atag-1/status',
    );
    expect(new Headers(init.headers).get('authorization')).toBe('Bearer access-token');
  });
});
