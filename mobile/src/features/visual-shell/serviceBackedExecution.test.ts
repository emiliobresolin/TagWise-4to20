import { describe, expect, it } from 'vitest';

import type { SharedExecutionShell } from '../execution/model';
import {
  buildVisualExecutionCalculation,
  buildVisualExecutionGuidance,
  buildVisualExecutionHistory,
  buildVisualHistoryPointOptions,
  convertLoopValue,
  resolveLoopConversionMetadata,
} from './serviceBackedExecution';

describe('service-backed visual execution adapter', () => {
  it('projects calculation state from the selected execution shell instead of static visual values', () => {
    const shell = buildShell({
      tagCode: 'FT-777',
      expectedValue: '40',
      observedValue: '44',
      unit: '%',
      acceptance: 'fail',
      absoluteDeviation: 4,
      signedDeviation: 4,
      percentOfSpan: 4,
    });

    const calculation = buildVisualExecutionCalculation(shell);

    expect(calculation.state).toBe('available');
    expect(calculation.tagCode).toBe('FT-777');
    expect(calculation.expectedValue).toBe('40');
    expect(calculation.observedValue).toBe('44');
    expect(calculation.result?.absoluteDeviationLabel).toBe('4 %');
    expect(calculation.result?.acceptanceLabel).toBe('FALHA');
    expect(calculation.expectedValue).not.toBe('8');
    expect(calculation.observedValue).not.toBe('9.45');
  });

  it('converts PV, mA, and percent offline when 4-20 mA metadata exists', () => {
    const shell = buildShell({
      conversionBasisSummary: '0 to 100 % maps to 4-20 mA.',
      expectedRangeSummary: '0 to 100 % maps to 4-20 mA.',
      unit: 'mA',
      range: { min: 4, max: 20, unit: 'mA' },
    });
    const metadata = resolveLoopConversionMetadata(shell.calculation!.definition);

    expect(metadata.state).toBe('available');
    expect(convertLoopValue(metadata, 'process-to-milliamp', '50')).toMatchObject({
      state: 'available',
      value: 12,
    });
    expect(convertLoopValue(metadata, 'milliamp-to-percent', '12')).toMatchObject({
      state: 'available',
      value: 50,
    });
    expect(convertLoopValue(metadata, 'process-to-percent', '50')).toMatchObject({
      state: 'available',
      value: 50,
      label: 'PV para percentual',
    });
    expect(convertLoopValue(metadata, 'percent-to-milliamp', '25')).toMatchObject({
      state: 'available',
      value: 8,
    });
    expect(convertLoopValue(metadata, 'milliamp-to-process', '20')).toMatchObject({
      state: 'available',
      value: 100,
    });
  });

  it('reports conversion metadata as unavailable instead of producing fake output', () => {
    const shell = buildShell({
      conversionBasisSummary: null,
      expectedRangeSummary: null,
      range: { min: 0, max: 10, unit: 'bar' },
      unit: 'bar',
    });
    const metadata = resolveLoopConversionMetadata(shell.calculation!.definition);

    expect(metadata.state).toBe('unavailable');
    expect(metadata.reason).toContain('base analogica');
    expect(convertLoopValue(metadata, 'process-to-milliamp', '5')).toMatchObject({
      state: 'unavailable',
      value: null,
    });
  });

  it('projects history rows and missing states from the selected execution shell', () => {
    const shell = buildShell({
      tagCode: 'TT-909',
      historyState: 'missing',
      historyFields: [
        { label: 'History state', value: 'Missing', state: 'missing' },
        { label: 'Current result', value: 'Pass now versus no prior result', state: 'available' },
      ],
    });

    const history = buildVisualExecutionHistory(shell);

    expect(history.tagCode).toBe('TT-909');
    expect(history.state).toBe('missing');
    expect(history.rows.map((row) => row.value)).toContain('Ausente');
    expect(history.rows.map((row) => row.value)).not.toContain('1,45 bar');
  });

  it('builds selectable compare points for loop-style history screens', () => {
    const shell = buildShell({
      historyFields: [
        { label: '2026-05-01 point 50%', value: '50% expected 12 mA measured 12.1 mA', state: 'available' },
        { label: '2026-05-02 point 100%', value: '100% expected 20 mA measured 19.9 mA', state: 'available' },
      ],
    });
    const history = buildVisualExecutionHistory(shell);
    const metadata = resolveLoopConversionMetadata(shell.calculation!.definition);

    const options = buildVisualHistoryPointOptions(history, metadata);

    expect(options.map((option) => option.label)).toEqual(['0%', '25%', '50%', '75%', '100%']);
    expect(options.find((option) => option.label === '50%')?.rows).toHaveLength(1);
    expect(options.find((option) => option.label === '25%')?.emptyLabel).toContain(
      'Sem dados suficientes',
    );
  });

  it('keeps missing history nonblocking when no shell is loaded', () => {
    const history = buildVisualExecutionHistory(null);

    expect(history.state).toBe('unavailable');
    expect(history.rows).toEqual([]);
    expect(history.unavailableReason).toContain('Carregue um teste local');
  });

  it('projects checklist, guidance, references, and risk state without AI hypothesis fields', () => {
    const shell = buildShell({
      checklistPrompt: 'Confirm impulse line isolation is open',
      diagnosisPrompt: 'Compare local process condition against the cached baseline',
      linkedGuidanceTitle: 'Pressure transmitter field baseline',
      observationNotes: 'Impulse line warmed and stable.',
      riskState: 'flagged',
    });

    const guidance = buildVisualExecutionGuidance(shell);

    expect(guidance.state).toBe('available');
    expect(guidance.checklistItems[0]?.prompt).toBe('Confirm impulse line isolation is open');
    expect(guidance.guidedDiagnosisPrompts[0]?.prompt).toBe(
      'Compare local process condition against the cached baseline',
    );
    expect(guidance.linkedGuidance[0]?.title).toBe('Pressure transmitter field baseline');
    expect(guidance.observationNotes).toBe('Impulse line warmed and stable.');
    expect(guidance.riskStateLabel).toBe('Risco visivel ativo');
    expect(JSON.stringify(guidance)).not.toContain('Probable hypothesis');
    expect(JSON.stringify(guidance)).not.toContain('Why this?');
  });

  it('keeps missing guidance nonblocking instead of falling back to demo diagnosis', () => {
    const shell = buildShell({
      checklistPrompt: null,
      diagnosisPrompt: null,
      linkedGuidanceTitle: null,
    });

    const guidance = buildVisualExecutionGuidance(shell);

    expect(guidance.state).toBe('missing');
    expect(guidance.checklistItems).toEqual([]);
    expect(guidance.guidedDiagnosisPrompts).toEqual([]);
    expect(guidance.linkedGuidance).toEqual([]);
    expect(JSON.stringify(guidance)).not.toContain('Alimentacao eletrica');
  });
});

