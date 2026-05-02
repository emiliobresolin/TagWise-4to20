import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { createNodeAppSandboxBoundary } from '../../../tests/helpers/createNodeAppSandboxBoundary';
import { createNodeSqliteDatabase } from '../../../tests/helpers/createNodeSqliteDatabase';
import { bootstrapLocalDatabase } from '../../data/local/bootstrapLocalDatabase';
import type { ActiveUserSession } from '../auth/model';
import { LocalTagContextService } from '../work-packages/localTagContextService';
import type { AssignedWorkPackageSnapshot } from '../work-packages/model';
import type { SharedExecutionShell } from './model';
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
  checklistSteps?: AssignedWorkPackageSnapshot['templates'][number]['checklistSteps'];
  guidedDiagnosisPrompts?: AssignedWorkPackageSnapshot['templates'][number]['guidedDiagnosisPrompts'];
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
    checklistSteps: definition.checklistSteps,
    guidedDiagnosisPrompts: definition.guidedDiagnosisPrompts,
    minimumSubmissionEvidence: definition.minimumSubmissionEvidence,
    expectedEvidence: definition.expectedEvidence,
    historyComparisonExpectation: definition.historyComparisonExpectation,
  };
}

function serviceUpdateChecklistToCompleted(
  service: SharedExecutionShellService,
  shell: SharedExecutionShell,
  observationNotes: string,
) {
  return service.updateChecklistOutcome(
    service.updateChecklistOutcome(
      service.updateObservationNotes(shell, observationNotes),
      'pressure-path-check',
      'completed',
    ),
    'pressure-reference-check',
    'completed',
  );
}

