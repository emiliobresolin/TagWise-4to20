import type { SeededAssignedWorkPackageRecord } from './model';

function buildNumericCaptureFields(
  expectedLabel: string,
  observedLabel: string,
  expectedUnit?: string,
  observedUnit?: string,
) {
  return [
    {
      id: 'expectedValue' as const,
      label: expectedLabel,
      inputKind: 'numeric' as const,
      unit: expectedUnit,
    },
    {
      id: 'observedValue' as const,
      label: observedLabel,
      inputKind: 'numeric' as const,
      unit: observedUnit,
    },
  ];
}

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
    captureFields: buildNumericCaptureFields(
      definition.expectedLabel,
      definition.observedLabel,
      definition.expectedUnit,
      definition.observedUnit,
    ),
    calculationRangeOverride: definition.calculationRangeOverride,
    conversionBasisSummary: definition.conversionBasisSummary,
    expectedRangeSummary: definition.expectedRangeSummary,
    checklistPrompts: definition.checklistPrompts,
    minimumSubmissionEvidence: definition.minimumSubmissionEvidence,
    expectedEvidence: definition.expectedEvidence,
    historyComparisonExpectation: definition.historyComparisonExpectation,
  };
}

export function buildSeedAssignedWorkPackages(
  technicianUserId: string,
): SeededAssignedWorkPackageRecord[] {
  const packageOne = {
    id: 'wp-seed-1001',
    sourceReference: 'seed-cmms-1001',
    title: 'North Process Loop Verification',
    assignedTeam: 'Instrumentation Alpha',
    priority: 'high' as const,
    status: 'assigned' as const,
    packageVersion: 1,
    snapshotContractVersion: '2026-04-v1',
    tagCount: 3,
    dueWindow: {
      startsAt: '2026-04-20T08:00:00.000Z',
      endsAt: '2026-04-20T17:00:00.000Z',
    },
    updatedAt: '2026-04-19T10:00:00.000Z',
  };

  const packageTwo = {
    id: 'wp-seed-1002',
    sourceReference: 'seed-cmms-1002',
    title: 'Tank Farm Level and Valve Checks',
    assignedTeam: 'Instrumentation Alpha',
    priority: 'routine' as const,
    status: 'assigned' as const,
    packageVersion: 1,
    snapshotContractVersion: '2026-04-v1',
    tagCount: 2,
    dueWindow: {
      startsAt: '2026-04-21T11:00:00.000Z',
      endsAt: '2026-04-21T20:00:00.000Z',
    },
    updatedAt: '2026-04-19T11:00:00.000Z',
  };

  return [
    {
      assignedUserId: technicianUserId,
      summary: packageOne,
      snapshot: {
        contractVersion: packageOne.snapshotContractVersion,
        generatedAt: '2026-04-19T10:00:00.000Z',
        summary: packageOne,
        tags: [
          {
            id: 'tag-pt-101',
            tagCode: 'PT-101',
            shortDescription: 'Feed header pressure transmitter',
            area: 'North Unit',
            parentAssetReference: 'asset-feed-header-01',
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
            guidanceReferenceIds: ['guide-pressure-loop-check'],
            historySummaryId: 'history-pt-101',
          },
          {
            id: 'tag-tt-205',
            tagCode: 'TT-205',
            shortDescription: 'Heater outlet temperature transmitter',
            area: 'North Unit',
            parentAssetReference: 'asset-heater-02',
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
            guidanceReferenceIds: ['guide-rtd-input-check'],
            historySummaryId: 'history-tt-205',
          },
          {
            id: 'tag-ai-330',
            tagCode: 'AI-330',
            shortDescription: 'North process analog loop',
            area: 'North Unit',
            parentAssetReference: 'loop-ai-330',
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
            guidanceReferenceIds: ['guide-loop-integrity-check'],
            historySummaryId: 'history-ai-330',
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
            captureSummary:
              'Capture structured pressure checkpoints before recalibration and compare measured versus expected values.',
            expectedLabel: 'Expected pressure',
            observedLabel: 'Measured pressure',
            minimumSubmissionEvidence: ['as-found readings', 'instrument note'],
            expectedEvidence: ['supporting photo', 'loop condition note'],
            historyComparisonExpectation: 'compare last approved span error and repeated drift',
          }),
          buildTemplate({
            id: 'tpl-pressure-as-left',
            instrumentFamily: 'pressure transmitter',
            testPattern: 'as-left calibration check',
            title: 'Pressure transmitter as-left calibration',
            calculationMode: 'point deviation by span',
            acceptanceStyle: 'within tolerance by point and overall span',
            captureSummary:
              'Capture post-adjustment pressure checkpoints and confirm the final instrument state against expected values.',
            expectedLabel: 'Expected pressure',
            observedLabel: 'Measured pressure',
            minimumSubmissionEvidence: ['as-left readings', 'adjustment note'],
            expectedEvidence: ['supporting photo', 'adjustment reference note'],
            historyComparisonExpectation: 'compare final result against last approved as-left check',
          }),
          buildTemplate({
            id: 'tpl-pressure-loop-range',
            instrumentFamily: 'pressure transmitter',
            testPattern: 'loop verification against expected range',
            title: 'Pressure loop verification',
            calculationMode: 'expected range vs measured loop output',
            acceptanceStyle: 'within tolerance across expected range checkpoints',
            captureSummary:
              'Capture applied checkpoints and confirm the loop output against the expected operating range.',
            expectedLabel: 'Expected loop value',
            observedLabel: 'Measured loop value',
            minimumSubmissionEvidence: ['loop checkpoints', 'measured outputs'],
            expectedEvidence: ['reference source note', 'supporting photo'],
            historyComparisonExpectation: 'compare repeated loop or configuration drift at tested points',
          }),
          buildTemplate({
            id: 'tpl-temperature-input-simulation',
            instrumentFamily: 'temperature transmitter / RTD input',
            testPattern: 'input simulation check',
            title: 'RTD input simulation check',
            calculationMode: 'simulated input vs reported output',
            acceptanceStyle: 'point deviation across expected RTD inputs',
            captureSummary:
              'Capture simulated temperature or RTD checkpoints and compare the reported output at each point.',
            expectedLabel: 'Simulated input',
            observedLabel: 'Reported output',
            minimumSubmissionEvidence: ['simulated inputs', 'reported outputs'],
            expectedEvidence: ['input source note', 'supporting photo'],
            historyComparisonExpectation: 'compare last approved zero/span drift pattern',
          }),
          buildTemplate({
            id: 'tpl-temperature-calibration-verification',
            instrumentFamily: 'temperature transmitter / RTD input',
            testPattern: 'calibration verification',
            title: 'Temperature calibration verification',
            calculationMode: 'expected temperature vs measured output',
            acceptanceStyle: 'tolerance-based pass/fail with clear deviation display',
            captureSummary:
              'Capture calibration checkpoints and verify the measured output against the expected temperature values.',
            expectedLabel: 'Expected temperature',
            observedLabel: 'Measured output',
            minimumSubmissionEvidence: ['calibration checkpoints', 'measured outputs'],
            expectedEvidence: ['reference source note', 'configuration note'],
            historyComparisonExpectation: 'compare last comparable verification result and drift pattern',
          }),
          buildTemplate({
            id: 'tpl-temperature-range-check',
            instrumentFamily: 'temperature transmitter / RTD input',
            testPattern: 'expected-versus-measured range check',
            title: 'Temperature expected-versus-measured range check',
            calculationMode: 'expected value vs measured output',
            acceptanceStyle: 'tolerance-based pass/fail with clear deviation display',
            captureSummary:
              'Capture expected and measured range checkpoints to verify the transmitter across the configured operating band.',
            expectedLabel: 'Expected temperature',
            observedLabel: 'Measured output',
            minimumSubmissionEvidence: ['range checkpoints', 'measured outputs'],
            expectedEvidence: ['input source note', 'supporting photo'],
            historyComparisonExpectation: 'compare comparable temperature verification results when available',
          }),
          buildTemplate({
            id: 'tpl-loop-integrity-check',
            instrumentFamily: 'analog 4-20 mA loop',
            testPattern: 'loop integrity check',
            title: 'Analog loop integrity check',
            calculationMode: 'expected current vs measured current',
            acceptanceStyle: 'within tolerance at each loop checkpoint',
            captureSummary:
              'Capture expected and measured loop current at the selected checkpoints to verify continuity and stable signal transfer.',
            expectedLabel: 'Expected current',
            observedLabel: 'Measured current',
            expectedUnit: 'mA',
            observedUnit: 'mA',
            calculationRangeOverride: { min: 4, max: 20, unit: 'mA' },
            conversionBasisSummary: 'Linear 4-20 mA conversion derived from the configured process range.',
            expectedRangeSummary: '0 to 100 % maps to 4-20 mA.',
            minimumSubmissionEvidence: ['loop checkpoints', 'measured current values'],
            expectedEvidence: ['supply/continuity note', 'supporting photo'],
            historyComparisonExpectation: 'compare repeated continuity loss, instability, or loop drift at the same checkpoints',
          }),
          buildTemplate({
            id: 'tpl-loop-signal-validation',
            instrumentFamily: 'analog 4-20 mA loop',
            testPattern: 'signal validation',
            title: 'Analog loop signal validation',
            calculationMode: 'expected current vs measured current',
            acceptanceStyle: 'tolerance-based pass/fail across validated signal points',
            captureSummary:
              'Capture expected and measured current values while validating the loop signal against the configured process range.',
            expectedLabel: 'Expected current',
            observedLabel: 'Measured current',
            expectedUnit: 'mA',
            observedUnit: 'mA',
            calculationRangeOverride: { min: 4, max: 20, unit: 'mA' },
            conversionBasisSummary: 'Linear 4-20 mA conversion derived from the configured process range.',
            expectedRangeSummary: '0 to 100 % maps to 4-20 mA.',
            minimumSubmissionEvidence: ['validated current points', 'process reference note'],
            expectedEvidence: ['input source note', 'supporting photo'],
            historyComparisonExpectation: 'compare repeated signal validation drift or intermittent response',
          }),
          buildTemplate({
            id: 'tpl-loop-current-vs-process',
            instrumentFamily: 'analog 4-20 mA loop',
            testPattern: 'expected current versus process value verification',
            title: 'Analog loop expected current verification',
            calculationMode: 'expected current vs measured current',
            acceptanceStyle: 'deviation and tolerance outcome against the configured conversion basis',
            captureSummary:
              'Capture the expected loop current derived from the process value basis and compare it against the observed loop current.',
            expectedLabel: 'Expected current',
            observedLabel: 'Measured current',
            expectedUnit: 'mA',
            observedUnit: 'mA',
            calculationRangeOverride: { min: 4, max: 20, unit: 'mA' },
            conversionBasisSummary:
              'Expected current is derived from the configured process range using a linear 4-20 mA conversion basis.',
            expectedRangeSummary: '0 to 100 % process value range / 4-20 mA signal range.',
            minimumSubmissionEvidence: ['expected current reference', 'measured current values'],
            expectedEvidence: ['conversion basis note', 'supporting photo'],
            historyComparisonExpectation: 'compare repeated conversion mismatch or process-to-signal deviation patterns',
          }),
        ],
        guidance: [
          {
            id: 'guide-pressure-loop-check',
            title: 'Pressure loop check baseline',
            version: '2026.04',
            summary:
              'Confirm impulse path and vent condition before accepting transmitter deviation as instrument fault.',
            whyItMatters: 'Rules out process-side restriction before calibration decisions.',
            sourceReference: 'TAGWISE-BP-PT-001',
          },
          {
            id: 'guide-rtd-input-check',
            title: 'RTD input verification baseline',
            version: '2026.04',
            summary:
              'Validate simulated sensor input stability before documenting transmitter offset.',
            whyItMatters: 'Reduces false adjustment caused by unstable simulator or loose termination.',
            sourceReference: 'TAGWISE-BP-TT-002',
          },
          {
            id: 'guide-loop-integrity-check',
            title: 'Analog loop integrity baseline',
            version: '2026.04',
            summary:
              'Confirm supply, polarity, and continuity before accepting a loop deviation as a device fault.',
            whyItMatters: 'Separates instrument issues from simple wiring or supply-side problems.',
            sourceReference: 'TAGWISE-BP-LOOP-001',
          },
        ],
        historySummaries: [
          {
            id: 'history-pt-101',
            tagId: 'tag-pt-101',
            lastObservedAt: '2026-03-14T14:30:00.000Z',
            summaryText: 'Last approved check showed mild span drift at 75% point.',
            lastResult: 'pass-with-note',
            trendHint: 'watch repeated positive drift above mid-span',
          },
          {
            id: 'history-tt-205',
            tagId: 'tag-tt-205',
            lastObservedAt: '2026-03-12T09:15:00.000Z',
            summaryText: 'Previous RTD verification passed after retightening terminal block.',
            lastResult: 'pass',
            trendHint: 'repeat wiring check if noise reappears',
          },
          {
            id: 'history-ai-330',
            tagId: 'tag-ai-330',
            lastObservedAt: '2026-03-18T13:10:00.000Z',
            summaryText: 'Previous loop validation found slight mid-range current drift but remained acceptable.',
            lastResult: 'pass-with-note',
            trendHint: 'watch recurring mid-range current drift before escalating',
          },
        ],
      },
    },
    {
      assignedUserId: technicianUserId,
      summary: packageTwo,
      snapshot: {
        contractVersion: packageTwo.snapshotContractVersion,
        generatedAt: '2026-04-19T11:00:00.000Z',
        summary: packageTwo,
        tags: [
          {
            id: 'tag-lt-410',
            tagCode: 'LT-410',
            shortDescription: 'Tank 410 level transmitter',
            area: 'Tank Farm',
            parentAssetReference: 'tank-410',
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
            guidanceReferenceIds: ['guide-level-reference-check'],
            historySummaryId: 'history-lt-410',
          },
          {
            id: 'tag-xv-402',
            tagCode: 'XV-402',
            shortDescription: 'Tank inlet control valve with positioner',
            area: 'Tank Farm',
            parentAssetReference: 'valve-xv-402',
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
            guidanceReferenceIds: ['guide-valve-stroke-baseline'],
            historySummaryId: 'history-xv-402',
          },
        ],
        templates: [
          buildTemplate({
            id: 'tpl-level-range-check',
            instrumentFamily: 'level transmitter',
            testPattern: 'range verification',
            title: 'Level transmitter range verification',
            calculationMode: 'applied level vs output deviation',
            acceptanceStyle: 'within tolerance across low-mid-high checkpoints',
            captureSummary:
              'Capture applied low, mid, and high checkpoints and compare the observed output across the configured level range.',
            expectedLabel: 'Expected level',
            observedLabel: 'Observed output',
            minimumSubmissionEvidence: ['level checkpoints', 'output values'],
            expectedEvidence: ['reference setup note', 'supporting photo'],
            historyComparisonExpectation: 'compare repeated lower-range or upper-range bias',
          }),
          buildTemplate({
            id: 'tpl-level-basic-calibration',
            instrumentFamily: 'level transmitter',
            testPattern: 'basic calibration check',
            title: 'Level transmitter basic calibration',
            calculationMode: 'expected level vs measured output',
            acceptanceStyle: 'tolerance/pass-fail classification against configured operating range',
            captureSummary:
              'Capture calibration checkpoints and verify the measured level output against the configured reference values.',
            expectedLabel: 'Expected level',
            observedLabel: 'Measured output',
            minimumSubmissionEvidence: ['calibration checkpoints', 'measured outputs'],
            expectedEvidence: ['reference setup note', 'adjustment note'],
            historyComparisonExpectation: 'compare recurring calibration drift before recalibration',
          }),
          buildTemplate({
            id: 'tpl-level-output-verification',
            instrumentFamily: 'level transmitter',
            testPattern: 'expected-versus-measured output verification',
            title: 'Level transmitter expected-versus-measured verification',
            calculationMode: 'expected value vs measured output',
            acceptanceStyle: 'tolerance/pass-fail classification against configured operating range',
            captureSummary:
              'Capture expected level references and compare them against the observed transmitter output at each point.',
            expectedLabel: 'Expected level',
            observedLabel: 'Observed output',
            minimumSubmissionEvidence: ['expected references', 'observed outputs'],
            expectedEvidence: ['reference setup note', 'supporting photo'],
            historyComparisonExpectation: 'compare repeated bias at the same operating region',
          }),
          buildTemplate({
            id: 'tpl-valve-stroke-test',
            instrumentFamily: 'control valve with positioner',
            testPattern: 'stroke test',
            title: 'Valve stroke test',
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
              'Use concise prompts to separate positioner feedback issues from actuator movement issues.',
              'If feedback is unavailable, record that condition instead of blocking the check.',
            ],
            minimumSubmissionEvidence: [
              'commanded points',
              'observed feedback responses',
            ],
            expectedEvidence: ['supporting photo', 'positioner note'],
            historyComparisonExpectation:
              'compare repeat feedback mismatch or delayed response notes',
          }),
        ],
        guidance: [
          {
            id: 'guide-level-reference-check',
            title: 'Level reference alignment',
            version: '2026.04',
            summary: 'Confirm reference datum before concluding a transmitter range offset.',
            whyItMatters: 'Avoids documenting false deviation from incorrect tank reference.',
            sourceReference: 'TAGWISE-BP-LT-001',
          },
          {
            id: 'guide-valve-stroke-baseline',
            title: 'Valve stroke baseline',
            version: '2026.04',
            summary:
              'Observe travel smoothness and positioner response before escalating to mechanical fault.',
            whyItMatters: 'Separates feedback issues from actual valve sticking.',
            sourceReference: 'TAGWISE-BP-XV-003',
          },
        ],
        historySummaries: [
          {
            id: 'history-lt-410',
            tagId: 'tag-lt-410',
            lastObservedAt: '2026-02-28T16:05:00.000Z',
            summaryText: 'Last check noted upper-range bias during high-level verification.',
            lastResult: 'pass-with-note',
            trendHint: 'watch repeated high-end bias before recalibration',
          },
          {
            id: 'history-xv-402',
            tagId: 'tag-xv-402',
            lastObservedAt: '2026-03-22T08:20:00.000Z',
            summaryText: 'Previous stroke test returned slight opening delay but stayed acceptable.',
            lastResult: 'pass',
            trendHint: 'recheck actuator response if opening lag increases',
          },
        ],
      },
    },
  ];
}