function buildShell(
  overrides: Partial<{
    tagCode: string;
    expectedValue: string;
    observedValue: string;
    unit: string;
    range: { min: number; max: number; unit: string };
    conversionBasisSummary: string | null;
    expectedRangeSummary: string | null;
    acceptance: 'pass' | 'fail' | 'unavailable';
    signedDeviation: number;
    absoluteDeviation: number;
    percentOfSpan: number | null;
    historyState: SharedExecutionShell['riskInputs']['historyState'];
    historyFields: SharedExecutionShell['steps'][number]['fields'];
    checklistPrompt: string | null;
    diagnosisPrompt: string | null;
    linkedGuidanceTitle: string | null;
    observationNotes: string;
    riskState: SharedExecutionShell['guidance']['riskState'];
  }> = {},
): SharedExecutionShell {
  const tagCode = overrides.tagCode ?? 'PT-101';
  const unit = overrides.unit ?? 'bar';
  const range = overrides.range ?? { min: 0, max: 10, unit };
  const historyState = overrides.historyState ?? 'available';
  const checklistPrompt = resolveNullableOverride(
    overrides,
    'checklistPrompt',
    'Verify local loop power',
  );
  const diagnosisPrompt = resolveNullableOverride(
    overrides,
    'diagnosisPrompt',
    'Check field condition against baseline',
  );
  const linkedGuidanceTitle = resolveNullableOverride(
    overrides,
    'linkedGuidanceTitle',
    'Local instrument baseline',
  );
  const conversionBasisSummary = resolveNullableOverride(
    overrides,
    'conversionBasisSummary',
    'PV maps to 4-20 mA.',
  );
  const expectedRangeSummary = resolveNullableOverride(overrides, 'expectedRangeSummary', null);
  const riskState = overrides.riskState ?? 'clear';

  return {
    workPackageId: 'wp-001',
    workPackageTitle: 'Local package',
    tagId: 'tag-001',
    tagCode,
    template: {
      id: 'tpl-001',
      title: 'Local execution template',
      version: '2026-05',
      instrumentFamily: 'pressure transmitter',
      testPattern: 'as-found',
      calculationMode: 'point deviation',
      acceptanceStyle: 'local tolerance',
      captureSummary: 'Capture expected and observed values.',
      captureFields: [
        { id: 'expectedValue', label: 'Expected value', inputKind: 'numeric', unit },
        { id: 'observedValue', label: 'Observed value', inputKind: 'numeric', unit },
      ],
      calculationRangeOverride: range,
      conversionBasisSummary,
      expectedRangeSummary,
      checklistPrompts: checklistPrompt ? [checklistPrompt] : [],
      checklistSteps: [],
      guidedDiagnosisPrompts: [],
      minimumSubmissionEvidence: ['structured readings'],
      expectedEvidence: [],
      historyComparisonExpectation: 'Compare current result with cached history.',
      steps: [
        { id: 'context', title: 'Context', kind: 'context' },
        { id: 'calculation', title: 'Calculation setup', kind: 'calculation' },
        { id: 'history', title: 'History comparison', kind: 'history' },
        { id: 'guidance', title: 'Checklist and guidance', kind: 'guidance' },
        { id: 'report', title: 'Report draft review', kind: 'report' },
      ],
    },
    steps: [
      {
        id: 'history',
        title: 'History comparison',
        kind: 'history',
        summary: 'Cached history summary for selected tag.',
        detail: 'Cached history detail for selected tag.',
        fields:
          overrides.historyFields ??
          [
            { label: 'History state', value: 'Available', state: 'available' },
            { label: 'Current result', value: 'Fail now versus Pass previously', state: 'available' },
            { label: 'Prior result', value: 'Pass previously', state: 'available' },
          ],
      },
      {
        id: 'guidance',
        title: 'Checklist and guidance',
        kind: 'guidance',
        summary: 'Local checklist and references are available.',
        detail: 'Use deterministic local guidance; AI diagnosis is report-level later.',
        fields: [],
      },
    ],
    progress: {
      currentStepId: 'calculation',
      visitedStepIds: ['context', 'calculation'],
      updatedAt: '2026-05-09T10:00:00.000Z',
    },
    calculation: {
      definition: {
        modeLabel: 'point deviation',
        acceptanceLabel: 'local tolerance',
        expectedLabel: `Expected value (${unit})`,
        observedLabel: `Observed value (${unit})`,
        unit,
        span: Math.abs(range.max - range.min),
        calculationRange: range,
        toleranceSource: '+/-1% span',
        toleranceMode: 'percent-of-span',
        toleranceValue: 1,
        executionContext: {
          conversionBasisSummary,
          expectedRangeSummary,
        },
      },
      rawInputs: {
        expectedValue: overrides.expectedValue ?? '5',
        observedValue: overrides.observedValue ?? '5.1',
      },
      result: {
        signedDeviation: overrides.signedDeviation ?? 0.1,
        absoluteDeviation: overrides.absoluteDeviation ?? 0.1,
        percentOfSpan: overrides.percentOfSpan ?? 1,
        acceptance: overrides.acceptance ?? 'pass',
        acceptanceReason: 'Tolerance is 1% of span.',
      },
      updatedAt: '2026-05-09T10:00:00.000Z',
    },
    riskInputs: {
      historyState,
      missingContextFieldLabels: [],
    },
    guidance: {
      checklistItems: checklistPrompt
        ? [
            {
              id: 'check-001',
              prompt: checklistPrompt,
              whyItMatters: 'Keeps execution grounded in local field state.',
              helpsRuleOut: 'Setup and wiring issues',
              sourceReference: 'LOCAL-CHECKLIST',
              outcome: 'pending',
            },
          ]
        : [],
      guidedDiagnosisPrompts: diagnosisPrompt
        ? [
            {
              id: 'diag-001',
              prompt: diagnosisPrompt,
              whyItMatters: 'Keeps diagnosis deterministic and offline.',
              helpsRuleOut: 'Operating condition issues',
              sourceReference: 'LOCAL-GUIDANCE',
            },
          ]
        : [],
      linkedGuidance: linkedGuidanceTitle
        ? [
            {
              id: 'guide-001',
              title: linkedGuidanceTitle,
              summary: 'Cached local guidance summary.',
              whyItMatters: 'Keeps field work aligned with local procedure.',
              sourceReference: 'NORM-LOCAL-001',
            },
          ]
        : [],
      riskState,
      riskHooks: riskState === 'flagged' ? ['History is missing.'] : [],
      riskItems:
        riskState === 'flagged'
          ? [
              {
                id: 'history-missing',
                reasonType: 'missing-history',
                severity: 'warning',
                title: 'History reference is missing',
                detail: 'Cached package points to missing history data.',
                justificationRequired: true,
                justificationPrompt: 'Explain how you proceeded without local history.',
                justificationText: '',
              },
            ]
          : [],
      submitReadiness: 'ready',
      submitBlockingHooks: [],
    },
    evidence: {
      draftReportId: 'draft-001',
      draftReportState: 'technician-owned-draft',
      observationNotes: overrides.observationNotes ?? '',
      calculationEvidenceUpdatedAt: '2026-05-09T10:00:00.000Z',
      guidanceEvidenceUpdatedAt: null,
      photoAttachments: [],
      photoEvidenceUpdatedAt: null,
      loopReadings: [],
      loopInputMode: null,
      loopUpdatedAt: null,
    },
    report: {
      reportId: 'draft-001',
      state: 'technician-owned-draft',
      lifecycleState: 'In Progress',
      syncState: 'local-only',
      technicianName: 'Field Technician',
      technicianEmail: 'tech@example.com',
      tagContextSummary: 'Local tag context',
      executionSummary: 'Execution summary',
      historySummary: 'History summary',
      draftDiagnosisSummary: 'Guidance summary',
      checklistOutcomes: [],
      evidenceReferences: [],
      riskFlags: [],
      reviewNotes: '',
      savedAt: null,
      submittedAt: null,
    },
  };
}

function resolveNullableOverride<TValue>(
  overrides: object,
  key: string,
  fallback: TValue,
): TValue {
  const values = overrides as Record<string, unknown>;
  return Object.prototype.hasOwnProperty.call(overrides, key)
    ? (values[key] as TValue)
    : fallback;
}
