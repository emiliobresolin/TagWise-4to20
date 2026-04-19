import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { afterEach, describe, expect, it } from 'vitest';

import { createNodeAppSandboxBoundary } from '../../../tests/helpers/createNodeAppSandboxBoundary';
import { createNodeSqliteDatabase } from '../../../tests/helpers/createNodeSqliteDatabase';
import { bootstrapLocalDatabase } from './bootstrapLocalDatabase';

const createdDirectories: string[] = [];

afterEach(() => {
  while (createdDirectories.length > 0) {
    const directory = createdDirectories.pop();

    if (directory) {
      rmSync(directory, { force: true, recursive: true });
    }
  }
});

describe('bootstrapLocalDatabase', () => {
  it('persists the shell route and seeded record across restart-like reopen cycles', async () => {
    const tempDirectory = mkdtempSync(join(tmpdir(), 'tagwise-runtime-'));
    createdDirectories.push(tempDirectory);

    const databasePath = join(tempDirectory, 'tagwise.db');
    const sandboxPath = join(tempDirectory, 'sandbox');

    const firstRuntime = await bootstrapLocalDatabase(() =>
      Promise.resolve(createNodeSqliteDatabase(databasePath)),
      () => Promise.resolve(createNodeAppSandboxBoundary(sandboxPath)),
    );

    expect(firstRuntime.snapshot.demoRecord.launchCount).toBe(1);
    expect(firstRuntime.snapshot.demoRecord.manualWriteCount).toBe(0);
    expect(firstRuntime.snapshot.shellRoute).toBe('foundation');

    await firstRuntime.repositories.appPreferences.setShellRoute('storage');
    const writtenRecord = await firstRuntime.repositories.bootstrapDemo.recordManualWrite();

    expect(writtenRecord.manualWriteCount).toBe(1);

    await firstRuntime.database.closeAsync?.();

    const secondRuntime = await bootstrapLocalDatabase(() =>
      Promise.resolve(createNodeSqliteDatabase(databasePath)),
      () => Promise.resolve(createNodeAppSandboxBoundary(sandboxPath)),
    );

    expect(secondRuntime.snapshot.demoRecord.launchCount).toBe(2);
    expect(secondRuntime.snapshot.demoRecord.manualWriteCount).toBe(1);
    expect(secondRuntime.snapshot.shellRoute).toBe('storage');

    await secondRuntime.database.closeAsync?.();
  });
});
