import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { createNodeSqliteDatabase } from '../../../tests/helpers/createNodeSqliteDatabase';
import { MobileRuntimeErrorRepository } from '../../data/local/repositories/mobileRuntimeErrorRepository';
import { runMigrations } from '../../data/local/sqlite/migrations';
import type { ActiveUserSession } from '../auth/model';
import { createInMemorySecureStorageBoundary, secureStorageKeys } from '../../platform/secure-storage/secureStorageBoundary';
import type { MobileRuntimeErrorEvent } from './model';
import {
  createFetchMobileDiagnosticsApiClient,
  MOBILE_DIAGNOSTICS_API_CONTRACT_VERSION,
} from './mobileDiagnosticsApiClient';
import { MobileDiagnosticsReporter } from './mobileDiagnosticsReporter';

const createdDirectories: string[] = [];

afterEach(() => {
  while (createdDirectories.length > 0) {
    const directory = createdDirectories.pop();
    if (directory) {
      rmSync(directory, { force: true, recursive: true });
    }
  }
});

describe('MobileDiagnosticsReporter', () => {
  it('reports locally captured errors once a connected session is available', async () => {
    const { repository, close } = await createRepository();
    await repository.saveError(buildRuntimeError('mobile-error-queued-001'));
    const apiClient = {
      reportRuntimeError: vi.fn(async (event: MobileRuntimeErrorEvent) => ({
        contractVersion: MOBILE_DIAGNOSTICS_API_CONTRACT_VERSION,
        ...event,
        reportedAt: '2026-04-24T14:01:00.000Z',
        reportingUserId: 'user-tech',
      })),
    };
    const reporter = new MobileDiagnosticsReporter(repository, apiClient);

    const summary = await reporter.flushUnreportedErrors(buildSession('connected'));

    expect(summary).toEqual({ attempted: 1, succeeded: 1, failed: 0 });
    expect(apiClient.reportRuntimeError).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'mobile-error-queued-001' }),
    );
    expect(await repository.listUnreportedErrors()).toEqual([]);
    expect((await repository.getLatestError())?.reportedAt).toBe('2026-04-24T14:01:00.000Z');

    await close();
  });

  it('keeps captured errors local while the session is offline', async () => {
    const { repository, close } = await createRepository();
    await repository.saveError(buildRuntimeError('mobile-error-offline-001'));
    const apiClient = {
      reportRuntimeError: vi.fn(),
    };
    const reporter = new MobileDiagnosticsReporter(repository, apiClient);

    const summary = await reporter.flushUnreportedErrors(buildSession('offline'));

    expect(summary).toEqual({ attempted: 0, succeeded: 0, failed: 0 });
    expect(apiClient.reportRuntimeError).not.toHaveBeenCalled();
    expect(await repository.listUnreportedErrors()).toHaveLength(1);

    await close();
  });
});

describe('createFetchMobileDiagnosticsApiClient', () => {
  it('posts authenticated mobile runtime error telemetry to the backend diagnostics endpoint', async () => {
    const secureStorage = createInMemorySecureStorageBoundary({
      [secureStorageKeys.sessionAccessToken]: 'access-token-123',
    });
    const fetchImplementation = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) => ({
      ok: true,
      status: 200,
      async text() {
        return JSON.stringify({
          contractVersion: MOBILE_DIAGNOSTICS_API_CONTRACT_VERSION,
          ...buildRuntimeError('mobile-error-api-001'),
          reportedAt: '2026-04-24T14:02:00.000Z',
          reportingUserId: 'user-tech',
        });
      },
    }));
    const client = createFetchMobileDiagnosticsApiClient({
      baseUrl: 'https://api.tagwise.example',
      secureStorage,
      fetchImplementation: fetchImplementation as unknown as typeof fetch,
    });

    const response = await client.reportRuntimeError(buildRuntimeError('mobile-error-api-001'));

    expect(response).toMatchObject({
      id: 'mobile-error-api-001',
      reportingUserId: 'user-tech',
    });
    expect(fetchImplementation).toHaveBeenCalledWith(
      'https://api.tagwise.example/diagnostics/mobile-errors',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          authorization: 'Bearer access-token-123',
          'content-type': 'application/json',
        }),
      }),
    );
    const payload = JSON.parse(
      String((fetchImplementation.mock.calls[0]?.[1] as RequestInit).body),
    ) as { contractVersion: string; id: string };
    expect(payload).toMatchObject({
      contractVersion: MOBILE_DIAGNOSTICS_API_CONTRACT_VERSION,
      id: 'mobile-error-api-001',
    });
  });
});

async function createRepository() {
  const tempDirectory = mkdtempSync(join(tmpdir(), 'tagwise-mobile-diagnostics-'));
  createdDirectories.push(tempDirectory);
  const database = createNodeSqliteDatabase(join(tempDirectory, 'tagwise.db'));
  await runMigrations(database);

  return {
    repository: new MobileRuntimeErrorRepository(database),
    close: () => database.closeAsync?.(),
  };
}

function buildRuntimeError(id: string) {
  return {
    id,
    severity: 'error',
    errorName: 'Error',
    message: 'Forced mobile diagnostics capture',
    stack: 'Error: Forced mobile diagnostics capture',
    capturedAt: '2026-04-24T14:00:00.000Z',
    reportedAt: null,
    sessionUserId: 'user-tech',
    sessionRole: 'technician' as const,
    sessionConnectionMode: 'connected' as const,
    shellRoute: 'foundation' as const,
    devicePlatform: 'android',
    devicePlatformVersion: '34',
    appEnvironment: 'production',
    apiBaseUrl: 'https://api.tagwise.example',
    contextJson: '{}',
  };
}

function buildSession(connectionMode: ActiveUserSession['connectionMode']): ActiveUserSession {
  return {
    userId: 'user-tech',
    email: 'tech@tagwise.example',
    displayName: 'Tech',
    role: 'technician',
    connectionMode,
    reviewActionsAvailable: false,
    lastAuthenticatedAt: '2026-04-24T14:00:00.000Z',
    accessTokenExpiresAt: '2026-04-24T15:00:00.000Z',
    refreshTokenExpiresAt: '2026-05-24T14:00:00.000Z',
  };
}
