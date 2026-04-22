import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { afterEach, describe, expect, it } from 'vitest';

import { createNodeAppSandboxBoundary } from '../../../tests/helpers/createNodeAppSandboxBoundary';
import { createNodeSqliteDatabase } from '../../../tests/helpers/createNodeSqliteDatabase';
import { bootstrapLocalDatabase } from '../../data/local/bootstrapLocalDatabase';
import type { ActiveUserSession } from '../auth/model';
import type { AssignedWorkPackageSnapshot } from './model';
import { LocalTagContextService } from './localTagContextService';

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
      captureSummary: 'Capture local pressure checkpoints and compare expected versus measured values.',
      captureFields: [
        { id: 'expectedValue', label: 'Expected pressure', inputKind: 'numeric' },
        { id: 'observedValue', label: 'Measured pressure', inputKind: 'numeric' },
      ],
      minimumSubmissionEvidence: ['readings'],
      expectedEvidence: ['supporting photo'],
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

describe('LocalTagContextService', () => {
  it('loads field-critical tag context entirely from local storage after reopen-like access', async () => {
    const tempDirectory = mkdtempSync(join(tmpdir(), 'tagwise-tag-context-'));
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
    await firstRuntime.database.closeAsync?.();

    const secondRuntime = await bootstrapLocalDatabase(
      () => Promise.resolve(createNodeSqliteDatabase(databasePath)),
      () => Promise.resolve(createNodeAppSandboxBoundary(sandboxPath)),
    );
    const service = new LocalTagContextService({
      userPartitions: secondRuntime.repositories.userPartitions,
      now: () => new Date('2026-04-19T11:00:00.000Z'),
    });

    await expect(
      service.getTagContext(session, baseSnapshot.summary.id, 'tag-001'),
    ).resolves.toMatchObject({
      tagCode: 'PT-101',
      measuredVariable: { value: 'pressure', state: 'available' },
      signalType: { value: '4-20mA', state: 'available' },
      range: { value: '0 to 10 bar', state: 'available' },
      criticality: { value: 'High', state: 'available' },
      dueIndicator: { state: 'available', overdue: false },
      historyPreview: {
        state: 'available',
        summary: 'Last calibration was within tolerance.',
        detail: expect.stringContaining('Cached history is recent enough for local comparison.'),
        lastResult: 'Pass',
        recurrenceCue: 'Stable over the last two interventions.',
      },
      referencePointers: {
        state: 'available',
        executionTemplates: [
          {
            id: 'tpl-pressure',
            title: 'Pressure transmitter template',
            testPattern: 'as-found calibration check',
          },
        ],
      },
    });

    await secondRuntime.database.closeAsync?.();
  });

  it('marks missing context, missing references, and unavailable history explicitly', async () => {
    const tempDirectory = mkdtempSync(join(tmpdir(), 'tagwise-tag-context-missing-'));
    createdDirectories.push(tempDirectory);

    const runtime = await bootstrapLocalDatabase(
      () => Promise.resolve(createNodeSqliteDatabase(join(tempDirectory, 'tagwise.db'))),
      () => Promise.resolve(createNodeAppSandboxBoundary(join(tempDirectory, 'sandbox'))),
    );

    const missingSnapshot: AssignedWorkPackageSnapshot = {
      ...baseSnapshot,
      summary: {
        ...baseSnapshot.summary,
        id: 'wp-local-002',
        dueWindow: {
          startsAt: null,
          endsAt: null,
        },
      },
      tags: [
        {
          ...baseSnapshot.tags[0]!,
          id: 'tag-002',
          tagCode: 'LT-202',
          area: '',
          parentAssetReference: '',
          measuredVariable: '',
          signalType: '',
          range: { min: 0, max: 100, unit: '' },
          tolerance: '',
          criticality: undefined as unknown as 'medium' | 'high',
          templateIds: ['tpl-missing'],
          guidanceReferenceIds: ['guide-missing'],
          historySummaryId: '',
        },
      ],
      templates: [],
      guidance: [],
      historySummaries: [],
    };

    await runtime.repositories.userPartitions
      .forUser(session.userId)
      .workPackages.saveDownloadedSnapshot(missingSnapshot, '2026-04-19T10:15:00.000Z');

    const service = new LocalTagContextService({
      userPartitions: runtime.repositories.userPartitions,
      now: () => new Date('2026-04-19T11:00:00.000Z'),
    });

    await expect(
      service.getTagContext(session, missingSnapshot.summary.id, 'tag-002'),
    ).resolves.toMatchObject({
      area: { value: 'Missing', state: 'missing' },
      parentAssetReference: { value: 'Missing', state: 'missing' },
      measuredVariable: { value: 'Missing', state: 'missing' },
      signalType: { value: 'Missing', state: 'missing' },
      range: { value: 'Missing', state: 'missing' },
      tolerance: { value: 'Missing', state: 'missing' },
      criticality: { value: 'Missing', state: 'missing' },
      dueIndicator: { value: 'Missing', state: 'missing' },
      historyPreview: {
        state: 'unavailable',
        summary: 'No local history summary was attached to this tag.',
        lastResult: null,
        recurrenceCue: null,
      },
      referencePointers: {
        state: 'missing',
        detail: 'Missing template pointer(s): tpl-missing. Missing guidance pointer(s): guide-missing',
      },
    });

    await runtime.database.closeAsync?.();
  });

  it('marks cached history as stale when the local package freshness is stale', async () => {
    const tempDirectory = mkdtempSync(join(tmpdir(), 'tagwise-tag-context-stale-'));
    createdDirectories.push(tempDirectory);

    const runtime = await bootstrapLocalDatabase(
      () => Promise.resolve(createNodeSqliteDatabase(join(tempDirectory, 'tagwise.db'))),
      () => Promise.resolve(createNodeAppSandboxBoundary(join(tempDirectory, 'sandbox'))),
    );

    await runtime.repositories.userPartitions
      .forUser(session.userId)
      .workPackages.saveDownloadedSnapshot(baseSnapshot, '2026-04-19T10:15:00.000Z');

    const service = new LocalTagContextService({
      userPartitions: runtime.repositories.userPartitions,
      now: () => new Date('2026-04-20T12:30:00.000Z'),
    });

    await expect(
      service.getTagContext(session, baseSnapshot.summary.id, 'tag-001'),
    ).resolves.toMatchObject({
      historyPreview: {
        state: 'stale',
        summary: 'Last calibration was within tolerance.',
        detail: expect.stringContaining(
          'The cached history came from an upstream snapshot older than 24 hours. Compare carefully and refresh when connected.',
        ),
        lastResult: 'Pass',
        recurrenceCue: 'Stable over the last two interventions.',
      },
    });

    await runtime.database.closeAsync?.();
  });

  it('marks cached history as age unknown when upstream freshness metadata is missing', async () => {
    const tempDirectory = mkdtempSync(join(tmpdir(), 'tagwise-tag-context-age-unknown-'));
    createdDirectories.push(tempDirectory);

    const runtime = await bootstrapLocalDatabase(
      () => Promise.resolve(createNodeSqliteDatabase(join(tempDirectory, 'tagwise.db'))),
      () => Promise.resolve(createNodeAppSandboxBoundary(join(tempDirectory, 'sandbox'))),
    );

    const ageUnknownSnapshot: AssignedWorkPackageSnapshot = {
      ...baseSnapshot,
      generatedAt: '',
    };

    await runtime.repositories.userPartitions
      .forUser(session.userId)
      .workPackages.saveDownloadedSnapshot(ageUnknownSnapshot, '2026-04-19T10:15:00.000Z');

    const service = new LocalTagContextService({
      userPartitions: runtime.repositories.userPartitions,
      now: () => new Date('2026-04-19T11:00:00.000Z'),
    });

    await expect(
      service.getTagContext(session, ageUnknownSnapshot.summary.id, 'tag-001'),
    ).resolves.toMatchObject({
      historyPreview: {
        state: 'age-unknown',
        summary: 'Last calibration was within tolerance.',
        detail: expect.stringContaining(
          'History freshness metadata is missing. Refresh this package while connected before trusting the comparison.',
        ),
        lastResult: 'Pass',
        recurrenceCue: 'Stable over the last two interventions.',
      },
    });

    await runtime.database.closeAsync?.();
  });
});
