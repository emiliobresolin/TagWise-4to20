import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { afterEach, describe, expect, it } from 'vitest';

import { createNodeAppSandboxBoundary } from '../../../tests/helpers/createNodeAppSandboxBoundary';
import { createNodeSqliteDatabase } from '../../../tests/helpers/createNodeSqliteDatabase';
import { bootstrapLocalDatabase } from '../../data/local/bootstrapLocalDatabase';
import type { ActiveUserSession } from '../auth/model';
import type { AssignedWorkPackageSnapshot } from './model';
import { LocalTagEntryService } from './localTagEntryService';

const createdDirectories: string[] = [];

afterEach(() => {
  while (createdDirectories.length > 0) {
    const directory = createdDirectories.pop();
    if (directory) {
      rmSync(directory, { force: true, recursive: true });
    }
  }
});

const session: ActiveUserSession = {
  userId: 'user-technician',
  email: 'tech@tagwise.local',
  displayName: 'Field Technician',
  role: 'technician',
  lastAuthenticatedAt: '2026-04-19T09:00:00.000Z',
  accessTokenExpiresAt: '2026-04-19T10:00:00.000Z',
  refreshTokenExpiresAt: '2026-04-20T10:00:00.000Z',
  connectionMode: 'offline',
  reviewActionsAvailable: false,
};

const packageOneSnapshot: AssignedWorkPackageSnapshot = {
  contractVersion: '2026-04-v1',
  generatedAt: '2026-04-19T10:00:00.000Z',
  summary: {
    id: 'wp-local-001',
    sourceReference: 'seed-cmms-001',
    title: 'Assigned package one',
    assignedTeam: 'Instrumentation Alpha',
    priority: 'high',
    status: 'assigned',
    packageVersion: 1,
    snapshotContractVersion: '2026-04-v1',
    tagCount: 2,
    dueWindow: {
      startsAt: '2026-04-20T08:00:00.000Z',
      endsAt: '2026-04-20T17:00:00.000Z',
    },
    updatedAt: '2026-04-19T10:00:00.000Z',
  },
  tags: [
    {
      id: 'tag-001',
      tagCode: 'PT-101',
      shortDescription: 'North pressure transmitter',
      area: 'North Unit',
      parentAssetReference: 'asset-001',
      instrumentFamily: 'pressure transmitter',
      instrumentSubtype: 'smart transmitter',
      measuredVariable: 'pressure',
      signalType: '4-20mA',
      range: { min: 0, max: 10, unit: 'bar' },
      tolerance: '±0.25% span',
      criticality: 'high',
      templateIds: ['tpl-pressure'],
      guidanceReferenceIds: ['guide-pressure'],
      historySummaryId: 'history-001',
    },
    {
      id: 'tag-002',
      tagCode: 'LT-202',
      shortDescription: 'Level transmitter south tank',
      area: 'South Unit',
      parentAssetReference: 'asset-002',
      instrumentFamily: 'level transmitter',
      instrumentSubtype: 'guided wave radar',
      measuredVariable: 'level',
      signalType: '4-20mA',
      range: { min: 0, max: 100, unit: '%' },
      tolerance: '±0.5% span',
      criticality: 'medium',
      templateIds: ['tpl-level'],
      guidanceReferenceIds: ['guide-level'],
      historySummaryId: 'history-002',
    },
  ],
  templates: [],
  guidance: [],
  historySummaries: [],
};

const packageTwoSnapshot: AssignedWorkPackageSnapshot = {
  ...packageOneSnapshot,
  summary: {
    ...packageOneSnapshot.summary,
    id: 'wp-local-002',
    title: 'Assigned package two',
    tagCount: 1,
  },
  tags: [
    {
      ...packageOneSnapshot.tags[0]!,
      id: 'tag-003',
      tagCode: 'TT-303',
      shortDescription: 'Temperature transmitter reactor',
      area: 'Reactor Area',
      parentAssetReference: 'asset-003',
      instrumentFamily: 'temperature transmitter',
      instrumentSubtype: 'RTD head-mount',
      measuredVariable: 'temperature',
      historySummaryId: 'history-003',
    },
  ],
};

