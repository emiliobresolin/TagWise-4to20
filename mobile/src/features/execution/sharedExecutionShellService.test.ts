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

function buildTemplate(definition: {
  id: string;
  instrumentFamily: string;
  testPattern: string;
  title: string;
  calculationMode: string;
  acceptanceStyle: string;
  captureSummary: string;
  expectedLabel: string;
  observedLabel: string;
  expectedUnit?: string;
  observedUnit?: string;
  calculationRangeOverride?: { min: number; max: number; unit: string };
  conversionBasisSummary?: string;
  expectedRangeSummary?: string;
  checklistPrompts?: string[];
  minimumSubmissionEvidence: string[];
  expectedEvidence: string[];
  historyComparisonExpectation: string;
}) {
  return {
    id: definition.id,
    instrumentFamily: definition.instrumentFamily,
    testPattern: definition.testPattern,
    title: definition.title,
    calculationMode: definition.calculationMode,
    acceptanceStyle: definition.acceptanceStyle,
    captureSummary: definition.captureSummary,
    captureFields: [
      {
        id: 'expectedValue' as const,
        label: definition.expectedLabel,
        inputKind: 'numeric' as const,
        unit: definition.expectedUnit,
      },
      {
        id: 'observedValue' as const,
        label: definition.observedLabel,
        inputKind: 'numeric' as const,
        unit: definition.observedUnit,
      },
    ],
    calculationRangeOverride: definition.calculationRangeOverride,
    conversionBasisSummary: definition.conversionBasisSummary,
    expectedRangeSummary: definition.expectedRangeSummary,
    checklistPrompts: definition.checklistPrompts,
    minimumSubmissionEvidence: definition.minimumSubmissionEvidence,
    expectedEvidence: definition.expectedEvidence,
    historyComparisonExpectation: definition.historyComparisonExpectation,
  };
}

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
      templateIds: ['tpl-pressure-as-found', 'tpl-pressure-as-left'],
      guidanceReferenceIds: ['guide-pressure'],
      historySummaryId: 'history-001',
    },
  ],
  templates: [
    {
      id: 'tpl-pressure-as-found',
      instrumentFamily: 'pressure transmitter',
      testPattern: 'as-found calibration check',
      title: 'Pressure transmitter as-found template',
      calculationMode: 'deviation',
      acceptanceStyle: 'tolerance pass/fail',
      captureSummary: 'Capture pre-adjustment checkpoints before any recalibration action.',
      captureFields: [
        { id: 'expectedValue', label: 'Expected pressure', inputKind: 'numeric' },
        { id: 'observedValue', label: 'Measured pressure', inputKind: 'numeric' },
      ],
      minimumSubmissionEvidence: ['readings', 'observations'],
      expectedEvidence: ['supporting photo'],
      historyComparisonExpectation: 'compare last approved result',
    },
    {
      id: 'tpl-pressure-as-left',
      instrumentFamily: 'pressure transmitter',
      testPattern: 'as-left calibration check',
      title: 'Pressure transmitter as-left template',
      calculationMode: 'deviation',
      acceptanceStyle: 'tolerance pass/fail',
      captureSummary: 'Capture post-adjustment checkpoints and final instrument state.',
      captureFields: [
        { id: 'expectedValue', label: 'Expected pressure', inputKind: 'numeric' },
        { id: 'observedValue', label: 'Measured pressure', inputKind: 'numeric' },
      ],
      minimumSubmissionEvidence: ['readings', 'observations'],
      expectedEvidence: ['supporting photo', 'adjustment note'],
      historyComparisonExpectation: 'compare final result against the last approved as-left check',
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

const noHistorySnapshot: AssignedWorkPackageSnapshot = {
  ...baseSnapshot,
  summary: {
    ...baseSnapshot.summary,
    id: 'wp-local-004',
    title: 'Assigned package without history',
  },
  tags: [
    {
      ...baseSnapshot.tags[0]!,
      id: 'tag-no-history',
      historySummaryId: '',
    },
  ],
};

const familyPackSnapshot: AssignedWorkPackageSnapshot = {
  contractVersion: '2026-04-v1',
  generatedAt: '2026-04-19T10:00:00.000Z',
  summary: {
    id: 'wp-local-003',
    sourceReference: 'seed-cmms-003',
    title: 'Transmitter family pack',
    assignedTeam: 'Instrumentation Alpha',
    priority: 'high',
    status: 'assigned',
    packageVersion: 1,
    snapshotContractVersion: '2026-04-v1',
    tagCount: 5,
    dueWindow: {
      startsAt: '2026-04-20T08:00:00.000Z',
      endsAt: '2026-04-20T17:00:00.000Z',
    },
    updatedAt: '2026-04-19T10:00:00.000Z',
  },
  tags: [
    {
      id: 'tag-pt-family',
      tagCode: 'PT-101',
      shortDescription: 'North pressure transmitter',
      area: 'North Unit',
      parentAssetReference: 'asset-pt',
      instrumentFamily: 'pressure transmitter',
      instrumentSubtype: 'smart transmitter',
      measuredVariable: 'pressure',
      signalType: '4-20mA',
      range: { min: 0, max: 10, unit: 'bar' },
      tolerance: '+/-0.25% span',
      criticality: 'high',
      templateIds: ['tpl-pressure-loop-range'],
      guidanceReferenceIds: ['guide-shared'],
      historySummaryId: 'history-pt-family',
    },
    {
      id: 'tag-tt-family',
      tagCode: 'TT-205',
      shortDescription: 'North temperature transmitter',
      area: 'North Unit',
      parentAssetReference: 'asset-tt',
      instrumentFamily: 'temperature transmitter',
      instrumentSubtype: 'RTD input',
      measuredVariable: 'temperature',
      signalType: '4-20mA',
      range: { min: 0, max: 250, unit: 'C' },
      tolerance: '+/-0.3C',
      criticality: 'medium',
      templateIds: ['tpl-temperature-calibration-verification'],
      guidanceReferenceIds: ['guide-shared'],
      historySummaryId: 'history-tt-family',
    },
    {
      id: 'tag-lt-family',
      tagCode: 'LT-410',
      shortDescription: 'Tank level transmitter',
      area: 'Tank Farm',
      parentAssetReference: 'asset-lt',
      instrumentFamily: 'level transmitter',
      instrumentSubtype: 'guided wave radar',
      measuredVariable: 'level',
      signalType: '4-20mA',
      range: { min: 0, max: 8, unit: 'm' },
      tolerance: '+/-0.2% calibrated span',
      criticality: 'high',
      templateIds: ['tpl-level-output-verification'],
      guidanceReferenceIds: ['guide-shared'],
      historySummaryId: 'history-lt-family',
    },
    {
      id: 'tag-loop-family',
      tagCode: 'AI-330',
      shortDescription: 'North analog loop',
      area: 'North Unit',
      parentAssetReference: 'asset-loop',
      instrumentFamily: 'analog 4-20 mA loop',
      instrumentSubtype: 'isolated analog input loop',
      measuredVariable: 'process value',
      signalType: '4-20mA',
      range: { min: 0, max: 100, unit: '%' },
      tolerance: '+/-1% span',
      criticality: 'high',
      templateIds: ['tpl-loop-current-vs-process'],
      guidanceReferenceIds: ['guide-shared'],
      historySummaryId: 'history-loop-family',
    },
    {
      id: 'tag-valve-family',
      tagCode: 'XV-402',
      shortDescription: 'Tank inlet control valve with positioner',
      area: 'Tank Farm',
      parentAssetReference: 'asset-valve',
      instrumentFamily: 'control valve with positioner',
      instrumentSubtype: 'on-off with smart positioner',
      measuredVariable: 'position',
      signalType: 'digital-position-feedback',
      range: { min: 0, max: 100, unit: '%' },
      tolerance: '+/-2% span',
      criticality: 'medium',
      templateIds: [
        'tpl-valve-stroke-test',
        'tpl-valve-position-feedback-verification',
      ],
      guidanceReferenceIds: ['guide-shared'],
      historySummaryId: 'history-valve-family',
    },
  ],
  templates: [
    buildTemplate({
      id: 'tpl-pressure-loop-range',
      instrumentFamily: 'pressure transmitter',
      testPattern: 'loop verification against expected range',
      title: 'Pressure loop verification',
      calculationMode: 'expected range vs measured loop output',
      acceptanceStyle: 'within tolerance across expected range checkpoints',
      captureSummary: 'Capture loop checkpoints.',
      expectedLabel: 'Expected loop value',
      observedLabel: 'Measured loop value',
      minimumSubmissionEvidence: ['loop checkpoints'],
      expectedEvidence: ['reference source note'],
      historyComparisonExpectation: 'compare repeated loop drift',
    }),
    buildTemplate({
      id: 'tpl-temperature-calibration-verification',
      instrumentFamily: 'temperature transmitter / RTD input',
      testPattern: 'calibration verification',
      title: 'Temperature calibration verification',
      calculationMode: 'expected temperature vs measured output',
      acceptanceStyle: 'tolerance-based pass/fail with clear deviation display',
      captureSummary: 'Capture calibration checkpoints.',
      expectedLabel: 'Expected temperature',
      observedLabel: 'Measured output',
      minimumSubmissionEvidence: ['calibration checkpoints'],
      expectedEvidence: ['configuration note'],
      historyComparisonExpectation: 'compare last comparable verification result',
    }),
    buildTemplate({
      id: 'tpl-level-output-verification',
      instrumentFamily: 'level transmitter',
      testPattern: 'expected-versus-measured output verification',
      title: 'Level transmitter expected-versus-measured verification',
      calculationMode: 'expected value vs measured output',
      acceptanceStyle: 'tolerance/pass-fail classification against configured operating range',
      captureSummary: 'Capture expected output checkpoints.',
      expectedLabel: 'Expected level',
      observedLabel: 'Observed output',
      minimumSubmissionEvidence: ['expected references'],
      expectedEvidence: ['supporting photo'],
      historyComparisonExpectation: 'compare repeated output bias',
    }),
    buildTemplate({
      id: 'tpl-loop-current-vs-process',
      instrumentFamily: 'analog 4-20 mA loop',
      testPattern: 'expected current versus process value verification',
      title: 'Analog loop expected current verification',
      calculationMode: 'expected current vs measured current',
      acceptanceStyle: 'deviation and tolerance outcome against the configured conversion basis',
      captureSummary: 'Capture expected current from the process basis and compare it to measured loop current.',
      expectedLabel: 'Expected current',
      observedLabel: 'Measured current',
      expectedUnit: 'mA',
      observedUnit: 'mA',
      calculationRangeOverride: { min: 4, max: 20, unit: 'mA' },
      conversionBasisSummary:
        'Expected current is derived from the configured process range using a linear 4-20 mA conversion basis.',
      expectedRangeSummary: '0 to 100 % process value range / 4-20 mA signal range.',
      minimumSubmissionEvidence: ['expected current reference'],
      expectedEvidence: ['conversion basis note'],
      historyComparisonExpectation: 'compare repeated process-to-signal mismatch',
    }),
    buildTemplate({
      id: 'tpl-valve-stroke-test',
      instrumentFamily: 'control valve with positioner',
      testPattern: 'stroke test',
      title: 'Valve stroke test',
      calculationMode: 'commanded position vs observed travel',
      acceptanceStyle: 'pass/fail classification at commanded movement checkpoints',
      captureSummary: 'Capture commanded open, mid, and closed checkpoints.',
      expectedLabel: 'Commanded position',
      observedLabel: 'Observed travel',
      checklistPrompts: [
        'Confirm the movement path is clear before issuing a stroke command.',
        'Verify actuator supply or permissive readiness before concluding a movement fault.',
      ],
      minimumSubmissionEvidence: ['commanded points', 'observed travel responses'],
      expectedEvidence: ['supporting photo', 'actuator note'],
      historyComparisonExpectation: 'compare repeat sticking or delayed travel notes',
    }),
    buildTemplate({
      id: 'tpl-valve-position-feedback-verification',
      instrumentFamily: 'control valve with positioner',
      testPattern: 'position feedback verification',
      title: 'Valve position feedback verification',
      calculationMode: 'commanded position vs observed travel',
      acceptanceStyle: 'pass/fail classification at commanded feedback checkpoints',
      captureSummary:
        'Capture commanded position checkpoints and compare them against the observed position feedback response.',
      expectedLabel: 'Commanded position',
      observedLabel: 'Observed feedback',
      checklistPrompts: [
        'Confirm feedback indication is available before treating the issue as a travel fault.',
        'If feedback is unavailable, record that condition instead of blocking the check.',
      ],
      minimumSubmissionEvidence: ['commanded points', 'observed feedback responses'],
      expectedEvidence: ['supporting photo', 'positioner note'],
      historyComparisonExpectation: 'compare repeat feedback mismatch or delayed response notes',
    }),
  ],
  guidance: [
    {
      id: 'guide-shared',
      title: 'Shared guidance',
      version: 'v1',
      summary: 'Shared transmitter guidance.',
      whyItMatters: 'Keeps the shared shell grounded.',
      sourceReference: 'TAGWISE-BP-SHARED-001',
    },
  ],
  historySummaries: [
    {
      id: 'history-pt-family',
      tagId: 'tag-pt-family',
      lastObservedAt: '2026-04-10T12:00:00.000Z',
      summaryText: 'Pressure history available.',
      lastResult: 'Pass',
      trendHint: 'Watch repeat drift.',
    },
    {
      id: 'history-tt-family',
      tagId: 'tag-tt-family',
      lastObservedAt: '2026-04-09T12:00:00.000Z',
      summaryText: 'Temperature history available.',
      lastResult: 'Pass',
      trendHint: 'Watch repeat offset.',
    },
    {
      id: 'history-lt-family',
      tagId: 'tag-lt-family',
      lastObservedAt: '2026-04-08T12:00:00.000Z',
      summaryText: 'Level history available.',
      lastResult: 'Pass',
      trendHint: 'Watch repeat upper-range bias.',
    },
    {
      id: 'history-loop-family',
      tagId: 'tag-loop-family',
      lastObservedAt: '2026-04-07T12:00:00.000Z',
      summaryText: 'Analog loop history available.',
      lastResult: 'Pass with note',
      trendHint: 'Watch repeat mid-range current drift.',
    },
    {
      id: 'history-valve-family',
      tagId: 'tag-valve-family',
      lastObservedAt: '2026-04-06T12:00:00.000Z',
      summaryText: 'Valve history available.',
      lastResult: 'Pass with note',
      trendHint: 'Watch repeat delayed travel or feedback mismatch.',
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

    await expect(
      service.loadShell(session, baseSnapshot.summary.id, 'tag-001', 'tpl-pressure-as-found'),
    ).resolves.toMatchObject({
      workPackageId: baseSnapshot.summary.id,
      tagCode: 'PT-101',
      template: {
        id: 'tpl-pressure-as-found',
        title: 'Pressure transmitter as-found template',
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

  it('opens offline execution shells for the approved pressure, temperature/RTD, level, and analog loop patterns', async () => {
    const tempDirectory = mkdtempSync(join(tmpdir(), 'tagwise-execution-family-pack-'));
    createdDirectories.push(tempDirectory);

    const runtime = await bootstrapLocalDatabase(
      () => Promise.resolve(createNodeSqliteDatabase(join(tempDirectory, 'tagwise.db'))),
      () => Promise.resolve(createNodeAppSandboxBoundary(join(tempDirectory, 'sandbox'))),
    );

    await runtime.repositories.userPartitions
      .forUser(session.userId)
      .workPackages.saveDownloadedSnapshot(familyPackSnapshot, '2026-04-19T10:15:00.000Z');

    const service = new SharedExecutionShellService({
      userPartitions: runtime.repositories.userPartitions,
      tagContextService: new LocalTagContextService({
        userPartitions: runtime.repositories.userPartitions,
        now: () => new Date('2026-04-19T11:00:00.000Z'),
      }),
      now: () => new Date('2026-04-19T11:00:00.000Z'),
    });

    await expect(
      service.loadShell(
        session,
        familyPackSnapshot.summary.id,
        'tag-pt-family',
        'tpl-pressure-loop-range',
      ),
    ).resolves.toMatchObject({
      tagCode: 'PT-101',
      template: {
        instrumentFamily: 'pressure transmitter',
        testPattern: 'loop verification against expected range',
      },
      calculation: {
        definition: {
          expectedLabel: 'Expected loop value (bar)',
          observedLabel: 'Measured loop value (bar)',
        },
      },
    });

    await expect(
      service.loadShell(
        session,
        familyPackSnapshot.summary.id,
        'tag-tt-family',
        'tpl-temperature-calibration-verification',
      ),
    ).resolves.toMatchObject({
      tagCode: 'TT-205',
      template: {
        instrumentFamily: 'temperature transmitter / RTD input',
        testPattern: 'calibration verification',
      },
      calculation: {
        definition: {
          expectedLabel: 'Expected temperature (C)',
          observedLabel: 'Measured output (C)',
        },
      },
    });

    await expect(
      service.loadShell(
        session,
        familyPackSnapshot.summary.id,
        'tag-lt-family',
        'tpl-level-output-verification',
      ),
    ).resolves.toMatchObject({
      tagCode: 'LT-410',
      template: {
        instrumentFamily: 'level transmitter',
        testPattern: 'expected-versus-measured output verification',
      },
      calculation: {
        definition: {
          expectedLabel: 'Expected level (m)',
          observedLabel: 'Observed output (m)',
        },
      },
    });

    await expect(
      service.loadShell(
        session,
        familyPackSnapshot.summary.id,
        'tag-loop-family',
        'tpl-loop-current-vs-process',
      ),
    ).resolves.toMatchObject({
      tagCode: 'AI-330',
      template: {
        instrumentFamily: 'analog 4-20 mA loop',
        testPattern: 'expected current versus process value verification',
      },
      calculation: {
        definition: {
          expectedLabel: 'Expected current (mA)',
          observedLabel: 'Measured current (mA)',
          unit: 'mA',
          calculationRange: {
            min: 4,
            max: 20,
            unit: 'mA',
          },
          executionContext: {
            conversionBasisSummary:
              'Expected current is derived from the configured process range using a linear 4-20 mA conversion basis.',
            expectedRangeSummary: '0 to 100 % process value range / 4-20 mA signal range.',
          },
        },
      },
    });

    const valveShell = await service.loadShell(
      session,
      familyPackSnapshot.summary.id,
      'tag-valve-family',
      'tpl-valve-stroke-test',
    );

    expect(valveShell).toMatchObject({
      tagCode: 'XV-402',
      template: {
        instrumentFamily: 'control valve with positioner',
        testPattern: 'stroke test',
      },
      calculation: {
        definition: {
          expectedLabel: 'Commanded position (%)',
          observedLabel: 'Observed travel (%)',
        },
      },
    });
    expect(valveShell?.steps.find((step) => step.id === 'guidance')?.fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: 'Checklist prompts',
          value: expect.stringContaining(
            'Confirm the movement path is clear before issuing a stroke command.',
          ),
        }),
      ]),
    );

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

    const firstShell = await firstService.loadShell(
      session,
      baseSnapshot.summary.id,
      'tag-001',
      'tpl-pressure-as-found',
    );
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

    await expect(
      secondService.loadShell(
        session,
        baseSnapshot.summary.id,
        'tag-001',
        'tpl-pressure-as-found',
      ),
    ).resolves.toMatchObject({
      progress: {
        currentStepId: 'history',
        visitedStepIds: ['context', 'history'],
      },
    });

    await secondRuntime.database.closeAsync?.();
  });

  it('persists raw observations and calculated results across restart-like reopen cycles', async () => {
    const tempDirectory = mkdtempSync(join(tmpdir(), 'tagwise-execution-calculation-'));
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

    const firstShell = await firstService.loadShell(
      session,
      baseSnapshot.summary.id,
      'tag-001',
      'tpl-pressure-as-found',
    );
    expect(firstShell?.calculation).not.toBeNull();

    const calculatedShell = await firstService.saveCalculation(session, firstShell!, {
      expectedValue: '5',
      observedValue: '5.02',
    });

    expect(calculatedShell.calculation).toMatchObject({
      definition: {
        executionContext: {
          conversionBasisSummary: null,
          expectedRangeSummary: null,
        },
      },
      rawInputs: {
        expectedValue: '5',
        observedValue: '5.02',
      },
      result: {
        acceptance: 'pass',
      },
    });
    expect(calculatedShell.steps.find((step) => step.id === 'history')?.fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: 'Current result',
          value: expect.stringContaining('Pass'),
        }),
        expect.objectContaining({
          label: 'Current signed deviation',
          value: '0.02 bar',
        }),
        expect.objectContaining({
          label: 'Current absolute deviation',
          value: '0.02 bar',
        }),
        expect.objectContaining({
          label: 'Current percent of span',
          value: '0.2%',
        }),
        expect.objectContaining({
          label: 'Current vs prior',
          value: 'Pass now versus Pass previously.',
        }),
        expect.objectContaining({
          label: 'Prior result',
          value: 'Pass',
        }),
        expect.objectContaining({
          label: 'Recurrence cue',
          value: 'Stable over the last two interventions.',
        }),
      ]),
    );

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

    await expect(
      secondService.loadShell(
        session,
        baseSnapshot.summary.id,
        'tag-001',
        'tpl-pressure-as-found',
      ),
    ).resolves.toMatchObject({
      calculation: {
        definition: {
          executionContext: {
            conversionBasisSummary: null,
            expectedRangeSummary: null,
          },
        },
        rawInputs: {
          expectedValue: '5',
          observedValue: '5.02',
        },
        result: {
          acceptance: 'pass',
        },
      },
    });

    await secondRuntime.database.closeAsync?.();
  });

  it('shows deterministic current result data in the history step, not only pass fail language', async () => {
    const tempDirectory = mkdtempSync(join(tmpdir(), 'tagwise-execution-history-current-data-'));
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
      now: () => new Date('2026-04-19T11:05:00.000Z'),
    });

    const shell = await service.loadShell(
      session,
      baseSnapshot.summary.id,
      'tag-001',
      'tpl-pressure-as-found',
    );

    const calculatedShell = await service.saveCalculation(session, shell!, {
      expectedValue: '5',
      observedValue: '5.02',
    });

    expect(calculatedShell.steps.find((step) => step.id === 'history')?.fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: 'Current checkpoint',
          value: 'Expected pressure (bar): 5; Measured pressure (bar): 5.02',
        }),
        expect.objectContaining({
          label: 'Current signed deviation',
          value: '0.02 bar',
        }),
        expect.objectContaining({
          label: 'Current absolute deviation',
          value: '0.02 bar',
        }),
        expect.objectContaining({
          label: 'Current percent of span',
          value: '0.2%',
        }),
      ]),
    );

    await runtime.database.closeAsync?.();
  });

  it('keeps execution available when cached history is unavailable', async () => {
    const tempDirectory = mkdtempSync(join(tmpdir(), 'tagwise-execution-history-unavailable-'));
    createdDirectories.push(tempDirectory);

    const runtime = await bootstrapLocalDatabase(
      () => Promise.resolve(createNodeSqliteDatabase(join(tempDirectory, 'tagwise.db'))),
      () => Promise.resolve(createNodeAppSandboxBoundary(join(tempDirectory, 'sandbox'))),
    );

    await runtime.repositories.userPartitions
      .forUser(session.userId)
      .workPackages.saveDownloadedSnapshot(noHistorySnapshot, '2026-04-19T10:15:00.000Z');

    const service = new SharedExecutionShellService({
      userPartitions: runtime.repositories.userPartitions,
      tagContextService: new LocalTagContextService({
        userPartitions: runtime.repositories.userPartitions,
        now: () => new Date('2026-04-19T11:00:00.000Z'),
      }),
      now: () => new Date('2026-04-19T11:00:00.000Z'),
    });

    const shell = await service.loadShell(
      session,
      noHistorySnapshot.summary.id,
      'tag-no-history',
      'tpl-pressure-as-found',
    );

    expect(shell).toMatchObject({
      workPackageId: noHistorySnapshot.summary.id,
      tagCode: 'PT-101',
    });
    expect(shell?.steps.find((step) => step.id === 'history')?.fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: 'History state',
          value: 'Unavailable',
        }),
        expect.objectContaining({
          label: 'Current vs prior',
          value: 'Enter current values to compare them with cached history.',
        }),
      ]),
    );

    await runtime.database.closeAsync?.();
  });

  it('does not load a persisted calculation when the template contract version changes', async () => {
    const tempDirectory = mkdtempSync(join(tmpdir(), 'tagwise-execution-calculation-version-'));
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

    const firstShell = await firstService.loadShell(
      session,
      baseSnapshot.summary.id,
      'tag-001',
      'tpl-pressure-as-found',
    );
    expect(firstShell?.calculation).not.toBeNull();

    await firstService.saveCalculation(session, firstShell!, {
      expectedValue: '5',
      observedValue: '5.02',
    });

    await firstRuntime.repositories.userPartitions.forUser(session.userId).workPackages.saveDownloadedSnapshot(
      {
        ...baseSnapshot,
        contractVersion: '2026-05-v2',
        summary: {
          ...baseSnapshot.summary,
          packageVersion: 2,
          snapshotContractVersion: '2026-05-v2',
        },
      },
      '2026-04-20T09:00:00.000Z',
    );

    const reloadedShell = await firstService.loadShell(
      session,
      baseSnapshot.summary.id,
      'tag-001',
      'tpl-pressure-as-found',
    );

    expect(reloadedShell).toMatchObject({
      template: {
        version: '2026-05-v2',
      },
      calculation: {
        rawInputs: {
          expectedValue: '',
          observedValue: '',
        },
        result: null,
        updatedAt: null,
      },
    });

    await firstRuntime.database.closeAsync?.();
  });
});
