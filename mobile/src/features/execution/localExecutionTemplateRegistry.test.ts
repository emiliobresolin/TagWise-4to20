import { describe, expect, it } from 'vitest';

import type { AssignedWorkPackageSnapshot } from '../work-packages/model';
import { LocalExecutionTemplateRegistry } from './localExecutionTemplateRegistry';

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

const snapshot: AssignedWorkPackageSnapshot = {
  contractVersion: '2026-04-v1',
  generatedAt: '2026-04-19T10:00:00.000Z',
  summary: {
    id: 'wp-family-pack-001',
    sourceReference: 'seed-cmms-family-pack',
    title: 'Family pack template contract',
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
      id: 'tag-pressure',
      tagCode: 'PT-101',
      shortDescription: 'Pressure transmitter',
      area: 'North Unit',
      parentAssetReference: 'asset-001',
      instrumentFamily: 'pressure transmitter',
      instrumentSubtype: 'smart transmitter',
      measuredVariable: 'pressure',
      signalType: '4-20mA',
      range: { min: 0, max: 10, unit: 'bar' },
      tolerance: '+/-0.25% span',
      criticality: 'high',
      templateIds: [
        'tpl-pressure-as-found',
        'tpl-pressure-as-left',
        'tpl-pressure-loop-range',
      ],
      guidanceReferenceIds: [],
      historySummaryId: 'history-pressure',
    },
    {
      id: 'tag-temperature',
      tagCode: 'TT-205',
      shortDescription: 'Temperature transmitter',
      area: 'North Unit',
      parentAssetReference: 'asset-002',
      instrumentFamily: 'temperature transmitter',
      instrumentSubtype: 'RTD input',
      measuredVariable: 'temperature',
      signalType: '4-20mA',
      range: { min: 0, max: 250, unit: 'C' },
      tolerance: '+/-0.3C',
      criticality: 'medium',
      templateIds: [
        'tpl-temperature-input-simulation',
        'tpl-temperature-calibration-verification',
        'tpl-temperature-range-check',
      ],
      guidanceReferenceIds: [],
      historySummaryId: 'history-temperature',
    },
    {
      id: 'tag-level',
      tagCode: 'LT-410',
      shortDescription: 'Level transmitter',
      area: 'Tank Farm',
      parentAssetReference: 'asset-003',
      instrumentFamily: 'level transmitter',
      instrumentSubtype: 'guided wave radar',
      measuredVariable: 'level',
      signalType: '4-20mA',
      range: { min: 0, max: 8, unit: 'm' },
      tolerance: '+/-0.2% calibrated span',
      criticality: 'high',
      templateIds: [
        'tpl-level-range-check',
        'tpl-level-basic-calibration',
        'tpl-level-output-verification',
      ],
      guidanceReferenceIds: [],
      historySummaryId: 'history-level',
    },
    {
      id: 'tag-loop',
      tagCode: 'AI-330',
      shortDescription: 'Analog process loop',
      area: 'North Unit',
      parentAssetReference: 'asset-004',
      instrumentFamily: 'analog 4-20 mA loop',
      instrumentSubtype: 'isolated analog input loop',
      measuredVariable: 'process value',
      signalType: '4-20mA',
      range: { min: 0, max: 100, unit: '%' },
      tolerance: '+/-1% span',
      criticality: 'high',
      templateIds: [
        'tpl-loop-integrity-check',
        'tpl-loop-signal-validation',
        'tpl-loop-current-vs-process',
      ],
      guidanceReferenceIds: [],
      historySummaryId: 'history-loop',
    },
    {
      id: 'tag-valve',
      tagCode: 'XV-402',
      shortDescription: 'Control valve with positioner',
      area: 'Tank Farm',
      parentAssetReference: 'asset-005',
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
      historySummaryId: 'history-valve',
    },
  ],
  templates: [
    buildTemplate({
      id: 'tpl-pressure-as-found',
      instrumentFamily: 'pressure transmitter',
      testPattern: 'as-found calibration check',
      title: 'Pressure transmitter as-found calibration',
      calculationMode: 'point deviation by span',
      acceptanceStyle: 'within tolerance by point and overall span',
      captureSummary: 'Capture pre-adjustment checkpoints.',
      expectedLabel: 'Expected pressure',
      observedLabel: 'Measured pressure',
      minimumSubmissionEvidence: ['as-found readings'],
      expectedEvidence: ['supporting photo'],
      historyComparisonExpectation: 'compare last approved span error and repeated drift',
    }),
    buildTemplate({
      id: 'tpl-pressure-as-left',
      instrumentFamily: 'pressure transmitter',
      testPattern: 'as-left calibration check',
      title: 'Pressure transmitter as-left calibration',
      calculationMode: 'point deviation by span',
      acceptanceStyle: 'within tolerance by point and overall span',
      captureSummary: 'Capture post-adjustment checkpoints.',
      expectedLabel: 'Expected pressure',
      observedLabel: 'Measured pressure',
      minimumSubmissionEvidence: ['as-left readings'],
      expectedEvidence: ['adjustment note'],
      historyComparisonExpectation: 'compare last approved as-left result',
    }),
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
      id: 'tpl-temperature-input-simulation',
      instrumentFamily: 'temperature transmitter / RTD input',
      testPattern: 'input simulation check',
      title: 'RTD input simulation check',
      calculationMode: 'simulated input vs reported output',
      acceptanceStyle: 'point deviation across expected RTD inputs',
      captureSummary: 'Capture simulated inputs.',
      expectedLabel: 'Simulated input',
      observedLabel: 'Reported output',
      minimumSubmissionEvidence: ['simulated inputs'],
      expectedEvidence: ['input source note'],
      historyComparisonExpectation: 'compare comparable verification results',
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
      id: 'tpl-temperature-range-check',
      instrumentFamily: 'temperature transmitter / RTD input',
      testPattern: 'expected-versus-measured range check',
      title: 'Temperature expected-versus-measured range check',
      calculationMode: 'expected value vs measured output',
      acceptanceStyle: 'tolerance-based pass/fail with clear deviation display',
      captureSummary: 'Capture expected and measured range checkpoints.',
      expectedLabel: 'Expected temperature',
      observedLabel: 'Measured output',
      minimumSubmissionEvidence: ['range checkpoints'],
      expectedEvidence: ['supporting photo'],
      historyComparisonExpectation: 'compare comparable range checks',
    }),
    buildTemplate({
      id: 'tpl-level-range-check',
      instrumentFamily: 'level transmitter',
      testPattern: 'range verification',
      title: 'Level transmitter range verification',
      calculationMode: 'applied level vs output deviation',
      acceptanceStyle: 'within tolerance across low-mid-high checkpoints',
      captureSummary: 'Capture range checkpoints.',
      expectedLabel: 'Expected level',
      observedLabel: 'Observed output',
      minimumSubmissionEvidence: ['level checkpoints'],
      expectedEvidence: ['reference setup note'],
      historyComparisonExpectation: 'compare repeated range bias',
    }),
    buildTemplate({
      id: 'tpl-level-basic-calibration',
      instrumentFamily: 'level transmitter',
      testPattern: 'basic calibration check',
      title: 'Level transmitter basic calibration',
      calculationMode: 'expected level vs measured output',
      acceptanceStyle: 'tolerance/pass-fail classification against configured operating range',
      captureSummary: 'Capture calibration checkpoints.',
      expectedLabel: 'Expected level',
      observedLabel: 'Measured output',
      minimumSubmissionEvidence: ['calibration checkpoints'],
      expectedEvidence: ['adjustment note'],
      historyComparisonExpectation: 'compare recurring calibration drift',
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
      id: 'tpl-loop-integrity-check',
      instrumentFamily: 'analog 4-20 mA loop',
      testPattern: 'loop integrity check',
      title: 'Analog loop integrity check',
      calculationMode: 'expected current vs measured current',
      acceptanceStyle: 'within tolerance at each loop checkpoint',
      captureSummary: 'Capture expected and measured current checkpoints.',
      expectedLabel: 'Expected current',
      observedLabel: 'Measured current',
      expectedUnit: 'mA',
      observedUnit: 'mA',
      calculationRangeOverride: { min: 4, max: 20, unit: 'mA' },
      conversionBasisSummary: 'Linear 4-20 mA conversion derived from the configured process range.',
      expectedRangeSummary: '0 to 100 % maps to 4-20 mA.',
      minimumSubmissionEvidence: ['loop checkpoints'],
      expectedEvidence: ['supply note'],
      historyComparisonExpectation: 'compare repeated loop instability',
    }),
    buildTemplate({
      id: 'tpl-loop-signal-validation',
      instrumentFamily: 'analog 4-20 mA loop',
      testPattern: 'signal validation',
      title: 'Analog loop signal validation',
      calculationMode: 'expected current vs measured current',
      acceptanceStyle: 'tolerance-based pass/fail across validated signal points',
      captureSummary: 'Capture validated loop current points.',
      expectedLabel: 'Expected current',
      observedLabel: 'Measured current',
      expectedUnit: 'mA',
      observedUnit: 'mA',
      calculationRangeOverride: { min: 4, max: 20, unit: 'mA' },
      conversionBasisSummary: 'Linear 4-20 mA conversion derived from the configured process range.',
      expectedRangeSummary: '0 to 100 % maps to 4-20 mA.',
      minimumSubmissionEvidence: ['validated current points'],
      expectedEvidence: ['process reference note'],
      historyComparisonExpectation: 'compare repeated signal validation drift',
    }),
    buildTemplate({
      id: 'tpl-loop-current-vs-process',
      instrumentFamily: 'analog 4-20 mA loop',
      testPattern: 'expected current versus process value verification',
      title: 'Analog loop expected current verification',
      calculationMode: 'expected current vs measured current',
      acceptanceStyle: 'deviation and tolerance outcome against the configured conversion basis',
      captureSummary: 'Capture expected current derived from the process basis.',
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
          whyItMatters:
            'This keeps the stroke test grounded in actual field readiness before escalation.',
          helpsRuleOut: 'blocked movement path or missing permissive conditions',
          sourceReference: 'TAGWISE-BP-XV-003',
        },
        {
          id: 'valve-supply-check',
          prompt:
            'Confirm actuator supply and indication are available before concluding a valve fault.',
          whyItMatters:
            'Supply or indication gaps can look like travel failure when the valve is not the root cause.',
          helpsRuleOut: 'air supply, control enable, or indication availability issues',
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
      title: 'Valve shared guidance',
      version: 'v1',
      summary: 'Separate positioner feedback issues from true movement faults.',
      whyItMatters: 'This keeps the shared shell diagnosis local and practical.',
      sourceReference: 'TAGWISE-BP-XV-003',
    },
  ],
  historySummaries: [
    {
      id: 'history-pressure',
      tagId: 'tag-pressure',
      lastObservedAt: '2026-04-10T12:00:00.000Z',
      summaryText: 'Pressure trend available.',
      lastResult: 'pass',
      trendHint: 'watch repeated drift',
    },
    {
      id: 'history-temperature',
      tagId: 'tag-temperature',
      lastObservedAt: '2026-04-09T11:00:00.000Z',
      summaryText: 'Temperature trend available.',
      lastResult: 'pass',
      trendHint: 'watch repeated offset',
    },
    {
      id: 'history-level',
      tagId: 'tag-level',
      lastObservedAt: '2026-04-08T10:00:00.000Z',
      summaryText: 'Level trend available.',
      lastResult: 'pass',
      trendHint: 'watch repeated upper-range bias',
    },
    {
      id: 'history-loop',
      tagId: 'tag-loop',
      lastObservedAt: '2026-04-07T09:30:00.000Z',
      summaryText: 'Analog loop trend available.',
      lastResult: 'pass-with-note',
      trendHint: 'watch repeated mid-range current drift',
    },
    {
      id: 'history-valve',
      tagId: 'tag-valve',
      lastObservedAt: '2026-04-06T08:30:00.000Z',
      summaryText: 'Valve history available.',
      lastResult: 'pass-with-note',
      trendHint: 'watch repeated delayed travel or feedback mismatch',
    },
  ],
};