async function buildReadyForSubmissionShell(input: {
  service: SharedExecutionShellService;
  session: ActiveUserSession;
  workPackageId: string;
  tagId: string;
  templateId: string;
  observationNotes: string;
  justifyMissingExpectedEvidence?: boolean;
  photoInput?: {
    source: 'camera' | 'library';
    uri: string;
    fileName: string | null;
    mimeType: string | null;
    width: number | null;
    height: number | null;
    fileSize: number | null;
  };
}): Promise<SharedExecutionShell> {
  const loadedShell = await input.service.loadShell(
    input.session,
    input.workPackageId,
    input.tagId,
    input.templateId,
  );

  if (!loadedShell) {
    throw new Error('Expected execution shell to load for submission test preparation.');
  }

  const calculatedShell = await input.service.saveCalculation(input.session, loadedShell, {
    expectedValue: '5',
    observedValue: '5.02',
  });
  const preparedGuidanceShell = serviceUpdateChecklistToCompleted(
    input.service,
    await input.service.selectStep(input.session, calculatedShell, 'guidance'),
    input.observationNotes,
  );
  const guidanceWithExpectedEvidenceJustification = input.justifyMissingExpectedEvidence
    ? input.service.updateRiskJustification(
        preparedGuidanceShell,
        'expected-evidence:supporting-photo',
        'Supporting photo was not captured, so the draft carries a technician justification instead.',
      )
    : preparedGuidanceShell;
  const savedGuidanceShell = await input.service.saveGuidanceEvidence(
    input.session,
    guidanceWithExpectedEvidenceJustification,
  );

  if (!input.photoInput) {
    return savedGuidanceShell;
  }

  return input.service.attachPhotoEvidence(
    input.session,
    savedGuidanceShell,
    input.photoInput,
  );
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
      checklistSteps: [
        {
          id: 'pressure-path-check',
          prompt:
            'Confirm impulse path and vent condition before treating deviation as transmitter drift.',
          whyItMatters:
            'This keeps the pressure check grounded in process-side reality before recalibration.',
          helpsRuleOut: 'plugged impulse lines or trapped process-side pressure',
          sourceReference: 'ISA local practice',
        },
        {
          id: 'pressure-reference-check',
          prompt: 'Confirm the applied reference is stable before saving the checkpoint.',
          whyItMatters: 'Stable reference prevents false span error in the local shell.',
          helpsRuleOut: 'unstable pressure source or setup error',
          sourceReference: 'ISA local practice',
        },
      ],
      guidedDiagnosisPrompts: [
        {
          id: 'pressure-diagnosis-repeat',
          prompt:
            'If the result repeats the prior drift pattern, inspect sensing path and manifold condition first.',
          whyItMatters: 'Repeated patterns often point to recurring field conditions, not sudden sensor failure.',
          helpsRuleOut: 'recurring manifold or impulse line problems',
          sourceReference: 'ISA local practice',
        },
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

const missingContextAndHistorySnapshot: AssignedWorkPackageSnapshot = {
  ...baseSnapshot,
  summary: {
    ...baseSnapshot.summary,
    id: 'wp-local-005',
    title: 'Assigned package with missing context',
  },
  tags: [
    {
      ...baseSnapshot.tags[0]!,
      id: 'tag-missing-context',
      area: '',
      parentAssetReference: '',
      instrumentSubtype: '',
      measuredVariable: '',
      signalType: '',
      tolerance: '',
      historySummaryId: '',
    },
  ],
};

const unmappedEvidenceSnapshot: AssignedWorkPackageSnapshot = {
  ...baseSnapshot,
  summary: {
    ...baseSnapshot.summary,
    id: 'wp-local-006',
    title: 'Assigned package with unmapped evidence label',
  },
  tags: [
    {
      ...baseSnapshot.tags[0]!,
      id: 'tag-unmapped-evidence',
      tagCode: 'PT-106',
      templateIds: ['tpl-pressure-unmapped-evidence'],
    },
  ],
  templates: [
    buildTemplate({
      id: 'tpl-pressure-unmapped-evidence',
      instrumentFamily: 'pressure transmitter',
      testPattern: 'unmapped evidence contract check',
      title: 'Pressure template with unmapped evidence requirement',
      calculationMode: 'deviation',
      acceptanceStyle: 'tolerance pass/fail',
      captureSummary: 'Capture readings while leaving an unmapped evidence hook unsatisfied.',
      expectedLabel: 'Expected pressure',
      observedLabel: 'Measured pressure',
      minimumSubmissionEvidence: ['field sketch'],
      expectedEvidence: [],
      historyComparisonExpectation: 'compare last approved result',
    }),
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
      checklistSteps: [
        {
          id: 'valve-path-check',
          prompt:
            'Confirm the movement path and required permissives are clear before judging the stroke result.',
          whyItMatters: 'This keeps the movement check grounded in actual field readiness before escalation.',
          helpsRuleOut: 'blocked movement path or missing permissive conditions',
          sourceReference: 'TAGWISE-BP-XV-003',
        },
      ],
      guidedDiagnosisPrompts: [
        {
          id: 'valve-diagnosis-travel-lag',
          prompt:
            'If commanded position changes but travel lags, inspect supply and mechanical restriction before escalation.',
          whyItMatters:
            'Lagging response needs a quick field check before treating it as a confirmed device defect.',
          helpsRuleOut: 'air-supply weakness or mechanical restriction',
          sourceReference: 'TAGWISE-BP-XV-003',
        },
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
        { id: 'report', title: 'Report draft review' },
      ],
      progress: {
        currentStepId: 'context',
        visitedStepIds: ['context'],
      },
    });

    await runtime.database.closeAsync?.();
  });

  it('loads structured checklist steps, guided diagnosis prompts, and linked guidance into the shared guidance step', async () => {
    const tempDirectory = mkdtempSync(join(tmpdir(), 'tagwise-execution-guidance-'));
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

    const shell = await service.loadShell(
      session,
      baseSnapshot.summary.id,
      'tag-001',
      'tpl-pressure-as-found',
    );

    expect(shell).toMatchObject({
      guidance: {
        riskState: 'flagged',
        submitReadiness: 'blocked',
        checklistItems: [
          expect.objectContaining({
            id: 'pressure-path-check',
            outcome: 'pending',
            sourceReference: 'ISA local practice',
          }),
          expect.objectContaining({
            id: 'pressure-reference-check',
            outcome: 'pending',
          }),
        ],
        guidedDiagnosisPrompts: [
          expect.objectContaining({
            id: 'pressure-diagnosis-repeat',
            prompt: expect.stringContaining('prior drift pattern'),
          }),
        ],
        linkedGuidance: [
          expect.objectContaining({
            id: 'guide-pressure',
            title: 'Pressure verification guidance',
            sourceReference: 'ISA local practice',
          }),
        ],
        riskItems: expect.arrayContaining([
          expect.objectContaining({
            id: 'expected-evidence:supporting-photo',
            title: 'Expected evidence missing: supporting photo',
            severity: 'warning',
          }),
          expect.objectContaining({
            id: 'minimum-evidence:readings',
            title: 'Minimum evidence missing: readings',
            severity: 'submit-block',
          }),
        ]),
      },
    });
    expect(shell?.steps.find((step) => step.id === 'guidance')?.fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: 'Checklist status',
          value: 'Pending 2; Completed 0; Incomplete 0; Skipped 0',
        }),
        expect.objectContaining({
          label: 'Guided diagnosis prompts',
          value: '1 prompt(s) available',
        }),
        expect.objectContaining({
          label: 'Linked guidance',
          value: 'Pressure verification guidance',
        }),
        expect.objectContaining({
          label: 'Submit readiness',
          value: 'Blocked by rule hooks',
        }),
      ]),
    );

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
      guidance: {
        checklistItems: [
          expect.objectContaining({
            id: 'valve-path-check',
            outcome: 'pending',
          }),
        ],
        guidedDiagnosisPrompts: [
          expect.objectContaining({
            id: 'valve-diagnosis-travel-lag',
          }),
        ],
      },
    });
    expect(valveShell?.steps.find((step) => step.id === 'guidance')?.fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: 'Checklist status',
          value: 'Pending 1; Completed 0; Incomplete 0; Skipped 0',
        }),
        expect.objectContaining({
          label: 'Guided diagnosis prompts',
          value: '1 prompt(s) available',
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

  it('persists structured execution evidence linked to tag, step, and draft report across restart-like reopen cycles', async () => {
    const tempDirectory = mkdtempSync(join(tmpdir(), 'tagwise-execution-evidence-'));
    createdDirectories.push(tempDirectory);

    const databasePath = join(tempDirectory, 'tagwise.db');
    const sandboxPath = join(tempDirectory, 'sandbox');
    const draftReportId = `tag-report:${baseSnapshot.summary.id}:tag-001`;

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

    const guidanceEditedShell = firstService.updateObservationNotes(
      firstService.updateChecklistOutcome(
        firstService.updateChecklistOutcome(firstShell!, 'pressure-path-check', 'completed'),
        'pressure-reference-check',
        'incomplete',
      ),
      'Observed slight oscillation at the reference source before saving the checkpoint.',
    );

    const guidanceSavedShell = await firstService.saveGuidanceEvidence(
      session,
      guidanceEditedShell,
    );
    const fullySavedShell = await firstService.saveCalculation(session, guidanceSavedShell, {
      expectedValue: '5',
      observedValue: '5.02',
    });

    expect(fullySavedShell).toMatchObject({
      evidence: {
        draftReportId,
        draftReportState: 'technician-owned-draft',
        observationNotes:
          'Observed slight oscillation at the reference source before saving the checkpoint.',
      },
      guidance: {
        checklistItems: [
          expect.objectContaining({
            id: 'pressure-path-check',
            outcome: 'completed',
          }),
          expect.objectContaining({
            id: 'pressure-reference-check',
            outcome: 'incomplete',
          }),
        ],
      },
    });

    expect(fullySavedShell.steps.find((step) => step.id === 'guidance')?.fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: 'Draft report',
          value: draftReportId,
        }),
        expect.objectContaining({
          label: 'Observation notes',
          value:
            'Observed slight oscillation at the reference source before saving the checkpoint.',
        }),
      ]),
    );

    const firstStore = firstRuntime.repositories.userPartitions.forUser(session.userId);
    const savedEvidence = await firstStore.executionEvidence.listEvidence(
      baseSnapshot.summary.id,
      'tag-001',
      'tpl-pressure-as-found',
      '2026-04-v1',
    );
    const guidanceEvidence = savedEvidence.find((item) => item.executionStepId === 'guidance');
    const calculationEvidence = savedEvidence.find(
      (item) => item.executionStepId === 'calculation',
    );

    expect(savedEvidence).toHaveLength(2);
    expect(guidanceEvidence).toMatchObject({
      draftReportId,
      executionStepId: 'guidance',
      observationNotes:
        'Observed slight oscillation at the reference source before saving the checkpoint.',
      checklistOutcomes: [
        {
          checklistItemId: 'pressure-path-check',
          outcome: 'completed',
        },
        {
          checklistItemId: 'pressure-reference-check',
          outcome: 'incomplete',
        },
      ],
      structuredReadings: null,
    });
    expect(calculationEvidence).toMatchObject({
      draftReportId,
      executionStepId: 'calculation',
      observationNotes: '',
      checklistOutcomes: [],
      structuredReadings: expect.objectContaining({
        expectedLabel: 'Expected pressure (bar)',
        observedLabel: 'Measured pressure (bar)',
        expectedValue: '5',
        observedValue: '5.02',
        acceptance: 'pass',
      }),
    });
    expect(calculationEvidence?.structuredReadings?.signedDeviation).toBeCloseTo(0.02);
    expect(calculationEvidence?.structuredReadings?.absoluteDeviation).toBeCloseTo(0.02);
    expect(calculationEvidence?.structuredReadings?.percentOfSpan).toBeCloseTo(0.2);

    const draft = await firstStore.drafts.getDraft({
      businessObjectType: 'per-tag-report',
      businessObjectId: draftReportId,
    });
    expect(draft).not.toBeNull();
    expect(JSON.parse(draft!.payloadJson)).toMatchObject({
      reportId: draftReportId,
      workPackageId: baseSnapshot.summary.id,
      tagId: 'tag-001',
      state: 'technician-owned-draft',
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
      evidence: {
        draftReportId,
        draftReportState: 'technician-owned-draft',
        observationNotes:
          'Observed slight oscillation at the reference source before saving the checkpoint.',
        calculationEvidenceUpdatedAt: '2026-04-19T11:05:00.000Z',
        guidanceEvidenceUpdatedAt: '2026-04-19T11:05:00.000Z',
      },
      guidance: {
        checklistItems: [
          expect.objectContaining({
            id: 'pressure-path-check',
            outcome: 'completed',
          }),
          expect.objectContaining({
            id: 'pressure-reference-check',
            outcome: 'incomplete',
          }),
        ],
      },
    });

    await secondRuntime.database.closeAsync?.();
  });

  it('keeps saved execution evidence editable while the linked draft report remains technician owned', async () => {
    const tempDirectory = mkdtempSync(join(tmpdir(), 'tagwise-execution-evidence-editable-'));
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

    const initialSavedShell = await service.saveGuidanceEvidence(
      session,
      service.updateObservationNotes(
        service.updateChecklistOutcome(shell!, 'pressure-path-check', 'completed'),
        'Initial observation note.',
      ),
    );

    const revisedSavedShell = await service.saveGuidanceEvidence(
      session,
      service.updateObservationNotes(
        service.updateChecklistOutcome(
          initialSavedShell,
          'pressure-reference-check',
          'skipped',
        ),
        'Revised observation note after rechecking the manifold.',
      ),
    );

    const evidence = await runtime.repositories.userPartitions
      .forUser(session.userId)
      .executionEvidence.getEvidenceForStep(
        baseSnapshot.summary.id,
        'tag-001',
        'tpl-pressure-as-found',
        '2026-04-v1',
        'guidance',
      );

    expect(revisedSavedShell).toMatchObject({
      evidence: {
        observationNotes: 'Revised observation note after rechecking the manifold.',
        draftReportState: 'technician-owned-draft',
      },
      guidance: {
        checklistItems: [
          expect.objectContaining({
            id: 'pressure-path-check',
            outcome: 'completed',
          }),
          expect.objectContaining({
            id: 'pressure-reference-check',
            outcome: 'skipped',
          }),
        ],
      },
    });
    expect(evidence).toMatchObject({
      draftReportId: `tag-report:${baseSnapshot.summary.id}:tag-001`,
      executionStepId: 'guidance',
      observationNotes: 'Revised observation note after rechecking the manifold.',
      checklistOutcomes: [
        {
          checklistItemId: 'pressure-path-check',
          outcome: 'completed',
        },
        {
          checklistItemId: 'pressure-reference-check',
          outcome: 'skipped',
        },
      ],
    });

    await runtime.database.closeAsync?.();
  });

  it('creates visible risk state for missing context and unavailable history while surfacing submit-block hooks separately', async () => {
    const tempDirectory = mkdtempSync(join(tmpdir(), 'tagwise-execution-risk-state-'));
    createdDirectories.push(tempDirectory);

    const runtime = await bootstrapLocalDatabase(
      () => Promise.resolve(createNodeSqliteDatabase(join(tempDirectory, 'tagwise.db'))),
      () => Promise.resolve(createNodeAppSandboxBoundary(join(tempDirectory, 'sandbox'))),
    );

    await runtime.repositories.userPartitions
      .forUser(session.userId)
      .workPackages.saveDownloadedSnapshot(
        missingContextAndHistorySnapshot,
        '2026-04-19T10:15:00.000Z',
      );

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
      missingContextAndHistorySnapshot.summary.id,
      'tag-missing-context',
      'tpl-pressure-as-found',
    );

    expect(shell).toMatchObject({
      guidance: {
        riskState: 'flagged',
        submitReadiness: 'blocked',
        riskItems: expect.arrayContaining([
          expect.objectContaining({
            id: 'missing-context',
            reasonType: 'missing-context',
          }),
          expect.objectContaining({
            id: 'history-unavailable',
            reasonType: 'missing-history',
          }),
          expect.objectContaining({
            id: 'expected-evidence:supporting-photo',
            reasonType: 'missing-expected-evidence',
          }),
          expect.objectContaining({
            id: 'minimum-evidence:readings',
            reasonType: 'missing-minimum-evidence',
          }),
        ]),
        submitBlockingHooks: expect.arrayContaining([
          'Minimum evidence missing: readings.',
          'Minimum evidence missing: observations.',
          'Justification required: Missing context.',
          'Justification required: History is unavailable.',
        ]),
      },
    });

    await runtime.database.closeAsync?.();
  });

  it('keeps observation minimum evidence missing after structured readings are saved without notes', async () => {
    const tempDirectory = mkdtempSync(join(tmpdir(), 'tagwise-execution-risk-observations-missing-'));
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

    expect(calculatedShell.guidance.riskItems).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'minimum-evidence:observations',
          reasonType: 'missing-minimum-evidence',
          severity: 'submit-block',
        }),
      ]),
    );
    expect(calculatedShell.guidance.riskItems.map((item) => item.id)).not.toContain(
      'minimum-evidence:readings',
    );
    expect(calculatedShell.guidance.submitBlockingHooks).toEqual(
      expect.arrayContaining(['Minimum evidence missing: observations.']),
    );

    await runtime.database.closeAsync?.();
  });

  it('marks observation minimum evidence satisfied once notes are entered', async () => {
    const tempDirectory = mkdtempSync(join(tmpdir(), 'tagwise-execution-risk-observations-satisfied-'));
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
    const shellWithNotes = service.updateObservationNotes(
      calculatedShell,
      'Field observations captured locally after the reading set was saved.',
    );

    expect(shellWithNotes.guidance.riskItems.map((item) => item.id)).not.toContain(
      'minimum-evidence:observations',
    );
    expect(shellWithNotes.guidance.riskItems.map((item) => item.id)).not.toContain(
      'minimum-evidence:readings',
    );
    expect(shellWithNotes.guidance.submitBlockingHooks).toEqual([
      'Justification required: Expected evidence missing: supporting photo.',
    ]);

    await runtime.database.closeAsync?.();
  });

  it('treats missing expected evidence as a warning once the required justification is saved and restored', async () => {
    const tempDirectory = mkdtempSync(join(tmpdir(), 'tagwise-execution-risk-justification-'));
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

    const initialShell = await firstService.loadShell(
      session,
      baseSnapshot.summary.id,
      'tag-001',
      'tpl-pressure-as-found',
    );

    const shellWithNotes = firstService.updateObservationNotes(
      initialShell!,
      'Recorded the field observation locally so note evidence is present.',
    );
    const shellWithCalculation = await firstService.saveCalculation(session, shellWithNotes, {
      expectedValue: '5',
      observedValue: '5.02',
    });

    expect(shellWithCalculation.guidance).toMatchObject({
      riskState: 'flagged',
      submitReadiness: 'blocked',
      riskItems: expect.arrayContaining([
        expect.objectContaining({
          id: 'expected-evidence:supporting-photo',
          title: 'Expected evidence missing: supporting photo',
          severity: 'warning',
        }),
      ]),
      submitBlockingHooks: [
        'Justification required: Expected evidence missing: supporting photo.',
      ],
    });

    const justifiedShell = firstService.updateRiskJustification(
      shellWithCalculation,
      'expected-evidence:supporting-photo',
      'Photo capture was not possible because the area was inaccessible during the check.',
    );

    expect(justifiedShell.guidance).toMatchObject({
      riskState: 'flagged',
      submitReadiness: 'ready',
      submitBlockingHooks: [],
      riskItems: expect.arrayContaining([
        expect.objectContaining({
          id: 'expected-evidence:supporting-photo',
          justificationText:
            'Photo capture was not possible because the area was inaccessible during the check.',
        }),
      ]),
    });

    const savedShell = await firstService.saveGuidanceEvidence(session, justifiedShell);
    const savedEvidence = await firstRuntime.repositories.userPartitions
      .forUser(session.userId)
      .executionEvidence.getEvidenceForStep(
        baseSnapshot.summary.id,
        'tag-001',
        'tpl-pressure-as-found',
        '2026-04-v1',
        'guidance',
      );

    expect(savedEvidence).toMatchObject({
      riskJustifications: [
        {
          riskItemId: 'expected-evidence:supporting-photo',
          reasonType: 'missing-expected-evidence',
          justificationText:
            'Photo capture was not possible because the area was inaccessible during the check.',
        },
      ],
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
        now: () => new Date('2026-04-19T11:15:00.000Z'),
      }),
      now: () => new Date('2026-04-19T11:15:00.000Z'),
    });

    const reloadedShell = await secondService.loadShell(
      session,
      baseSnapshot.summary.id,
      'tag-001',
      'tpl-pressure-as-found',
    );

    expect(reloadedShell).toMatchObject({
      guidance: {
        riskState: 'flagged',
        submitReadiness: 'ready',
        submitBlockingHooks: [],
        riskItems: expect.arrayContaining([
          expect.objectContaining({
            id: 'expected-evidence:supporting-photo',
            justificationText:
              'Photo capture was not possible because the area was inaccessible during the check.',
          }),
        ]),
      },
    });

    await secondRuntime.database.closeAsync?.();
  });

  it('does not auto-satisfy unmapped evidence labels from saved calculation evidence alone', async () => {
    const tempDirectory = mkdtempSync(join(tmpdir(), 'tagwise-execution-risk-unmapped-evidence-'));
    createdDirectories.push(tempDirectory);

    const runtime = await bootstrapLocalDatabase(
      () => Promise.resolve(createNodeSqliteDatabase(join(tempDirectory, 'tagwise.db'))),
      () => Promise.resolve(createNodeAppSandboxBoundary(join(tempDirectory, 'sandbox'))),
    );

    await runtime.repositories.userPartitions
      .forUser(session.userId)
      .workPackages.saveDownloadedSnapshot(unmappedEvidenceSnapshot, '2026-04-19T10:15:00.000Z');

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
      unmappedEvidenceSnapshot.summary.id,
      'tag-unmapped-evidence',
      'tpl-pressure-unmapped-evidence',
    );

    const calculatedShell = await service.saveCalculation(session, shell!, {
      expectedValue: '5',
      observedValue: '5.02',
    });

    expect(calculatedShell.guidance.riskItems).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'minimum-evidence:field-sketch',
          reasonType: 'missing-minimum-evidence',
          severity: 'submit-block',
        }),
      ]),
    );
    expect(calculatedShell.guidance.submitBlockingHooks).toEqual(
      expect.arrayContaining(['Minimum evidence missing: field sketch.']),
    );

    await runtime.database.closeAsync?.();
  });

  it('preserves unsaved calculation inputs when guidance evidence is saved', async () => {
    const tempDirectory = mkdtempSync(join(tmpdir(), 'tagwise-execution-evidence-dirty-calc-'));
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

    const dirtyCalculationShell = {
      ...service.updateObservationNotes(
        service.updateChecklistOutcome(shell!, 'pressure-path-check', 'completed'),
        'Saved notes should not wipe the entered checkpoint.',
      ),
      calculation: {
        ...shell!.calculation!,
        rawInputs: {
          expectedValue: '6',
          observedValue: '6.1',
        },
      },
    };

    const savedShell = await service.saveGuidanceEvidence(
      session,
      dirtyCalculationShell,
    );

    expect(savedShell).toMatchObject({
      calculation: {
        rawInputs: {
          expectedValue: '6',
          observedValue: '6.1',
        },
        result: null,
      },
      evidence: {
        observationNotes: 'Saved notes should not wipe the entered checkpoint.',
      },
    });
    expect(savedShell.guidance.checklistItems).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'pressure-path-check',
          outcome: 'completed',
        }),
      ]),
    );

    await runtime.database.closeAsync?.();
  });

  it('captures a local photo attachment into the draft report and restores its preview after reopen', async () => {
    const tempDirectory = mkdtempSync(join(tmpdir(), 'tagwise-photo-evidence-'));
    createdDirectories.push(tempDirectory);

    const databasePath = join(tempDirectory, 'tagwise.db');
    const sandboxPath = join(tempDirectory, 'sandbox');
    const sourcePhotoPath = join(tempDirectory, 'captured-photo.jpg');
    const draftReportId = `tag-report:${baseSnapshot.summary.id}:tag-001`;
    writeFileSync(sourcePhotoPath, 'fake-jpeg-binary');

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

    const initialShell = await firstService.loadShell(
      session,
      baseSnapshot.summary.id,
      'tag-001',
      'tpl-pressure-as-found',
    );
    const guidanceShell = await firstService.selectStep(session, initialShell!, 'guidance');
    const attachedShell = await firstService.attachPhotoEvidence(session, guidanceShell, {
      source: 'camera',
      uri: sourcePhotoPath,
      fileName: 'captured-photo.jpg',
      mimeType: 'image/jpeg',
      width: 1024,
      height: 768,
      fileSize: 2048,
    });

    expect(attachedShell.evidence).toMatchObject({
      draftReportId,
      photoAttachments: [
        expect.objectContaining({
          executionStepId: 'guidance',
          fileName: expect.stringContaining('.jpg'),
          mimeType: 'image/jpeg',
          source: 'camera',
          width: 1024,
          height: 768,
          fileSize: 2048,
        }),
      ],
    });
    expect(attachedShell.steps.find((step) => step.id === 'guidance')?.fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: 'Photo attachments',
          value: '1 photo attachment(s) linked to the draft report',
        }),
      ]),
    );

    const firstStore = firstRuntime.repositories.userPartitions.forUser(session.userId);
    const savedMetadata = await firstStore.evidenceMetadata.listEvidenceByBusinessObject({
      businessObjectType: 'per-tag-report',
      businessObjectId: draftReportId,
    });
    expect(savedMetadata).toHaveLength(1);
    expect(JSON.parse(savedMetadata[0]!.payloadJson)).toMatchObject({
      kind: 'photo',
      workPackageId: baseSnapshot.summary.id,
      tagId: 'tag-001',
      templateId: 'tpl-pressure-as-found',
      templateVersion: '2026-04-v1',
      draftReportId,
      executionStepId: 'guidance',
      source: 'camera',
    });
    expect(readFileSync(attachedShell.evidence.photoAttachments[0]!.previewUri, 'utf-8')).toBe(
      'fake-jpeg-binary',
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
      evidence: {
        draftReportId,
        photoAttachments: [
          expect.objectContaining({
            mimeType: 'image/jpeg',
            source: 'camera',
          }),
        ],
      },
    });

    await secondRuntime.database.closeAsync?.();
  });

  it('removes a draft photo attachment from metadata and local file storage consistently', async () => {
    const tempDirectory = mkdtempSync(join(tmpdir(), 'tagwise-photo-remove-'));
    createdDirectories.push(tempDirectory);

    const runtime = await bootstrapLocalDatabase(
      () => Promise.resolve(createNodeSqliteDatabase(join(tempDirectory, 'tagwise.db'))),
      () => Promise.resolve(createNodeAppSandboxBoundary(join(tempDirectory, 'sandbox'))),
    );

    const sourcePhotoPath = join(tempDirectory, 'selected-photo.jpg');
    writeFileSync(sourcePhotoPath, 'selected-fake-jpeg');

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

    const initialShell = await service.loadShell(
      session,
      baseSnapshot.summary.id,
      'tag-001',
      'tpl-pressure-as-found',
    );
    const attachedShell = await service.attachPhotoEvidence(
      session,
      await service.selectStep(session, initialShell!, 'guidance'),
      {
        source: 'library',
        uri: sourcePhotoPath,
        fileName: 'selected-photo.jpg',
        mimeType: 'image/jpeg',
        width: 800,
        height: 600,
        fileSize: 1024,
      },
    );

    const [photoAttachment] = attachedShell.evidence.photoAttachments;
    expect(photoAttachment).toBeDefined();
    expect(existsSync(photoAttachment!.previewUri)).toBe(true);

    const removedShell = await service.removePhotoEvidence(
      session,
      attachedShell,
      photoAttachment!.evidenceId,
    );

    expect(removedShell.evidence.photoAttachments).toEqual([]);
    expect(existsSync(photoAttachment!.previewUri)).toBe(false);
    await expect(
      runtime.repositories.userPartitions.forUser(session.userId).evidenceMetadata.listEvidenceByBusinessObject({
        businessObjectType: 'per-tag-report',
        businessObjectId: `tag-report:${baseSnapshot.summary.id}:tag-001`,
      }),
    ).resolves.toEqual([]);

    await runtime.database.closeAsync?.();
  });

  it('preserves dirty calculation and guidance state when a photo attachment is saved', async () => {
    const tempDirectory = mkdtempSync(join(tmpdir(), 'tagwise-photo-preserve-state-'));
    createdDirectories.push(tempDirectory);

    const runtime = await bootstrapLocalDatabase(
      () => Promise.resolve(createNodeSqliteDatabase(join(tempDirectory, 'tagwise.db'))),
      () => Promise.resolve(createNodeAppSandboxBoundary(join(tempDirectory, 'sandbox'))),
    );
    const sourcePhotoPath = join(tempDirectory, 'state-photo.jpg');
    writeFileSync(sourcePhotoPath, 'state-fake-jpeg');

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
    const dirtyShell = {
      ...service.updateObservationNotes(
        service.updateChecklistOutcome(shell!, 'pressure-path-check', 'completed'),
        'Keep this note while the photo is linked.',
      ),
      calculation: {
        ...shell!.calculation!,
        rawInputs: {
          expectedValue: '7',
          observedValue: '7.08',
        },
      },
    };

    const attachedShell = await service.attachPhotoEvidence(
      session,
      await service.selectStep(session, dirtyShell, 'guidance'),
      {
        source: 'camera',
        uri: sourcePhotoPath,
        fileName: 'state-photo.jpg',
        mimeType: 'image/jpeg',
        width: 640,
        height: 480,
        fileSize: 900,
      },
    );

    expect(attachedShell).toMatchObject({
      calculation: {
        rawInputs: {
          expectedValue: '7',
          observedValue: '7.08',
        },
      },
      evidence: {
        observationNotes: 'Keep this note while the photo is linked.',
      },
      guidance: {
        checklistItems: expect.arrayContaining([
          expect.objectContaining({
            id: 'pressure-path-check',
            outcome: 'completed',
          }),
        ]),
      },
    });

    await runtime.database.closeAsync?.();
  });

  it('creates visible non-blocking risk hooks for skipped or incomplete checklist items and preserves them after calculation save', async () => {
    const tempDirectory = mkdtempSync(join(tmpdir(), 'tagwise-execution-guidance-risk-'));
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

    const riskFlaggedShell = service.updateChecklistOutcome(
      service.updateChecklistOutcome(shell!, 'pressure-path-check', 'skipped'),
      'pressure-reference-check',
      'incomplete',
    );

    expect(riskFlaggedShell.guidance).toMatchObject({
      riskState: 'flagged',
      submitReadiness: 'blocked',
      checklistItems: [
        expect.objectContaining({
          id: 'pressure-path-check',
          outcome: 'skipped',
        }),
        expect.objectContaining({
          id: 'pressure-reference-check',
          outcome: 'incomplete',
        }),
      ],
      riskHooks: expect.arrayContaining([
        expect.stringContaining('Checklist skipped: Confirm impulse path'),
        expect.stringContaining('Checklist incomplete: Confirm the applied reference'),
      ]),
    });
    expect(riskFlaggedShell.steps.find((step) => step.id === 'guidance')?.fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: 'Guidance risk state',
          value: 'Flagged',
          state: 'missing',
        }),
        expect.objectContaining({
          label: 'Risk hooks',
          value: expect.stringContaining('Checklist skipped: Confirm impulse path'),
          state: 'missing',
        }),
        expect.objectContaining({
          label: 'Submit readiness',
          value: 'Blocked by rule hooks',
          state: 'missing',
        }),
      ]),
    );

    const calculatedShell = await service.saveCalculation(session, riskFlaggedShell, {
      expectedValue: '5',
      observedValue: '5.02',
    });

    expect(calculatedShell.guidance).toMatchObject({
      riskState: 'flagged',
      checklistItems: [
        expect.objectContaining({
          id: 'pressure-path-check',
          outcome: 'skipped',
        }),
        expect.objectContaining({
          id: 'pressure-reference-check',
          outcome: 'incomplete',
        }),
      ],
    });

    await runtime.database.closeAsync?.();
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

  it('assembles a ready per-tag report draft from captured local execution data', async () => {
    const tempDirectory = mkdtempSync(join(tmpdir(), 'tagwise-report-draft-ready-'));
    createdDirectories.push(tempDirectory);

    const runtime = await bootstrapLocalDatabase(
      () => Promise.resolve(createNodeSqliteDatabase(join(tempDirectory, 'tagwise.db'))),
      () => Promise.resolve(createNodeAppSandboxBoundary(join(tempDirectory, 'sandbox'))),
    );
    const photoSourcePath = join(tempDirectory, 'ready-report-photo.jpg');
    writeFileSync(photoSourcePath, 'ready-report-photo-binary');

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

    const loadedShell = await service.loadShell(
      session,
      baseSnapshot.summary.id,
      'tag-001',
      'tpl-pressure-as-found',
    );
    const calculatedShell = await service.saveCalculation(session, loadedShell!, {
      expectedValue: '5',
      observedValue: '5.02',
    });
    const guidanceReadyShell = service.updateChecklistOutcome(
      service.updateChecklistOutcome(
        service.updateObservationNotes(
          await service.selectStep(session, calculatedShell, 'guidance'),
          'Impulse path verified locally before finalizing the as-found checkpoint.',
        ),
        'pressure-path-check',
        'completed',
      ),
      'pressure-reference-check',
      'completed',
    );
    const savedGuidanceShell = await service.saveGuidanceEvidence(session, guidanceReadyShell);
    const reportReadyShell = await service.attachPhotoEvidence(session, savedGuidanceShell, {
      source: 'camera',
      uri: photoSourcePath,
      fileName: 'ready-report-photo.jpg',
      mimeType: 'image/jpeg',
      width: 1200,
      height: 900,
      fileSize: 4096,
    });

    expect(reportReadyShell.report).toMatchObject({
      reportId: `tag-report:${baseSnapshot.summary.id}:tag-001`,
      lifecycleState: 'Ready to Submit',
      technicianName: session.displayName,
      technicianEmail: session.email,
      executionSummary: expect.stringContaining('Current result: Pass.'),
      checklistOutcomes: expect.arrayContaining([
        expect.objectContaining({
          id: 'pressure-path-check',
          outcome: 'completed',
        }),
        expect.objectContaining({
          id: 'pressure-reference-check',
          outcome: 'completed',
        }),
      ]),
      evidenceReferences: expect.arrayContaining([
        expect.objectContaining({
          label: 'readings',
          requirementLevel: 'minimum',
          evidenceKind: 'structured-readings',
          satisfied: true,
        }),
        expect.objectContaining({
          label: 'observations',
          requirementLevel: 'minimum',
          evidenceKind: 'observation-notes',
          satisfied: true,
        }),
        expect.objectContaining({
          label: 'supporting photo',
          requirementLevel: 'expected',
          evidenceKind: 'photo-evidence',
          satisfied: true,
        }),
      ]),
      riskFlags: [],
    });
    expect(reportReadyShell.steps.find((step) => step.id === 'report')?.fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: 'Report lifecycle',
          value: 'Ready to Submit',
          state: 'available',
        }),
        expect.objectContaining({
          label: 'Minimum evidence coverage',
          value: '2 / 2 satisfied',
          state: 'available',
        }),
        expect.objectContaining({
          label: 'Checklist outcomes',
          value: 'Pending 0; Completed 2; Incomplete 0; Skipped 0',
          state: 'available',
        }),
        expect.objectContaining({
          label: 'Expected evidence coverage',
          value: '1 / 1 satisfied',
          state: 'available',
        }),
      ]),
    );

    await runtime.database.closeAsync?.();
  });

  it('includes checklist outcomes in the report draft projection, not only through risk flags', async () => {
    const tempDirectory = mkdtempSync(join(tmpdir(), 'tagwise-report-draft-checklist-'));
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

    const loadedShell = await service.loadShell(
      session,
      baseSnapshot.summary.id,
      'tag-001',
      'tpl-pressure-as-found',
    );
    const shellWithChecklistOutcomes = service.updateChecklistOutcome(
      service.updateChecklistOutcome(
        await service.selectStep(session, loadedShell!, 'guidance'),
        'pressure-path-check',
        'completed',
      ),
      'pressure-reference-check',
      'skipped',
    );
    const savedShell = await service.saveGuidanceEvidence(session, shellWithChecklistOutcomes);

    expect(savedShell.report.checklistOutcomes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'pressure-path-check',
          prompt:
            'Confirm impulse path and vent condition before treating deviation as transmitter drift.',
          outcome: 'completed',
        }),
        expect.objectContaining({
          id: 'pressure-reference-check',
          prompt: 'Confirm the applied reference is stable before saving the checkpoint.',
          outcome: 'skipped',
        }),
      ]),
    );
    expect(savedShell.steps.find((step) => step.id === 'report')?.fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: 'Checklist outcomes',
          value: 'Pending 0; Completed 1; Incomplete 0; Skipped 1',
          state: 'missing',
        }),
      ]),
    );

    await runtime.database.closeAsync?.();
  });

  it('persists report review notes locally and restores them after later evidence updates and reopen', async () => {
    const tempDirectory = mkdtempSync(join(tmpdir(), 'tagwise-report-draft-reopen-'));
    createdDirectories.push(tempDirectory);

    const databasePath = join(tempDirectory, 'tagwise.db');
    const sandboxPath = join(tempDirectory, 'sandbox');
    const photoSourcePath = join(tempDirectory, 'saved-report-photo.jpg');
    writeFileSync(photoSourcePath, 'saved-report-photo-binary');

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

    const loadedShell = await firstService.loadShell(
      session,
      baseSnapshot.summary.id,
      'tag-001',
      'tpl-pressure-as-found',
    );
    const calculatedShell = await firstService.saveCalculation(session, loadedShell!, {
      expectedValue: '5',
      observedValue: '5.02',
    });
    const preparedGuidanceShell = serviceUpdateChecklistToCompleted(
      firstService,
      await firstService.selectStep(session, calculatedShell, 'guidance'),
      'Initial local observation note before report review.',
    );
    const savedGuidanceShell = await firstService.saveGuidanceEvidence(
      session,
      preparedGuidanceShell,
    );
    const attachedShell = await firstService.attachPhotoEvidence(session, savedGuidanceShell, {
      source: 'library',
      uri: photoSourcePath,
      fileName: 'saved-report-photo.jpg',
      mimeType: 'image/jpeg',
      width: 1024,
      height: 768,
      fileSize: 2048,
    });
    const reportReviewedShell = await firstService.saveReportDraft(
      session,
      firstService.updateReportReviewNotes(
        attachedShell,
        'Final draft note: verify the manifold condition in the supervisor review summary.',
      ),
    );

    const updatedGuidanceShell = await firstService.saveGuidanceEvidence(
      session,
      firstService.updateObservationNotes(
        reportReviewedShell,
        'Updated local observation note after one last field recheck.',
      ),
    );

    const draftRecord = await firstRuntime.repositories.userPartitions.forUser(session.userId).drafts.getDraft({
      businessObjectType: 'per-tag-report',
      businessObjectId: `tag-report:${baseSnapshot.summary.id}:tag-001`,
    });
    expect(JSON.parse(draftRecord!.payloadJson)).toMatchObject({
      reportId: `tag-report:${baseSnapshot.summary.id}:tag-001`,
      reviewNotes:
        'Final draft note: verify the manifold condition in the supervisor review summary.',
      state: 'technician-owned-draft',
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
        now: () => new Date('2026-04-19T11:20:00.000Z'),
      }),
      now: () => new Date('2026-04-19T11:20:00.000Z'),
    });

    const reopenedShell = await secondService.loadShell(
      session,
      baseSnapshot.summary.id,
      'tag-001',
      'tpl-pressure-as-found',
    );

    expect(updatedGuidanceShell.report.savedAt).not.toBeNull();
    expect(reopenedShell).toMatchObject({
      evidence: {
        observationNotes: 'Updated local observation note after one last field recheck.',
      },
      report: {
        reviewNotes:
          'Final draft note: verify the manifold condition in the supervisor review summary.',
        savedAt: expect.any(String),
        lifecycleState: 'Ready to Submit',
      },
    });
    expect(reopenedShell?.steps.find((step) => step.id === 'report')?.fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: 'Final notes / corrections',
          value:
            'Final draft note: verify the manifold condition in the supervisor review summary.',
        }),
      ]),
    );

    await secondRuntime.database.closeAsync?.();
  });

  it('keeps the report draft in progress and carries visible risk justifications into the report projection', async () => {
    const tempDirectory = mkdtempSync(join(tmpdir(), 'tagwise-report-draft-risk-'));
    createdDirectories.push(tempDirectory);

    const runtime = await bootstrapLocalDatabase(
      () => Promise.resolve(createNodeSqliteDatabase(join(tempDirectory, 'tagwise.db'))),
      () => Promise.resolve(createNodeAppSandboxBoundary(join(tempDirectory, 'sandbox'))),
    );

    await runtime.repositories.userPartitions
      .forUser(session.userId)
      .workPackages.saveDownloadedSnapshot(missingContextAndHistorySnapshot, '2026-04-19T10:15:00.000Z');

    const service = new SharedExecutionShellService({
      userPartitions: runtime.repositories.userPartitions,
      tagContextService: new LocalTagContextService({
        userPartitions: runtime.repositories.userPartitions,
        now: () => new Date('2026-04-19T11:00:00.000Z'),
      }),
      now: () => new Date('2026-04-19T11:05:00.000Z'),
    });

    const loadedShell = await service.loadShell(
      session,
      missingContextAndHistorySnapshot.summary.id,
      'tag-missing-context',
      'tpl-pressure-as-found',
    );
    const shellWithJustification = service.updateRiskJustification(
      loadedShell!,
      'history-unavailable',
      'History was not packaged for this intervention, so the local draft carries a technician note instead.',
    );
    const savedShell = await service.saveGuidanceEvidence(session, shellWithJustification);

    expect(savedShell.report).toMatchObject({
      lifecycleState: 'In Progress',
      riskFlags: expect.arrayContaining([
        expect.objectContaining({
          id: 'history-unavailable',
          justificationText:
            'History was not packaged for this intervention, so the local draft carries a technician note instead.',
        }),
      ]),
    });
    expect(savedShell.steps.find((step) => step.id === 'report')?.fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: 'Report lifecycle',
          value: 'In Progress',
          state: 'missing',
        }),
        expect.objectContaining({
          label: 'Risk flags',
          value: expect.stringContaining('visible risk flag'),
          state: 'missing',
        }),
      ]),
    );

    await runtime.database.closeAsync?.();
  });

  it('rolls back the local submit transition when queue creation fails after draft persistence begins', async () => {
    const tempDirectory = mkdtempSync(join(tmpdir(), 'tagwise-submit-report-rollback-'));
    createdDirectories.push(tempDirectory);

    const runtime = await bootstrapLocalDatabase(
      () => Promise.resolve(createNodeSqliteDatabase(join(tempDirectory, 'tagwise.db'))),
      () => Promise.resolve(createNodeAppSandboxBoundary(join(tempDirectory, 'sandbox'))),
    );
    const photoSourcePath = join(tempDirectory, 'rollback-report-photo.jpg');
    writeFileSync(photoSourcePath, 'rollback-report-photo-binary');

    await runtime.repositories.userPartitions
      .forUser(session.userId)
      .workPackages.saveDownloadedSnapshot(baseSnapshot, '2026-04-19T10:15:00.000Z');

    const baseStore = runtime.repositories.userPartitions.forUser(session.userId);
    let enqueueAttemptCount = 0;
    const failingStore = {
      ...baseStore,
      queueItems: {
        ownerUserId: baseStore.queueItems.ownerUserId,
        getQueueItemById: (queueItemId: string) =>
          baseStore.queueItems.getQueueItemById(queueItemId),
        listQueueItemsByBusinessObject: (input: {
          businessObjectType: string;
          businessObjectId: string;
        }) => baseStore.queueItems.listQueueItemsByBusinessObject(input),
        enqueue: vi.fn(async (input) => {
          enqueueAttemptCount += 1;

          if (enqueueAttemptCount === 3) {
            throw new Error('Simulated queue failure while enqueuing evidence binary.');
          }

          return baseStore.queueItems.enqueue(input);
        }),
      },
    };
    const service = new SharedExecutionShellService({
      userPartitions: {
        forUser(ownerUserId: string) {
          expect(ownerUserId).toBe(session.userId);
          return failingStore;
        },
      } as unknown as typeof runtime.repositories.userPartitions,
      localWorkState: runtime.repositories.localWorkState,
      tagContextService: new LocalTagContextService({
        userPartitions: runtime.repositories.userPartitions,
        now: () => new Date('2026-04-19T11:00:00.000Z'),
      }),
      now: () => new Date('2026-04-19T11:05:00.000Z'),
    });
    const verificationService = new SharedExecutionShellService({
      userPartitions: runtime.repositories.userPartitions,
      localWorkState: runtime.repositories.localWorkState,
      tagContextService: new LocalTagContextService({
        userPartitions: runtime.repositories.userPartitions,
        now: () => new Date('2026-04-19T11:00:00.000Z'),
      }),
      now: () => new Date('2026-04-19T11:05:00.000Z'),
    });

    const readyShell = await buildReadyForSubmissionShell({
      service: verificationService,
      session,
      workPackageId: baseSnapshot.summary.id,
      tagId: 'tag-001',
      templateId: 'tpl-pressure-as-found',
      observationNotes: 'Ready draft that will hit a queue failure during local submit.',
      photoInput: {
        source: 'camera',
        uri: photoSourcePath,
        fileName: 'rollback-report-photo.jpg',
        mimeType: 'image/jpeg',
        width: 1024,
        height: 768,
        fileSize: 4096,
      },
    });

    await expect(service.submitReport(session, readyShell)).rejects.toThrow(
      'Simulated queue failure while enqueuing evidence binary.',
    );

    const reopenedShell = await verificationService.loadShell(
      session,
      baseSnapshot.summary.id,
      'tag-001',
      'tpl-pressure-as-found',
    );

    expect(reopenedShell).toMatchObject({
      evidence: {
        draftReportState: 'technician-owned-draft',
      },
      report: {
        reportId: `tag-report:${baseSnapshot.summary.id}:tag-001`,
        state: 'technician-owned-draft',
        syncState: 'local-only',
        submittedAt: null,
      },
    });
    expect(
      await runtime.repositories.userPartitions.forUser(session.userId).queueItems.listQueueItemsByBusinessObject({
        businessObjectType: 'per-tag-report',
        businessObjectId: `tag-report:${baseSnapshot.summary.id}:tag-001`,
      }),
    ).toHaveLength(0);
    expect(await runtime.repositories.localWorkState.getUnsyncedWorkCount()).toBe(0);

    await runtime.database.closeAsync?.();
  });

  it('submits a ready per-tag report locally, queues the report and pending photo evidence, and locks further draft edits', async () => {
    const tempDirectory = mkdtempSync(join(tmpdir(), 'tagwise-submit-report-ready-'));
    createdDirectories.push(tempDirectory);

    const runtime = await bootstrapLocalDatabase(
      () => Promise.resolve(createNodeSqliteDatabase(join(tempDirectory, 'tagwise.db'))),
      () => Promise.resolve(createNodeAppSandboxBoundary(join(tempDirectory, 'sandbox'))),
    );
    const photoSourcePath = join(tempDirectory, 'queued-report-photo.jpg');
    writeFileSync(photoSourcePath, 'queued-report-photo-binary');

    await runtime.repositories.userPartitions
      .forUser(session.userId)
      .workPackages.saveDownloadedSnapshot(baseSnapshot, '2026-04-19T10:15:00.000Z');

    const service = new SharedExecutionShellService({
      userPartitions: runtime.repositories.userPartitions,
      localWorkState: runtime.repositories.localWorkState,
      tagContextService: new LocalTagContextService({
        userPartitions: runtime.repositories.userPartitions,
        now: () => new Date('2026-04-19T11:00:00.000Z'),
      }),
      now: () => new Date('2026-04-19T11:05:00.000Z'),
    });

    const readyShell = await buildReadyForSubmissionShell({
      service,
      session,
      workPackageId: baseSnapshot.summary.id,
      tagId: 'tag-001',
      templateId: 'tpl-pressure-as-found',
      observationNotes: 'Observation notes captured before local submission.',
      photoInput: {
        source: 'camera',
        uri: photoSourcePath,
        fileName: 'queued-report-photo.jpg',
        mimeType: 'image/jpeg',
        width: 1280,
        height: 960,
        fileSize: 8192,
      },
    });

    const submittedShell = await service.submitReport(session, readyShell);

    expect(submittedShell.report).toMatchObject({
      reportId: `tag-report:${baseSnapshot.summary.id}:tag-001`,
      state: 'submitted-pending-sync',
      lifecycleState: 'Submitted - Pending Sync',
      syncState: 'queued',
      submittedAt: expect.any(String),
    });
    expect(submittedShell.evidence.draftReportState).toBe('submitted-pending-sync');
    expect(submittedShell.steps.find((step) => step.id === 'report')?.fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: 'Report lifecycle',
          value: 'Submitted - Pending Sync',
          state: 'available',
        }),
        expect.objectContaining({
          label: 'Sync state',
          value: 'Queued',
          state: 'missing',
        }),
        expect.objectContaining({
          label: 'Submitted locally',
          state: 'available',
        }),
      ]),
    );

    const queueItems = await runtime.repositories.userPartitions
      .forUser(session.userId)
      .queueItems.listQueueItemsByBusinessObject({
        businessObjectType: 'per-tag-report',
        businessObjectId: submittedShell.report.reportId,
      });
    expect(queueItems).toHaveLength(3);

    const reportQueueItem = queueItems.find((item) => item.itemKind === 'submit-report');
    const evidenceMetadataQueueItem = queueItems.find(
      (item) => item.itemKind === 'upload-evidence-metadata',
    );
    const evidenceBinaryQueueItem = queueItems.find(
      (item) => item.itemKind === 'upload-evidence-binary',
    );

    expect(reportQueueItem).toBeDefined();
    expect(evidenceMetadataQueueItem).toBeDefined();
    expect(evidenceBinaryQueueItem).toBeDefined();
    expect(JSON.parse(reportQueueItem!.payloadJson)).toMatchObject({
      queueItemSchemaVersion: '2026-04-v1',
      itemType: 'submit-report',
      reportId: submittedShell.report.reportId,
      workPackageId: baseSnapshot.summary.id,
      tagId: 'tag-001',
      templateId: 'tpl-pressure-as-found',
      templateVersion: baseSnapshot.contractVersion,
      localObjectReference: {
        businessObjectType: 'per-tag-report',
        businessObjectId: submittedShell.report.reportId,
      },
      dependencyStatus: 'ready',
      retryCount: 0,
    });
    expect(JSON.parse(evidenceMetadataQueueItem!.payloadJson)).toMatchObject({
      queueItemSchemaVersion: '2026-04-v1',
      itemType: 'upload-evidence-metadata',
      reportId: submittedShell.report.reportId,
      workPackageId: baseSnapshot.summary.id,
      tagId: 'tag-001',
      templateId: 'tpl-pressure-as-found',
      templateVersion: baseSnapshot.contractVersion,
      evidenceId: submittedShell.evidence.photoAttachments[0]?.evidenceId,
      fileName: submittedShell.evidence.photoAttachments[0]?.fileName,
      mimeType: 'image/jpeg',
      fileSizeBytes: 8192,
      executionStepId: 'guidance',
      source: 'camera',
      localObjectReference: {
        businessObjectType: 'per-tag-report',
        businessObjectId: submittedShell.report.reportId,
      },
      dependencyStatus: 'ready',
      retryCount: 0,
    });
    expect(JSON.parse(evidenceBinaryQueueItem!.payloadJson)).toMatchObject({
      queueItemSchemaVersion: '2026-04-v1',
      itemType: 'upload-evidence-binary',
      reportId: submittedShell.report.reportId,
      evidenceId: submittedShell.evidence.photoAttachments[0]?.evidenceId,
      mediaRelativePath: submittedShell.evidence.photoAttachments[0]?.mediaRelativePath,
      mimeType: 'image/jpeg',
      executionStepId: 'guidance',
      localObjectReference: {
        businessObjectType: 'per-tag-report',
        businessObjectId: submittedShell.report.reportId,
      },
      dependsOnQueueItemId: evidenceMetadataQueueItem!.queueItemId,
      dependencyStatus: 'waiting-on-evidence-metadata',
      retryCount: 0,
    });
    expect(await runtime.repositories.localWorkState.getUnsyncedWorkCount()).toBe(1);

    expect(
      service.updateObservationNotes(submittedShell, 'Observation edits should stay locked.'),
    ).toBe(submittedShell);
    expect(
      service.updateChecklistOutcome(submittedShell, 'pressure-path-check', 'skipped'),
    ).toBe(submittedShell);
    expect(
      service.updateReportReviewNotes(submittedShell, 'Final notes should stay locked after submit.'),
    ).toBe(submittedShell);
    await expect(
      service.saveCalculation(session, submittedShell, {
        expectedValue: '6',
        observedValue: '6.20',
      }),
    ).resolves.toBe(submittedShell);

    await runtime.database.closeAsync?.();
  });

  it('restores submitted pending sync report state and queue records after reopen', async () => {
    const tempDirectory = mkdtempSync(join(tmpdir(), 'tagwise-submit-report-reopen-'));
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
      localWorkState: firstRuntime.repositories.localWorkState,
      tagContextService: new LocalTagContextService({
        userPartitions: firstRuntime.repositories.userPartitions,
        now: () => new Date('2026-04-19T11:00:00.000Z'),
      }),
      now: () => new Date('2026-04-19T11:05:00.000Z'),
    });

    const readyShell = await buildReadyForSubmissionShell({
      service: firstService,
      session,
      workPackageId: baseSnapshot.summary.id,
      tagId: 'tag-001',
      templateId: 'tpl-pressure-as-found',
      observationNotes: 'Ready for local submission before restart validation.',
      justifyMissingExpectedEvidence: true,
    });

    const submittedShell = await firstService.submitReport(session, readyShell);
    expect(submittedShell.report.submittedAt).not.toBeNull();

    await firstRuntime.database.closeAsync?.();

    const secondRuntime = await bootstrapLocalDatabase(
      () => Promise.resolve(createNodeSqliteDatabase(databasePath)),
      () => Promise.resolve(createNodeAppSandboxBoundary(sandboxPath)),
    );

    const secondService = new SharedExecutionShellService({
      userPartitions: secondRuntime.repositories.userPartitions,
      localWorkState: secondRuntime.repositories.localWorkState,
      tagContextService: new LocalTagContextService({
        userPartitions: secondRuntime.repositories.userPartitions,
        now: () => new Date('2026-04-19T11:20:00.000Z'),
      }),
      now: () => new Date('2026-04-19T11:20:00.000Z'),
    });

    const reopenedShell = await secondService.loadShell(
      session,
      baseSnapshot.summary.id,
      'tag-001',
      'tpl-pressure-as-found',
    );

    expect(reopenedShell).toMatchObject({
      evidence: {
        draftReportState: 'submitted-pending-sync',
      },
      report: {
        reportId: `tag-report:${baseSnapshot.summary.id}:tag-001`,
        state: 'submitted-pending-sync',
        lifecycleState: 'Submitted - Pending Sync',
        syncState: 'queued',
        submittedAt: expect.any(String),
      },
    });
    expect(reopenedShell?.steps.find((step) => step.id === 'report')?.fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: 'Report lifecycle',
          value: 'Submitted - Pending Sync',
        }),
        expect.objectContaining({
          label: 'Sync state',
          value: 'Queued',
        }),
      ]),
    );

    const queueItems = await secondRuntime.repositories.userPartitions
      .forUser(session.userId)
      .queueItems.listQueueItemsByBusinessObject({
        businessObjectType: 'per-tag-report',
        businessObjectId: `tag-report:${baseSnapshot.summary.id}:tag-001`,
      });
    expect(queueItems).toHaveLength(1);
    expect(queueItems[0]).toMatchObject({
      itemKind: 'submit-report',
      businessObjectId: `tag-report:${baseSnapshot.summary.id}:tag-001`,
    });

    await secondRuntime.database.closeAsync?.();
  });

  it('keeps submit idempotent when a stale draft shell is submitted again after success', async () => {
    const tempDirectory = mkdtempSync(join(tmpdir(), 'tagwise-submit-report-duplicate-'));
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
      localWorkState: runtime.repositories.localWorkState,
      tagContextService: new LocalTagContextService({
        userPartitions: runtime.repositories.userPartitions,
        now: () => new Date('2026-04-19T11:00:00.000Z'),
      }),
      now: () => new Date('2026-04-19T11:05:00.000Z'),
    });

    const readyShell = await buildReadyForSubmissionShell({
      service,
      session,
      workPackageId: baseSnapshot.summary.id,
      tagId: 'tag-001',
      templateId: 'tpl-pressure-as-found',
      observationNotes: 'Ready draft for duplicate submit guard coverage.',
      justifyMissingExpectedEvidence: true,
    });

    const firstSubmittedShell = await service.submitReport(session, readyShell);
    const secondSubmittedShell = await service.submitReport(session, readyShell);

    expect(firstSubmittedShell.report).toMatchObject({
      state: 'submitted-pending-sync',
      syncState: 'queued',
      submittedAt: expect.any(String),
    });
    expect(secondSubmittedShell.report).toMatchObject({
      state: 'submitted-pending-sync',
      syncState: 'queued',
      submittedAt: firstSubmittedShell.report.submittedAt,
    });

    const queueItems = await runtime.repositories.userPartitions
      .forUser(session.userId)
      .queueItems.listQueueItemsByBusinessObject({
        businessObjectType: 'per-tag-report',
        businessObjectId: firstSubmittedShell.report.reportId,
      });
    expect(queueItems).toHaveLength(1);
    expect(await runtime.repositories.localWorkState.getUnsyncedWorkCount()).toBe(1);

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
