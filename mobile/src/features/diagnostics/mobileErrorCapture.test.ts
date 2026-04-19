import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { afterEach, describe, expect, it } from 'vitest';

import { createNodeSqliteDatabase } from '../../../tests/helpers/createNodeSqliteDatabase';
import { MobileRuntimeErrorRepository } from '../../data/local/repositories/mobileRuntimeErrorRepository';
import { runMigrations } from '../../data/local/sqlite/migrations';
import { MobileErrorCaptureService } from './mobileErrorCapture';

const createdDirectories: string[] = [];

afterEach(() => {
  while (createdDirectories.length > 0) {
    const directory = createdDirectories.pop();
    if (directory) {
      rmSync(directory, { force: true, recursive: true });
    }
  }
});

describe('MobileErrorCaptureService', () => {
  it('captures mobile runtime errors with device and session context', async () => {
    const tempDirectory = mkdtempSync(join(tmpdir(), 'tagwise-mobile-error-'));
    createdDirectories.push(tempDirectory);

    const database = createNodeSqliteDatabase(join(tempDirectory, 'tagwise.db'));
    await runMigrations(database);

    const repository = new MobileRuntimeErrorRepository(database);
    const service = new MobileErrorCaptureService(repository, () => ({
      platform: 'android',
      platformVersion: '34',
      appEnvironment: 'test',
    }));

    const event = await service.captureError(new Error('forced mobile diagnostics capture'), {
      session: {
        userId: 'user-tech',
        role: 'technician',
        connectionMode: 'offline',
      },
      shellRoute: 'foundation',
      apiBaseUrl: 'http://127.0.0.1:4100',
      context: {
        source: 'story-1.5-test',
      },
    });

    expect(event.sessionUserId).toBe('user-tech');
    expect(event.sessionRole).toBe('technician');
    expect(event.sessionConnectionMode).toBe('offline');
    expect(event.shellRoute).toBe('foundation');
    expect(event.devicePlatform).toBe('android');

    const snapshot = await service.getSnapshot();
    expect(snapshot).toMatchObject({
      capturedErrorCount: 1,
      latestErrorMessage: 'forced mobile diagnostics capture',
      latestErrorShellRoute: 'foundation',
    });

    await database.closeAsync?.();
  });
});