describe('LocalExecutionTemplateRegistry', () => {
  it('resolves the approved v1 transmitter and analog loop template patterns into explicit local contracts', () => {
    const registry = new LocalExecutionTemplateRegistry();

    const cases = [
      ['tag-pressure', 'tpl-pressure-as-found', 'pressure transmitter'],
      ['tag-pressure', 'tpl-pressure-as-left', 'pressure transmitter'],
      ['tag-pressure', 'tpl-pressure-loop-range', 'pressure transmitter'],
      ['tag-temperature', 'tpl-temperature-input-simulation', 'temperature transmitter / RTD input'],
      ['tag-temperature', 'tpl-temperature-calibration-verification', 'temperature transmitter / RTD input'],
      ['tag-temperature', 'tpl-temperature-range-check', 'temperature transmitter / RTD input'],
      ['tag-level', 'tpl-level-range-check', 'level transmitter'],
      ['tag-level', 'tpl-level-basic-calibration', 'level transmitter'],
      ['tag-level', 'tpl-level-output-verification', 'level transmitter'],
      ['tag-loop', 'tpl-loop-integrity-check', 'analog 4-20 mA loop'],
      ['tag-loop', 'tpl-loop-signal-validation', 'analog 4-20 mA loop'],
      ['tag-loop', 'tpl-loop-current-vs-process', 'analog 4-20 mA loop'],
      ['tag-valve', 'tpl-valve-stroke-test', 'control valve with positioner'],
      [
        'tag-valve',
        'tpl-valve-position-feedback-verification',
        'control valve with positioner',
      ],
    ] as const;

    for (const [tagId, templateId, instrumentFamily] of cases) {
      const tag = snapshot.tags.find((item) => item.id === tagId);
      expect(tag).toBeTruthy();

      const resolved = registry.resolveTemplate(snapshot, tag!, templateId);

      expect(resolved).toMatchObject({
        id: templateId,
        instrumentFamily,
        version: '2026-04-v1',
      });
      expect(resolved?.captureFields).toMatchObject([
        { id: 'expectedValue', label: expect.any(String), inputKind: 'numeric' },
        { id: 'observedValue', label: expect.any(String), inputKind: 'numeric' },
      ]);
      expect(resolved?.minimumSubmissionEvidence.length).toBeGreaterThan(0);
      expect(resolved?.expectedEvidence.length).toBeGreaterThan(0);
    }
  });

  it('preserves analog loop conversion basis and expected range summaries in the local contract', () => {
    const registry = new LocalExecutionTemplateRegistry();
    const loopTag = snapshot.tags.find((item) => item.id === 'tag-loop');

    expect(loopTag).toBeTruthy();

    const resolved = registry.resolveTemplate(snapshot, loopTag!, 'tpl-loop-current-vs-process');

    expect(resolved).toMatchObject({
      calculationRangeOverride: {
        min: 4,
        max: 20,
        unit: 'mA',
      },
      conversionBasisSummary:
        'Expected current is derived from the configured process range using a linear 4-20 mA conversion basis.',
      expectedRangeSummary: '0 to 100 % process value range / 4-20 mA signal range.',
    });
  });

  it('preserves valve checklist prompts in the local contract', () => {
    const registry = new LocalExecutionTemplateRegistry();
    const valveTag = snapshot.tags.find((item) => item.id === 'tag-valve');

    expect(valveTag).toBeTruthy();

    const resolved = registry.resolveTemplate(snapshot, valveTag!, 'tpl-valve-stroke-test');

    expect(resolved).toMatchObject({
      checklistPrompts: [
        'Confirm the movement path is clear before issuing a stroke command.',
        'Verify actuator supply or permissive readiness before concluding a movement fault.',
      ],
    });
  });

  it('normalizes structured checklist steps and guided diagnosis prompts into the local contract', () => {
    const registry = new LocalExecutionTemplateRegistry();
    const valveTag = snapshot.tags.find((item) => item.id === 'tag-valve');

    expect(valveTag).toBeTruthy();

    const resolved = registry.resolveTemplate(snapshot, valveTag!, 'tpl-valve-stroke-test');

    expect(resolved?.checklistSteps).toEqual([
      expect.objectContaining({
        id: 'valve-path-check',
        prompt: expect.stringContaining('movement path'),
        whyItMatters: expect.stringContaining('field readiness'),
        helpsRuleOut: 'blocked movement path or missing permissive conditions',
        sourceReference: 'TAGWISE-BP-XV-003',
      }),
      expect.objectContaining({
        id: 'valve-supply-check',
      }),
    ]);
    expect(resolved?.guidedDiagnosisPrompts).toEqual([
      expect.objectContaining({
        id: 'valve-diagnosis-travel-lag',
        prompt: expect.stringContaining('travel lags'),
        sourceReference: 'TAGWISE-BP-XV-003',
      }),
    ]);
  });

  it('falls back to checklist prompts and linked guidance when structured guidance is not declared', () => {
    const registry = new LocalExecutionTemplateRegistry();
    const valveTag = snapshot.tags.find((item) => item.id === 'tag-valve');

    expect(valveTag).toBeTruthy();

    const resolved = registry.resolveTemplate(
      snapshot,
      valveTag!,
      'tpl-valve-position-feedback-verification',
    );

    expect(resolved?.checklistSteps).toEqual([
      expect.objectContaining({
        id: 'checklist-1',
        prompt: 'Confirm feedback indication is available before treating the issue as a travel fault.',
        sourceReference: 'TAGWISE-BP-XV-003',
      }),
      expect.objectContaining({
        id: 'checklist-2',
      }),
    ]);
    expect(resolved?.guidedDiagnosisPrompts).toEqual([
      expect.objectContaining({
        id: 'diagnosis-1',
        prompt: 'Separate positioner feedback issues from true movement faults.',
        whyItMatters: 'This keeps the shared shell diagnosis local and practical.',
        helpsRuleOut:
          'Simple field-condition or setup issues before treating the result as a confirmed device fault.',
        sourceReference: 'TAGWISE-BP-XV-003',
      }),
    ]);
  });

  it('returns null when the requested template is not attached to the selected tag', () => {
    const registry = new LocalExecutionTemplateRegistry();
    const pressureTag = snapshot.tags.find((item) => item.id === 'tag-pressure');

    expect(pressureTag).toBeTruthy();
    expect(registry.resolveTemplate(snapshot, pressureTag!, 'tpl-level-range-check')).toBeNull();
  });
});
