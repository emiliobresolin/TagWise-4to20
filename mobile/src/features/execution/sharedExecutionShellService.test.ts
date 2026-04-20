import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { afterEach, describe, expect, it } from 'vitest';

import { createNodeAppSandboxBoundary } from '../../../tests/helpers/createNodeAppSandboxBoundary';
import { createNodeSqliteDatabase } from '../../../tests/helpers/createNodeSqliteDatabase';
import { bootstrapLocalDatabase } from '../../data/local/bootstrapLocalDatabase';
import type { ActiveUserSession } from '../auth/model';
import { LocalTagContextService } from '../work-packages/localTagContextService';
import type { AssignedWorkPackageSnapshot } from '../work-packages/model';
import { SharedExecutionShellService } from './sharedExecutionShellService';

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

const baseSnapshot: AssignedWorkPackageSnapshot = {
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
    tagCount: 1,
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
      tolerance: '+/-0.25% span',
      criticality: 'high',
      templateIds: ['tpl-pressure'],
      guidanceReferenceIds: ['guide-pressure'],
      historySummaryId: 'history-001',
    },
  ],
  templates: [
    {
      id: 'tpl-pressure',
      instrumentFamily: 'pressure transmitter',
      testPattern: 'as-found calibration check',
      title: 'Pressure transmitter template',
      calculationMode: 'deviation',
      acceptanceStyle: 'tolerance pass/fail',
      minimumSubmissionEvidence: ['readings', 'observations'],
      historyComparisonExpectation: 'compare last approved result',
    },
  ],
  guidance: [
    {
      id: 'guide-pressure',
      title: 'Pressure verification guidance',
      version: 'v1',
      summary: 'Verify loop continuity before recalibration.',
      whyItMatters: 'Separates instrument drift from loop fault.',
      sourceReference: 'ISA local practice',
    },
  ],
  historySummaries: [
    {
      id: 'history-001',
      tagId: 'tag-001',
      lastObservedAt: '2026-04-10T12:00:00.000Z',
      summaryText: 'Last calibration was within tolerance.',
      lastResult: 'Pass',
      trendHint: 'Stable over the last two interventions.',
    },
  ],
};

describe('SharedExecutionShellService', () => {
  it('loads a shared shell template entirely from local package data', async () => {
    const tempDirectory = mkdtempSync(join(tmpdir(), 'tagwise-execution-shell-'));
    createdDirectories.push(tempDirectory);

    const runtime = await bootstrapLocalDatabase(
      () => Promise.resolve(createNodeSqliteDatabase(join(tempDirectory, 'tagwise.db'))),
      () => Promise.resolve(createNodeAppSandboxBoundary(join(tempDirectory, 'sandbox'))),
    );

    await runtime.repositories.userPartitions
      .forUser(session.userId)
      .workPackages.saveDownloadedSnapshot(baseSnapshot, '2026-04-19T10:15:00.000Z');

    const service = new SharedExecutionShellService({
      userPartitions: runtime.repositories.userPartitions,
      tagContextService: new LocalTagContextService({
        userPartitions: runtime.repositories.userPartitions,
        now: () => new Date('2026-04-19T11:00:00.000Z'),
      }),
      now: () => new Date('2026-04-19T11:00:00.000Z'),
    });

    await expect(service.loadShell(session, baseSnapshot.summary.id, 'tag-001')).resolves.toMatchObject({
      workPackageId: baseSnapshot.summary.id,
      tagCode: 'PT-101',
      template: {
        id: 'tpl-pressure',
        title: 'Pressure transmitter template',
        version: '2026-04-v1',
        instrumentFamily: 'pressure transmitter',
        testPattern: 'as-found calibration check',
      },
      steps: [
        { id: 'context', title: 'Context' },
        { id: 'calculation', title: 'Calculation setup' },
        { id: 'history', title: 'History comparison' },
        { id: 'guidance', title: 'Checklist and guidance' },
      ],
      progress: {
        currentStepId: 'context',
        visitedStepIds: ['context'],
      },
    });

    await runtime.database.closeAsync?.();
  });

  it('persists execution step progress across restart-like reopen cycles', async () => {
    const tempDirectory = mkdtempSync(join(tmpdir(), 'tagwise-execution-progress-'));
    createdDirectories.push(tempDirectory);

    const databasePath = join(tempDirectory, 'tagwise.db');
    const sandboxPath = join(tempDirectory, 'sandbox');

    const firstRuntime = await bootstrapLocalDatabase(
      () => Promise.resolve(createNodeSqliteDatabase(databasePath)),
      () => Promise.resolve(createNodeAppSandboxBoundary(sandboxPath)),
    );
    await firstRuntime.repositories.userPartitions
      .forUser(session.userId)
      .workPackages.saveDownloadedSnapshot(baseSnapshot, '2026-04-19T10:15:00.000Z');

    const firstService = new SharedExecutionShellService({
      userPartitions: firstRuntime.repositories.userPartitions,
      tagContextService: new LocalTagContextService({
        userPartitions: firstRuntime.repositories.userPartitions,
        now: () => new Date('2026-04-19T11:00:00.000Z'),
      }),
      now: () => new Date('2026-04-19T11:05:00.000Z'),
    });

    const firstShell = await firstService.loadShell(session, baseSnapshot.summary.id, 'tag-001');
    expect(firstShell).not.toBeNull();

    const progressedShell = await firstService.selectStep(
      session,
      firstShell!,
      'history',
    );

    expect(progressedShell.progress).toMatchObject({
      currentStepId: 'history',
      visitedStepIds: ['context', 'history'],
      updatedAt: '2026-04-19T11:05:00.000Z',
    });

    await firstRuntime.database.closeAsync?.();

    const secondRuntime = await bootstrapLocalDatabase(
      () => Promise.resolve(createNodeSqliteDatabase(databasePath)),
      () => Promise.resolve(createNodeAppSandboxBoundary(sandboxPath)),
    );
    const secondService = new SharedExecutionShellService({
      userPartitions: secondRuntime.repositories.userPartitions,
      tagContextService: new LocalTagContextService({
        userPartitions: secondRuntime.repositories.userPartitions,
        now: () => new Date('2026-04-19T11:10:00.000Z'),
      }),
      now: () => new Date('2026-04-19T11:10:00.000Z'),
    });

    await expect(secondService.loadShell(session, baseSnapshot.summary.id, 'tag-001')).resolves.toMatchObject({
      progress: {
        currentStepId: 'history',
        visitedStepIds: ['context', 'history'],
      },
    });

    await secondRuntime.database.closeAsync?.();
  });
});
