import { describe, expect, it } from 'vitest';

import {
  buildReleaseSmokeTargets,
  runReleaseSmoke,
  type ReleaseSmokeFetch,
} from './releaseSmoke';

describe('runReleaseSmoke', () => {
  it('checks liveness, readiness, and metrics for API and worker targets', async () => {
    const requestedUrls: string[] = [];
    const fetcher: ReleaseSmokeFetch = async (url) => {
      requestedUrls.push(url);
      return {
        ok: true,
        status: 200,
        text: async () => '{}',
      };
    };

    const checks = await runReleaseSmoke(
      [
        { name: 'api', baseUrl: 'https://api.staging.example.com' },
        { name: 'worker', baseUrl: 'https://worker.staging.example.com/' },
      ],
      fetcher,
    );

    expect(checks).toHaveLength(6);
    expect(requestedUrls).toContain('https://api.staging.example.com/health/ready');
    expect(requestedUrls).toContain('https://worker.staging.example.com/metrics');
  });

  it('fails when any release smoke endpoint is not successful', async () => {
    const fetcher: ReleaseSmokeFetch = async (url) => ({
      ok: !url.endsWith('/health/ready'),
      status: url.endsWith('/health/ready') ? 503 : 200,
      text: async () => '{}',
    });

    await expect(
      runReleaseSmoke([{ name: 'api', baseUrl: 'https://api.staging.example.com' }], fetcher),
    ).rejects.toThrow('api/health/ready:503');
  });

  it('fails with an actionable timeout when a smoke endpoint hangs', async () => {
    const fetcher: ReleaseSmokeFetch = async (_url, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
      });

    await expect(
      runReleaseSmoke(
        [{ name: 'api', baseUrl: 'https://api.staging.example.com' }],
        fetcher,
        { timeoutMs: 1 },
      ),
    ).rejects.toThrow('timed out after 1ms');
  });
});

describe('buildReleaseSmokeTargets', () => {
  it('uses explicit deployed URLs when provided', () => {
    expect(
      buildReleaseSmokeTargets({
        TAGWISE_API_BASE_URL: 'https://api.example.com',
        TAGWISE_WORKER_BASE_URL: 'https://worker.example.com',
      }),
    ).toEqual([
      { name: 'api', baseUrl: 'https://api.example.com' },
      { name: 'worker', baseUrl: 'https://worker.example.com' },
    ]);
  });

  it('normalizes a bind-all host for local HTTP smoke checks', () => {
    expect(
      buildReleaseSmokeTargets({
        TAGWISE_HOST: '0.0.0.0',
        TAGWISE_API_PORT: '5000',
        TAGWISE_WORKER_PORT: '5001',
      }),
    ).toEqual([
      { name: 'api', baseUrl: 'http://127.0.0.1:5000' },
      { name: 'worker', baseUrl: 'http://127.0.0.1:5001' },
    ]);
  });
});
