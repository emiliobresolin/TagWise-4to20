import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { afterEach, describe, expect, it } from 'vitest';

import { createNodeSqliteDatabase } from '../../../tests/helpers/createNodeSqliteDatabase';
import { AuthSessionCacheRepository } from '../../data/local/repositories/authSessionCacheRepository';
import { LocalWorkStateRepository } from '../../data/local/repositories/localWorkStateRepository';
import { runMigrations } from '../../data/local/sqlite/migrations';
import { createInMemorySecureStorageBoundary, secureStorageKeys } from '../../platform/secure-storage/secureStorageBoundary';
import { SessionController } from './sessionController';
import type { AuthApiClient } from './authApiClient';

const createdDirectories: string[] = [];

afterEach(() => {
  while (createdDirectories.length > 0) {
    const directory = createdDirectories.pop();
    if (directory) {
      rmSync(directory, { force: true, recursive: true });
    }
  }
});

describe('SessionController', () => {
  it('stores tokens and role cache after connected login', async () => {
    const dependencies = await createTestDependencies({
      login: async () => createSessionPayload('technician'),
      refresh: async () => {
        throw new Error('not used');
      },
    });

    const session = await dependencies.controller.signInConnected({
      email: 'tech@tagwise.local',
      password: 'TagWise123!',
    });

    expect(session.role).toBe('technician');
    expect(session.connectionMode).toBe('connected');
    expect(await dependencies.secureStorage.getItem(secureStorageKeys.sessionRefreshToken)).toBe(
      'refresh-token',
    );
    expect(await dependencies.authSessionCache.getActiveSession()).not.toBeNull();

    await dependencies.database.closeAsync?.();
  });

  it('restores a cached offline session when refresh cannot reach the backend', async () => {
    const dependencies = await createTestDependencies({
      login: async () => createSessionPayload('technician'),
      refresh: async () => {
        throw new Error('network unavailable');
      },
    });

    await dependencies.authSessionCache.saveActiveSession({
      userId: 'user-tech',
      email: 'tech@tagwise.local',
      displayName: 'Field Technician',
      role: 'technician',
      lastAuthenticatedAt: '2026-04-19T12:00:00.000Z',
      accessTokenExpiresAt: '2026-04-19T12:15:00.000Z',
      refreshTokenExpiresAt: '2026-04-20T12:00:00.000Z',
    });
    await dependencies.secureStorage.setItem(secureStorageKeys.sessionRefreshToken, 'refresh-token');

    const restored = await dependencies.controller.restoreSession();

    expect(restored.state).toBe('signed_in');
    expect(restored.session?.connectionMode).toBe('offline');
    expect(restored.session?.reviewActionsAvailable).toBe(false);

    await dependencies.database.closeAsync?.();
  });

  it('blocks offline user switching when unsynced local work exists', async () => {
    const dependencies = await createTestDependencies({
      login: async () => createSessionPayload('supervisor'),
      refresh: async () => {
        throw new Error('network unavailable');
      },
    });

    await dependencies.authSessionCache.saveActiveSession({
      userId: 'user-supervisor',
      email: 'supervisor@tagwise.local',
      displayName: 'Field Supervisor',
      role: 'supervisor',
      lastAuthenticatedAt: '2026-04-19T12:00:00.000Z',
      accessTokenExpiresAt: '2026-04-19T12:15:00.000Z',
      refreshTokenExpiresAt: '2026-04-20T12:00:00.000Z',
    });
    await dependencies.secureStorage.setItem(secureStorageKeys.sessionRefreshToken, 'refresh-token');
    await dependencies.localWorkState.setUnsyncedWorkCount(2);

    const result = await dependencies.controller.clearForUserSwitch('offline');

    expect(result.state).toBe('blocked');
    expect(result.message).toContain('unsynced local work');
    expect(await dependencies.authSessionCache.getActiveSession()).not.toBeNull();

    await dependencies.database.closeAsync?.();
  });
});

async function createTestDependencies(apiClient: AuthApiClient) {
  const tempDirectory = mkdtempSync(join(tmpdir(), 'tagwise-session-'));
  createdDirectories.push(tempDirectory);

  const database = createNodeSqliteDatabase(join(tempDirectory, 'tagwise.db'));
  await runMigrations(database);

  const authSessionCache = new AuthSessionCacheRepository(database);
  const localWorkState = new LocalWorkStateRepository(database);
  const secureStorage = createInMemorySecureStorageBoundary();

  return {
    database,
    authSessionCache,
    localWorkState,
    secureStorage,
    controller: new SessionController({
      apiClient,
      secureStorage,
      authSessionCache,
      localWorkState,
      now: () => new Date('2026-04-19T12:00:00.000Z'),
    }),
  };
}

function createSessionPayload(role: 'technician' | 'supervisor' | 'manager') {
  return {
    user: {
      id: `user-${role}`,
      email: `${role}@tagwise.local`,
      displayName:
        role === 'technician'
          ? 'Field Technician'
          : role === 'supervisor'
            ? 'Field Supervisor'
            : 'Operations Manager',
      role,
    },
    tokens: {
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      accessTokenExpiresAt: '2026-04-19T12:15:00.000Z',
      refreshTokenExpiresAt: '2026-04-20T12:00:00.000Z',
    },
  };
}