describe('LocalTagEntryService', () => {
  it('lists tags from a downloaded package and searches by identifier or short description', async () => {
    const tempDirectory = mkdtempSync(join(tmpdir(), 'tagwise-tag-entry-'));
    createdDirectories.push(tempDirectory);

    const runtime = await bootstrapLocalDatabase(
      () => Promise.resolve(createNodeSqliteDatabase(join(tempDirectory, 'tagwise.db'))),
      () => Promise.resolve(createNodeAppSandboxBoundary(join(tempDirectory, 'sandbox'))),
    );
    const workPackages = runtime.repositories.userPartitions.forUser(session.userId).workPackages;
    await workPackages.saveDownloadedSnapshot(packageOneSnapshot, '2026-04-19T10:15:00.000Z');

    const service = new LocalTagEntryService({
      userPartitions: runtime.repositories.userPartitions,
    });

    expect(await service.listPackageTags(session, packageOneSnapshot.summary.id)).toHaveLength(2);
    expect(await service.searchPackageTags(session, packageOneSnapshot.summary.id, 'pt-101')).toMatchObject([
      {
        tagId: 'tag-001',
        tagCode: 'PT-101',
      },
    ]);
    expect(await service.searchPackageTags(session, packageOneSnapshot.summary.id, 'south tank')).toMatchObject([
      {
        tagId: 'tag-002',
        tagCode: 'LT-202',
      },
    ]);

    await runtime.database.closeAsync?.();
  });

  it('never returns tags outside the selected downloaded package scope', async () => {
    const tempDirectory = mkdtempSync(join(tmpdir(), 'tagwise-tag-scope-'));
    createdDirectories.push(tempDirectory);

    const runtime = await bootstrapLocalDatabase(
      () => Promise.resolve(createNodeSqliteDatabase(join(tempDirectory, 'tagwise.db'))),
      () => Promise.resolve(createNodeAppSandboxBoundary(join(tempDirectory, 'sandbox'))),
    );
    const workPackages = runtime.repositories.userPartitions.forUser(session.userId).workPackages;
    await workPackages.saveDownloadedSnapshot(packageOneSnapshot, '2026-04-19T10:15:00.000Z');
    await workPackages.saveDownloadedSnapshot(packageTwoSnapshot, '2026-04-19T10:20:00.000Z');

    const service = new LocalTagEntryService({
      userPartitions: runtime.repositories.userPartitions,
    });

    expect(await service.searchPackageTags(session, packageOneSnapshot.summary.id, 'TT-303')).toEqual([]);
    expect(await service.listPackageTags(session, 'missing-package')).toEqual([]);

    await runtime.database.closeAsync?.();
  });

  it('selects a tag identity from local storage after reopen-like offline access', async () => {
    const tempDirectory = mkdtempSync(join(tmpdir(), 'tagwise-tag-open-'));
    createdDirectories.push(tempDirectory);

    const databasePath = join(tempDirectory, 'tagwise.db');
    const sandboxPath = join(tempDirectory, 'sandbox');

    const firstRuntime = await bootstrapLocalDatabase(
      () => Promise.resolve(createNodeSqliteDatabase(databasePath)),
      () => Promise.resolve(createNodeAppSandboxBoundary(sandboxPath)),
    );
    await firstRuntime.repositories.userPartitions
      .forUser(session.userId)
      .workPackages.saveDownloadedSnapshot(packageOneSnapshot, '2026-04-19T10:15:00.000Z');
    await firstRuntime.database.closeAsync?.();

    const secondRuntime = await bootstrapLocalDatabase(
      () => Promise.resolve(createNodeSqliteDatabase(databasePath)),
      () => Promise.resolve(createNodeAppSandboxBoundary(sandboxPath)),
    );
    const service = new LocalTagEntryService({
      userPartitions: secondRuntime.repositories.userPartitions,
    });

    expect(
      await service.selectPackageTag(session, packageOneSnapshot.summary.id, 'tag-001'),
    ).toMatchObject({
      workPackageId: packageOneSnapshot.summary.id,
      tagId: 'tag-001',
      tagCode: 'PT-101',
      shortDescription: 'North pressure transmitter',
      area: 'North Unit',
    });

    await secondRuntime.database.closeAsync?.();
  });
});
