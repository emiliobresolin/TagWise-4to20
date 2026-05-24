import type {
  AssignedWorkPackageGuidanceSnapshot,
  AssignedWorkPackageTemplateSnapshot,
} from './model';
import {
  buildLevelChecklistSteps,
  buildLevelDiagnosisPrompts,
  buildLoopChecklistSteps,
  buildLoopDiagnosisPrompts,
  buildPressureChecklistSteps,
  buildPressureDiagnosisPrompts,
  buildTemperatureChecklistSteps,
  buildTemperatureDiagnosisPrompts,
  buildTemplate,
  buildValveChecklistSteps,
  buildValveDiagnosisPrompts,
} from './seedData';

// Story 9.3: shared template + guidance registry for snapshots assembled by
// the supervisor authoring flow. Template ids and payload shape match the
// seeded packages (Story 2.1 + 8.x), so execution-shell pattern resolution
// and report validation behave identically for authored snapshots.

const TEMPLATE_BUILDERS: Record<string, () => AssignedWorkPackageTemplateSnapshot> = {
  'tpl-pressure-as-found': () =>
    buildTemplate({
      id: 'tpl-pressure-as-found',
      instrumentFamily: 'pressure transmitter',
      testPattern: 'as-found calibration check',
      title: 'Comparacao no campo',
      calculationMode: 'point deviation by span',
      acceptanceStyle: 'within tolerance by point and overall span',
      captureSummary:
        'Capture structured pressure checkpoints before recalibration and compare measured versus expected values.',
      expectedLabel: 'Expected pressure',
      observedLabel: 'Measured pressure',
      checklistSteps: buildPressureChecklistSteps(),
      guidedDiagnosisPrompts: buildPressureDiagnosisPrompts(),
      minimumSubmissionEvidence: ['as-found readings', 'instrument note'],
      expectedEvidence: ['supporting photo', 'loop condition note'],
      historyComparisonExpectation: 'compare last approved span error and repeated drift',
    }),
  'tpl-temperature-calibration-verification': () =>
    buildTemplate({
      id: 'tpl-temperature-calibration-verification',
      instrumentFamily: 'temperature transmitter / RTD input',
      testPattern: 'calibration verification',
      title: 'Comparacao no campo',
      calculationMode: 'expected temperature vs measured output',
      acceptanceStyle: 'tolerance-based pass/fail with clear deviation display',
      captureSummary:
        'Capture calibration checkpoints and verify the measured output against the expected temperature values.',
      expectedLabel: 'Expected temperature',
      observedLabel: 'Measured output',
      checklistSteps: buildTemperatureChecklistSteps(),
      guidedDiagnosisPrompts: buildTemperatureDiagnosisPrompts(),
      minimumSubmissionEvidence: ['calibration checkpoints', 'measured outputs'],
      expectedEvidence: ['reference source note', 'configuration note'],
      historyComparisonExpectation:
        'compare last comparable verification result and drift pattern',
    }),
  'tpl-level-basic-calibration': () =>
    buildTemplate({
      id: 'tpl-level-basic-calibration',
      instrumentFamily: 'level transmitter',
      testPattern: 'basic calibration check',
      title: 'Comparacao no campo',
      calculationMode: 'expected level vs measured output',
      acceptanceStyle: 'tolerance/pass-fail classification against configured operating range',
      captureSummary:
        'Capture calibration checkpoints and verify the measured level output against the configured reference values.',
      expectedLabel: 'Expected level',
      observedLabel: 'Measured output',
      checklistSteps: buildLevelChecklistSteps(),
      guidedDiagnosisPrompts: buildLevelDiagnosisPrompts(),
      minimumSubmissionEvidence: ['calibration checkpoints', 'measured outputs'],
      expectedEvidence: ['reference setup note', 'adjustment note'],
      historyComparisonExpectation: 'compare recurring calibration drift before recalibration',
    }),
  'tpl-valve-stroke-test': () =>
    buildTemplate({
      id: 'tpl-valve-stroke-test',
      instrumentFamily: 'control valve with positioner',
      testPattern: 'stroke test',
      title: 'Teste de stroke',
      calculationMode: 'commanded position vs observed travel',
      acceptanceStyle: 'pass/fail classification at commanded movement checkpoints',
      captureSummary:
        'Capture commanded open, mid, and closed checkpoints and compare the observed travel response at each stroke point.',
      expectedLabel: 'Commanded position',
      observedLabel: 'Observed travel',
      checklistPrompts: [
        'Confirm the movement path is clear before issuing a stroke command.',
        'Verify actuator supply or permissive readiness before concluding a movement fault.',
        'If travel is skipped or interrupted, record a technician justification locally.',
      ],
      checklistSteps: buildValveChecklistSteps(),
      guidedDiagnosisPrompts: buildValveDiagnosisPrompts(),
      minimumSubmissionEvidence: ['commanded points', 'observed travel responses'],
      expectedEvidence: ['supporting photo', 'actuator note'],
      historyComparisonExpectation: 'compare repeat sticking or delayed travel notes',
    }),
  'tpl-loop-integrity-check': () =>
    buildTemplate({
      id: 'tpl-loop-integrity-check',
      instrumentFamily: 'analog 4-20 mA loop',
      testPattern: 'continuity verification at zero point',
      title: 'Continuidade no campo',
      calculationMode: 'expected current vs measured current at zero point',
      acceptanceStyle: 'within tolerance at the zero checkpoint',
      captureSummary:
        'Capture expected and measured current at the zero checkpoint to verify analog continuity and stable signal transfer.',
      expectedLabel: 'Expected current',
      observedLabel: 'Measured current',
      expectedUnit: 'mA',
      observedUnit: 'mA',
      calculationRangeOverride: { min: 4, max: 20, unit: 'mA' },
      conversionBasisSummary:
        'Linear 4-20 mA conversion derived from the configured process range.',
      expectedRangeSummary: '0 to 100 % maps to 4-20 mA.',
      checklistSteps: buildLoopChecklistSteps(),
      guidedDiagnosisPrompts: buildLoopDiagnosisPrompts(),
      minimumSubmissionEvidence: ['loop checkpoints', 'measured current values'],
      expectedEvidence: ['supply/continuity note', 'supporting photo'],
      historyComparisonExpectation:
        'compare repeated continuity loss, instability, or loop drift at the same checkpoints',
    }),
};

