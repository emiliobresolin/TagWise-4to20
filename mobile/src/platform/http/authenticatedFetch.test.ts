import { describe, it, expect, vi } from 'vitest';

import type { SessionRestoreResult } from '../../features/auth/model';
import {
  createInMemorySecureStorageBoundary,
  secureStorageKeys,
} from '../secure-storage/secureStorageBoundary';
import { createAuthenticatedFetch } from './authenticatedFetch';

const connectedRestoreResult: SessionRestoreResult = {
  state: 'signed_in',
  session: {
    userId: 'user-technician',
    email: 'tech@tagwise.local',
    displayName: 'Field Technician',
    role: 'technician',
    lastAuthenticatedAt: '2026-04-24T10:00:00.000Z',
    accessTokenExpiresAt: '2026-04-24T11:00:00.000Z',
    refreshTokenExpiresAt: '2026-05-24T10:00:00.000Z',
    connectionMode: 'connected',
    reviewActionsAvailable: false,
  },
};

const offlineRestoreResult: SessionRestoreResult = {
  state: 'signed_in',
  session: {
    ...connectedRestoreResult.session!,
    connectionMode: 'offline',
  },
};

describe('createAuthenticatedFetch', () => {
  it('passes non-401 responses through without refreshing the session', async () => {
    const baseFetch = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
    const restoreSession = vi.fn();
    const onSessionInvalidated = vi.fn();

    const authedFetch = createAuthenticatedFetch({
      secureStorage: createInMemorySecureStorageBoundary(),
      restoreSession,
      onSessionInvalidated,
      fetchImplementation: baseFetch,
    });

    const response = await authedFetch('https://api.tagwise.test/work-packages');

    expect(response.status).toBe(200);
    expect(baseFetch).toHaveBeenCalledTimes(1);
    expect(restoreSession).not.toHaveBeenCalled();
    expect(onSessionInvalidated).not.toHaveBeenCalled();
  });

  it('retries once with the token written by restoreSession on 401', async () => {
    const secureStorage = createInMemorySecureStorageBoundary({
      [secureStorageKeys.sessionAccessToken]: 'expired-token',
    });
    const baseFetch = vi
      .fn()
      .mockResolvedValueOnce(new Response('{"message":"Access token expired."}', { status: 401 }))
      .mockResolvedValueOnce(new Response('{"data":true}', { status: 200 }));
    // Mirror SessionController.restoreSession: the renewed access token is
    // persisted into secure storage before the result resolves.
    const restoreSession = vi.fn(async () => {
      await secureStorage.setItem(secureStorageKeys.sessionAccessToken, 'renewed-token');
      return connectedRestoreResult;
    });
    const onSessionInvalidated = vi.fn();

    const authedFetch = createAuthenticatedFetch({
      secureStorage,
      restoreSession,
      onSessionInvalidated,
      fetchImplementation: baseFetch,
    });

    const response = await authedFetch('https://api.tagwise.test/sync/report-submissions', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: 'Bearer expired-token',
      },
      body: '{"reportId":"tag-report:wp-1:tag-1"}',
    });

    expect(response.status).toBe(200);
    expect(restoreSession).toHaveBeenCalledTimes(1);
    expect(baseFetch).toHaveBeenCalledTimes(2);
    const [, retryInit] = baseFetch.mock.calls[1] as [unknown, RequestInit];
    const retryHeaders = new Headers(retryInit.headers);
    expect(retryHeaders.get('authorization')).toBe('Bearer renewed-token');
    expect(retryHeaders.get('content-type')).toBe('application/json');
    expect(retryInit.body).toBe('{"reportId":"tag-report:wp-1:tag-1"}');
    expect(onSessionInvalidated).not.toHaveBeenCalled();
  });

  it('returns the original 401 and invalidates the session when the refresh signs the user out', async () => {
    const baseFetch = vi.fn().mockResolvedValue(new Response('{}', { status: 401 }));
    const restoreSession = vi.fn(async (): Promise<SessionRestoreResult> => ({ state: 'signed_out' }));
    const onSessionInvalidated = vi.fn();

    const authedFetch = createAuthenticatedFetch({
      secureStorage: createInMemorySecureStorageBoundary(),
      restoreSession,
      onSessionInvalidated,
      fetchImplementation: baseFetch,
    });

    const response = await authedFetch('https://api.tagwise.test/work-packages');

    expect(response.status).toBe(401);
    expect(baseFetch).toHaveBeenCalledTimes(1);
    expect(onSessionInvalidated).toHaveBeenCalledOnce();
  });

  it('returns the original 401 without invalidating on the cached-offline refresh fallback', async () => {
    const baseFetch = vi.fn().mockResolvedValue(new Response('{}', { status: 401 }));
    const restoreSession = vi.fn(async () => offlineRestoreResult);
    const onSessionInvalidated = vi.fn();

    const authedFetch = createAuthenticatedFetch({
      secureStorage: createInMemorySecureStorageBoundary({
        [secureStorageKeys.sessionAccessToken]: 'stale-token',
      }),
      restoreSession,
      onSessionInvalidated,
      fetchImplementation: baseFetch,
    });

    const response = await authedFetch('https://api.tagwise.test/work-packages');

    expect(response.status).toBe(401);
    expect(baseFetch).toHaveBeenCalledTimes(1);
    // The refresh endpoint was unreachable, not rejected: the session may
    // still be valid, so no reauth prompt fires.
    expect(onSessionInvalidated).not.toHaveBeenCalled();
  });

  it('shares a single restoreSession call across concurrent 401 responses', async () => {
    const secureStorage = createInMemorySecureStorageBoundary({
      [secureStorageKeys.sessionAccessToken]: 'expired-token',
    });
    const baseFetch = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      return headers.get('authorization') === 'Bearer renewed-token'
        ? new Response('{}', { status: 200 })
        : new Response('{}', { status: 401 });
    });
    let resolveRefresh: (() => void) | undefined;
    const refreshGate = new Promise<void>((resolve) => {
      resolveRefresh = resolve;
    });
    const restoreSession = vi.fn(async () => {
      await refreshGate;
      await secureStorage.setItem(secureStorageKeys.sessionAccessToken, 'renewed-token');
      return connectedRestoreResult;
    });

    const authedFetch = createAuthenticatedFetch({
      secureStorage,
      restoreSession,
      onSessionInvalidated: vi.fn(),
      fetchImplementation: baseFetch as unknown as typeof fetch,
    });

    const firstRequest = authedFetch('https://api.tagwise.test/a', {
      headers: { authorization: 'Bearer expired-token' },
    });
    const secondRequest = authedFetch('https://api.tagwise.test/b', {
      headers: { authorization: 'Bearer expired-token' },
    });
    // Let both initial 401s land before the refresh resolves.
    await new Promise((resolve) => setTimeout(resolve, 0));
    resolveRefresh!();

    const [firstResponse, secondResponse] = await Promise.all([firstRequest, secondRequest]);

    expect(firstResponse.status).toBe(200);
    expect(secondResponse.status).toBe(200);
    expect(restoreSession).toHaveBeenCalledTimes(1);
  });
});
