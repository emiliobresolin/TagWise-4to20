import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { afterEach, describe, expect, it } from 'vitest';

import { createNodeAppSandboxBoundary } from '../../../tests/helpers/createNodeAppSandboxBoundary';
import { createNodeSqliteDatabase } from '../../../tests/helpers/createNodeSqliteDatabase';
import { bootstrapLocalDatabase } from '../../data/local/bootstrapLocalDatabase';
import type { ActiveUserSession } from '../auth/model';
import { AssignedWorkPackageApiError } from './workPackageApiClient';
import { AssignedWorkPackageCatalogService } from './assignedWorkPackageCatalogService';
import type { AssignedWorkPackageSnapshot, AssignedWorkPackageSummary } from './model';

const createdDirectories: string[] = [];

afterEach(() => {
  while (createdDirectories.length > 0) {
    const directory = createdDirectories.pop();
    if (directory) {
      rmSync(directory, { force: true, recursive: true });
    }
  }
});

const seedSummary: AssignedWorkPackageSummary = {
  id: 'wp-local-001',
  sourceReference: 'seed-cmms-001',
  title: 'Assigned package test',
  assignedTeam: 'Instrumentation Alpha',
  priority: 'high',
  status: 'assigned',
  packageVersion: 1,
  snapshotContractVersion: '2026-04-v1',
  tagCount: 1,
  dueWindow: {
    startsAt: '2026-04-20T08:00:00.000Z',
    endsAt: '2026-04-20T17:00:00.000Z',
  },
  updatedAt: '2026-04-19T10:00:00.000Z',
};

const seedSnapshot: AssignedWorkPackageSnapshot = {
  contractVersion: '2026-04-v1',
  generatedAt: '2026-04-19T10:00:00.000Z',
  summary: seedSummary,
  tags: [
    {
      id: 'tag-001',
      tagCode: 'PT-101',
      shortDescription: 'Test pressure transmitter',
      area: 'North Unit',
      parentAssetReference: 'asset-001',
      instrumentFamily: 'pressure transmitter',
      instrumentSubtype: 'smart transmitter',
      measuredVariable: 'pressure',
      signalType: '4-20mA',
      range: { min: 0, max: 10, unit: 'bar' },
      tolerance: '±0.25% span',
      criticality: 'high',
      templateIds: ['tpl-pressure-as-found'],
      guidanceReferenceIds: ['guide-pressure'],
      historySummaryId: 'history-001',
    },
  ],
  templates: [
    {
      id: 'tpl-pressure-as-found',
      instrumentFamily: 'pressure transmitter',
      testPattern: 'as-found calibration check',
      title: 'Pressure calibration',
      calculationMode: 'span deviation',
      acceptanceStyle: 'within tolerance',
      minimumSubmissionEvidence: ['readings'],
      historyComparisonExpectation: 'compare repeated drift',
    },
  ],
  guidance: [
    {
      id: 'guide-pressure',
      title: 'Pressure check',
      version: '2026.04',
      summary: 'Confirm the impulse path is clear.',
      whyItMatters: 'Rules out false deviation.',
      sourceReference: 'TAGWISE-BP-PT-001',
    },
  ],
  historySummaries: [
    {
      id: 'history-001',
      tagId: 'tag-001',
      lastObservedAt: '2026-03-14T14:30:00.000Z',
      summaryText: 'Last result passed with mild drift.',
      lastResult: 'pass',
      trendHint: 'watch repeat drift',
    },
  ],
};

const replacementSummary: AssignedWorkPackageSummary = {
  id: 'wp-local-002',
  sourceReference: 'seed-cmms-002',
  title: 'Replacement assigned package',
  assignedTeam: 'Instrumentation Alpha',
  priority: 'routine',
  status: 'assigned',
  packageVersion: 2,
  snapshotContractVersion: '2026-04-v1',
  tagCount: 2,
  dueWindow: {
    startsAt: '2026-04-21T08:00:00.000Z',
    endsAt: '2026-04-21T17:00:00.000Z',
  },
  updatedAt: '2026-04-20T08:00:00.000Z',
};