const GUIDANCE_REGISTRY: Record<string, AssignedWorkPackageGuidanceSnapshot> = {
  'guide-pressure-loop-check': {
    id: 'guide-pressure-loop-check',
    title: 'Pressure loop check baseline',
    version: '2026.04',
    summary:
      'Confirm impulse path and vent condition before accepting transmitter deviation as instrument fault.',
    whyItMatters: 'Rules out process-side restriction before calibration decisions.',
    sourceReference: 'TAGWISE-BP-PT-001',
  },
  'guide-rtd-input-check': {
    id: 'guide-rtd-input-check',
    title: 'RTD input verification baseline',
    version: '2026.04',
    summary:
      'Validate simulated sensor input stability before documenting transmitter offset.',
    whyItMatters: 'Reduces false adjustment caused by unstable simulator or loose termination.',
    sourceReference: 'TAGWISE-BP-TT-002',
  },
  'guide-level-reference-check': {
    id: 'guide-level-reference-check',
    title: 'Level reference alignment',
    version: '2026.04',
    summary: 'Confirm reference datum before concluding a transmitter range offset.',
    whyItMatters: 'Avoids documenting false deviation from incorrect tank reference.',
    sourceReference: 'TAGWISE-BP-LT-001',
  },
  'guide-valve-stroke-baseline': {
    id: 'guide-valve-stroke-baseline',
    title: 'Valve stroke baseline',
    version: '2026.04',
    summary:
      'Observe travel smoothness and positioner response before escalating to mechanical fault.',
    whyItMatters: 'Separates feedback issues from actual valve sticking.',
    sourceReference: 'TAGWISE-BP-XV-003',
  },
  'guide-loop-integrity-check': {
    id: 'guide-loop-integrity-check',
    title: 'Analog loop integrity baseline',
    version: '2026.04',
    summary:
      'Confirm supply, polarity, and continuity before accepting a loop deviation as a device fault.',
    whyItMatters: 'Separates instrument issues from simple wiring or supply-side problems.',
    sourceReference: 'TAGWISE-BP-LOOP-001',
  },
};

export function getAuthoredTemplate(
  templateId: string,
): AssignedWorkPackageTemplateSnapshot | null {
  const builder = TEMPLATE_BUILDERS[templateId];
  return builder ? builder() : null;
}

export function getAuthoredGuidance(
  guidanceId: string,
): AssignedWorkPackageGuidanceSnapshot | null {
  return GUIDANCE_REGISTRY[guidanceId] ?? null;
}

export function getAuthoredTemplateIds(): string[] {
  return Object.keys(TEMPLATE_BUILDERS);
}

export function getAuthoredGuidanceIds(): string[] {
  return Object.keys(GUIDANCE_REGISTRY);
}