describe('AssignedWorkPackageCatalogService', () => {
  it('downloads an assigned package and reloads it from local storage after reopen', async () => {
    const tempDirectory = mkdtempSync(join(tmpdir(), 'tagwise-work-package-'));
    createdDirectories.push(tempDirectory);

    const databasePath = join(tempDirectory, 'tagwise.db');
    const sandboxPath = join(tempDirectory, 'sandbox');
    const session: ActiveUserSession = {
      userId: 'user-technician',
      email: 'tech@tagwise.local',
      displayName: 'Field Technician',
      role: 'technician',
      lastAuthenticatedAt: '2026-04-19T09:00:00.000Z',
      accessTokenExpiresAt: '2026-04-19T10:00:00.000Z',
      refreshTokenExpiresAt: '2026-04-20T10:00:00.000Z',
      connectionMode: 'connected',
      reviewActionsAvailable: false,
    };

    const firstRuntime = await bootstrapLocalDatabase(
      () => Promise.resolve(createNodeSqliteDatabase(databasePath)),
      () => Promise.resolve(createNodeAppSandboxBoundary(sandboxPath)),
    );
    const service = new AssignedWorkPackageCatalogService({
      apiClient: {
        listAssignedPackages: async () => [seedSummary],
        downloadAssignedPackage: async () => seedSnapshot,
      },
      userPartitions: firstRuntime.repositories.userPartitions,
      now: () => new Date('2026-04-19T10:15:00.000Z'),
    });

    const refreshed = await service.refreshConnectedCatalog(session);
    expect(refreshed).toHaveLength(1);
    expect(refreshed[0]?.hasSnapshot).toBe(false);

    const download = await service.downloadAssignedPackage(session, seedSummary.id);
    expect(download.summaries[0]).toMatchObject({
      id: seedSummary.id,
      hasSnapshot: true,
      downloadedAt: '2026-04-19T10:15:00.000Z',
      snapshotGeneratedAt: seedSnapshot.generatedAt,
    });

    await firstRuntime.database.closeAsync?.();

    const secondRuntime = await bootstrapLocalDatabase(
      () => Promise.resolve(createNodeSqliteDatabase(databasePath)),
      () => Promise.resolve(createNodeAppSandboxBoundary(sandboxPath)),
    );
    const reopenedService = new AssignedWorkPackageCatalogService({
      apiClient: {
        listAssignedPackages: async () => [],
        downloadAssignedPackage: async () => {
          throw new Error('not used');
        },
      },
      userPartitions: secondRuntime.repositories.userPartitions,
    });
    const reopenedCatalog = await reopenedService.loadLocalCatalog({
      ...session,
      connectionMode: 'offline',
    });
    const reopenedSnapshot = await secondRuntime.repositories.userPartitions
      .forUser(session.userId)
      .workPackages.getSnapshot(seedSummary.id);

    expect(reopenedCatalog).toHaveLength(1);
    expect(reopenedCatalog[0]).toMatchObject({
      id: seedSummary.id,
      hasSnapshot: true,
      snapshotGeneratedAt: seedSnapshot.generatedAt,
    });
    expect(reopenedSnapshot?.summary.id).toBe(seedSummary.id);

    await secondRuntime.database.closeAsync?.();
  });

  it('keeps local catalog intact when a package download fails', async () => {
    const tempDirectory = mkdtempSync(join(tmpdir(), 'tagwise-work-package-fail-'));
    createdDirectories.push(tempDirectory);

    const runtime = await bootstrapLocalDatabase(
      () => Promise.resolve(createNodeSqliteDatabase(join(tempDirectory, 'tagwise.db'))),
      () => Promise.resolve(createNodeAppSandboxBoundary(join(tempDirectory, 'sandbox'))),
    );
    const session: ActiveUserSession = {
      userId: 'user-technician',
      email: 'tech@tagwise.local',
      displayName: 'Field Technician',
      role: 'technician',
      lastAuthenticatedAt: '2026-04-19T09:00:00.000Z',
      accessTokenExpiresAt: '2026-04-19T10:00:00.000Z',
      refreshTokenExpiresAt: '2026-04-20T10:00:00.000Z',
      connectionMode: 'connected',
      reviewActionsAvailable: false,
    };

    const service = new AssignedWorkPackageCatalogService({
      apiClient: {
        listAssignedPackages: async () => [seedSummary],
        downloadAssignedPackage: async () => {
          throw new AssignedWorkPackageApiError(
            'Assigned work package download failed.',
            500,
            'server',
          );
        },
      },
      userPartitions: runtime.repositories.userPartitions,
    });

    await service.refreshConnectedCatalog(session);
    await expect(service.downloadAssignedPackage(session, seedSummary.id)).rejects.toThrow(
      'Assigned work package download failed.',
    );

    expect(await service.loadLocalCatalog(session)).toMatchObject([
      {
        id: seedSummary.id,
        hasSnapshot: false,
        downloadedAt: null,
        snapshotGeneratedAt: null,
      },
    ]);
    expect(
      await runtime.repositories.userPartitions.forUser(session.userId).workPackages.getSnapshot(
        seedSummary.id,
      ),
    ).toBeNull();

    await runtime.database.closeAsync?.();
  });

  it('removes packages that are no longer assigned after a successful connected refresh', async () => {
    const tempDirectory = mkdtempSync(join(tmpdir(), 'tagwise-work-package-refresh-'));
    createdDirectories.push(tempDirectory);

    const runtime = await bootstrapLocalDatabase(
      () => Promise.resolve(createNodeSqliteDatabase(join(tempDirectory, 'tagwise.db'))),
      () => Promise.resolve(createNodeAppSandboxBoundary(join(tempDirectory, 'sandbox'))),
    );
    const session: ActiveUserSession = {
      userId: 'user-technician',
      email: 'tech@tagwise.local',
      displayName: 'Field Technician',
      role: 'technician',
      lastAuthenticatedAt: '2026-04-19T09:00:00.000Z',
      accessTokenExpiresAt: '2026-04-19T10:00:00.000Z',
      refreshTokenExpiresAt: '2026-04-20T10:00:00.000Z',
      connectionMode: 'connected',
      reviewActionsAvailable: false,
    };

    const initialService = new AssignedWorkPackageCatalogService({
      apiClient: {
        listAssignedPackages: async () => [seedSummary],
        downloadAssignedPackage: async () => seedSnapshot,
      },
      userPartitions: runtime.repositories.userPartitions,
      now: () => new Date('2026-04-19T10:15:00.000Z'),
    });
    await initialService.refreshConnectedCatalog(session);
    await initialService.downloadAssignedPackage(session, seedSummary.id);

    const refreshedService = new AssignedWorkPackageCatalogService({
      apiClient: {
        listAssignedPackages: async () => [replacementSummary],
        downloadAssignedPackage: async () => {
          throw new Error('not used');
        },
      },
      userPartitions: runtime.repositories.userPartitions,
    });

    const refreshedCatalog = await refreshedService.refreshConnectedCatalog(session);

    expect(refreshedCatalog).toHaveLength(1);
    expect(refreshedCatalog[0]).toMatchObject({
      id: replacementSummary.id,
      hasSnapshot: false,
    });
    expect(await runtime.repositories.userPartitions.forUser(session.userId).workPackages.getSnapshot(seedSummary.id))
      .toBeNull();

    await runtime.database.closeAsync?.();
  });

  it('updates freshness metadata on package refresh without losing local drafts', async () => {
    const tempDirectory = mkdtempSync(join(tmpdir(), 'tagwise-work-package-freshness-'));
    createdDirectories.push(tempDirectory);

    const runtime = await bootstrapLocalDatabase(
      () => Promise.resolve(createNodeSqliteDatabase(join(tempDirectory, 'tagwise.db'))),
      () => Promise.resolve(createNodeAppSandboxBoundary(join(tempDirectory, 'sandbox'))),
    );
    const session: ActiveUserSession = {
      userId: 'user-technician',
      email: 'tech@tagwise.local',
      displayName: 'Field Technician',
      role: 'technician',
      lastAuthenticatedAt: '2026-04-19T09:00:00.000Z',
      accessTokenExpiresAt: '2026-04-19T10:00:00.000Z',
      refreshTokenExpiresAt: '2026-04-20T10:00:00.000Z',
      connectionMode: 'connected',
      reviewActionsAvailable: false,
    };

    const refreshedSnapshot: AssignedWorkPackageSnapshot = {
      ...seedSnapshot,
      generatedAt: '2026-04-20T08:30:00.000Z',
      summary: {
        ...seedSnapshot.summary,
        packageVersion: 2,
        updatedAt: '2026-04-20T08:30:00.000Z',
      },
    };

    const service = new AssignedWorkPackageCatalogService({
      apiClient: {
        listAssignedPackages: async () => [seedSummary],
        downloadAssignedPackage: async () => seedSnapshot,
      },
      userPartitions: runtime.repositories.userPartitions,
      now: () => new Date('2026-04-19T10:15:00.000Z'),
    });
    await service.refreshConnectedCatalog(session);
    await service.downloadAssignedPackage(session, seedSummary.id);

    await runtime.repositories.userPartitions.forUser(session.userId).drafts.saveDraft({
      businessObjectType: 'work-package-report',
      businessObjectId: seedSummary.id,
      summaryText: 'Keep this draft',
      payloadJson: '{"draft":true}',
    });

    const refreshedService = new AssignedWorkPackageCatalogService({
      apiClient: {
        listAssignedPackages: async () => [refreshedSnapshot.summary],
        downloadAssignedPackage: async () => refreshedSnapshot,
      },
      userPartitions: runtime.repositories.userPartitions,
      now: () => new Date('2026-04-20T08:45:00.000Z'),
    });
    await refreshedService.refreshConnectedCatalog(session);
    const refreshResult = await refreshedService.downloadAssignedPackage(session, seedSummary.id);

    expect(refreshResult.summaries).toMatchObject([
      {
        id: seedSummary.id,
        downloadedAt: '2026-04-20T08:45:00.000Z',
        snapshotGeneratedAt: '2026-04-20T08:30:00.000Z',
      },
    ]);
    expect(
      await runtime.repositories.userPartitions.forUser(session.userId).drafts.getDraft({
        businessObjectType: 'work-package-report',
        businessObjectId: seedSummary.id,
      }),
    ).toMatchObject({
      summaryText: 'Keep this draft',
      payloadJson: '{"draft":true}',
    });

    await runtime.database.closeAsync?.();
  });
});
