"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildTemplate = buildTemplate;
exports.buildPressureChecklistSteps = buildPressureChecklistSteps;
exports.buildPressureDiagnosisPrompts = buildPressureDiagnosisPrompts;
exports.buildTemperatureChecklistSteps = buildTemperatureChecklistSteps;
exports.buildTemperatureDiagnosisPrompts = buildTemperatureDiagnosisPrompts;
exports.buildLevelChecklistSteps = buildLevelChecklistSteps;
exports.buildLevelDiagnosisPrompts = buildLevelDiagnosisPrompts;
exports.buildLoopChecklistSteps = buildLoopChecklistSteps;
exports.buildLoopDiagnosisPrompts = buildLoopDiagnosisPrompts;
exports.buildValveChecklistSteps = buildValveChecklistSteps;
exports.buildValveDiagnosisPrompts = buildValveDiagnosisPrompts;
exports.buildSeedAssignedWorkPackages = buildSeedAssignedWorkPackages;
function buildNumericCaptureFields(expectedLabel, observedLabel, expectedUnit, observedUnit) {
    return [
        {
            id: 'expectedValue',
            label: expectedLabel,
            inputKind: 'numeric',
            unit: expectedUnit,
        },
        {
            id: 'observedValue',
            label: observedLabel,
            inputKind: 'numeric',
            unit: observedUnit,
        },
    ];
}
function buildTemplate(definition) {
    return {
        id: definition.id,
        instrumentFamily: definition.instrumentFamily,
        testPattern: definition.testPattern,
        title: definition.title,
        calculationMode: definition.calculationMode,
        acceptanceStyle: definition.acceptanceStyle,
        captureSummary: definition.captureSummary,
        captureFields: buildNumericCaptureFields(definition.expectedLabel, definition.observedLabel, definition.expectedUnit, definition.observedUnit),
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
function buildGuidanceItem(id, prompt, whyItMatters, helpsRuleOut, sourceReference) {
    return {
        id,
        prompt,
        whyItMatters,
        helpsRuleOut,
        sourceReference,
    };
}
function buildPressureChecklistSteps() {
    return [
        buildGuidanceItem('pressure-path-check', 'Confirm impulse path, venting, and isolation condition before treating deviation as transmitter drift.', 'This separates installation-side restriction from true transmitter error.', 'plugged impulse lines or trapped process-side pressure', 'TAGWISE-BP-PT-001'),
        buildGuidanceItem('pressure-reference-check', 'Confirm the applied reference is stable and traceable before saving the checkpoint.', 'An unstable reference can create false span error and wasted recalibration work.', 'unstable pressure source or setup error', 'TAGWISE-BP-PT-001'),
    ];
}
function buildPressureDiagnosisPrompts() {
    return [
        buildGuidanceItem('pressure-diagnosis-loop', 'If deviation grows with span, compare loop output and reference stability before recalibration.', 'Growing error across the span can come from setup or loop-side influence, not only sensor drift.', 'loop-side scaling or reference instability', 'TAGWISE-BP-PT-001'),
        buildGuidanceItem('pressure-diagnosis-repeat', 'If the result repeats the prior drift pattern, inspect sensing path and manifold condition first.', 'Repeated patterns often point to recurring field conditions rather than sudden device failure.', 'recurring manifold or impulse line problems', 'TAGWISE-BP-PT-001'),
    ];
}
function buildTemperatureChecklistSteps() {
    return [
        buildGuidanceItem('temperature-stability-check', 'Confirm the simulated or applied temperature input is stable before recording the checkpoint.', 'Stable reference input prevents false offset readings during verification.', 'unstable simulator output or changing reference conditions', 'TAGWISE-BP-TT-002'),
        buildGuidanceItem('temperature-termination-check', 'Confirm RTD or input termination is secure before treating the result as calibration drift.', 'Loose termination can mimic offset or intermittent noise during a temperature check.', 'termination, wiring, or contact resistance issues', 'TAGWISE-BP-TT-002'),
    ];
}
function buildTemperatureDiagnosisPrompts() {
    return [
        buildGuidanceItem('temperature-diagnosis-noise', 'If noise or offset appears, recheck simulator leads and terminal tightness before adjustment.', 'Basic connection issues can look like sensor or transmitter drift.', 'simulator lead or terminal-block problems', 'TAGWISE-BP-TT-002'),
        buildGuidanceItem('temperature-diagnosis-config', 'If deviation is consistent across all points, compare configuration and sensor type mapping first.', 'Consistent bias across points often indicates configuration mismatch rather than random error.', 'sensor-type or range-configuration mismatch', 'TAGWISE-BP-TT-002'),
    ];
}
function buildLevelChecklistSteps() {
    return [
        buildGuidanceItem('level-reference-check', 'Confirm the level reference datum before capturing the result.', 'Incorrect reference datum can create false upper-range or lower-range deviation.', 'incorrect tank reference or datum setup', 'TAGWISE-BP-LT-001'),
        buildGuidanceItem('level-process-condition-check', 'Confirm the process condition is settled before treating the output bias as instrument drift.', 'Unsettled process conditions can distort the comparison against the cached range.', 'transient process condition or unstable level reference', 'TAGWISE-BP-LT-001'),
    ];
}
function buildLevelDiagnosisPrompts() {
    return [
        buildGuidanceItem('level-diagnosis-high-end', 'If only high-end points shift, inspect reference datum and mounting before recalibration.', 'High-end bias often points to setup or geometry issues before device drift.', 'reference, mounting, or installation geometry issues', 'TAGWISE-BP-LT-001'),
        buildGuidanceItem('level-diagnosis-region-bias', 'If bias repeats in the same operating region, compare process conditions and signal path first.', 'Recurring regional bias usually needs field-condition review before adjustment.', 'recurring process-condition or path-related bias', 'TAGWISE-BP-LT-001'),
    ];
}
function buildLoopChecklistSteps() {
    return [
        buildGuidanceItem('loop-supply-check', 'Confirm supply, polarity, and continuity before accepting a current mismatch.', 'Simple loop-side issues can mimic instrument problems in a 4-20 mA check.', 'basic wiring, polarity, or supply faults', 'TAGWISE-BP-LOOP-001'),
        buildGuidanceItem('loop-conversion-check', 'Confirm the conversion basis and configured range before saving loop deviation.', 'A wrong conversion basis can make the current result look bad even when the device is behaving correctly.', 'range or scaling mismatch in the loop setup', 'TAGWISE-BP-LOOP-001'),
    ];
}
function buildLoopDiagnosisPrompts() {
    return [
        buildGuidanceItem('loop-diagnosis-mid-range', 'If mismatch repeats in the mid-range, compare scaling and reference injection before suspecting hardware.', 'Mid-range drift can come from setup and scaling issues, not only device failure.', 'scaling or injected-reference mismatch', 'TAGWISE-BP-LOOP-001'),
        buildGuidanceItem('loop-diagnosis-instability', 'If current is unstable, inspect power and continuity before escalating to device fault.', 'Instability across points is often caused by supply or continuity problems first.', 'power, continuity, or intermittent loop faults', 'TAGWISE-BP-LOOP-001'),
    ];
}
function buildValveChecklistSteps() {
    return [
        buildGuidanceItem('valve-path-check', 'Confirm the movement path and required permissives are clear before judging the stroke or feedback result.', 'This keeps the movement check grounded in actual field readiness before escalation.', 'blocked movement path or missing permissive conditions', 'TAGWISE-BP-XV-003'),
        buildGuidanceItem('valve-supply-feedback-check', 'Confirm actuator supply and feedback availability before concluding a valve fault.', 'Supply or indication gaps can look like travel failure when the valve is not the root cause.', 'air supply, control enable, or feedback availability issues', 'TAGWISE-BP-XV-003'),
    ];
}
function buildValveDiagnosisPrompts() {
    return [
        buildGuidanceItem('valve-diagnosis-travel-lag', 'If commanded position changes but travel lags, inspect supply and mechanical restriction before escalation.', 'Lagging response needs a quick field check before treating it as a confirmed device defect.', 'air-supply weakness or mechanical restriction', 'TAGWISE-BP-XV-003'),
        buildGuidanceItem('valve-diagnosis-feedback-mismatch', 'If feedback disagrees with travel, separate positioner or feedback issues from actuator movement first.', 'Feedback mismatch does not always mean the valve itself failed to move.', 'positioner, linkage, or feedback indication issues', 'TAGWISE-BP-XV-003'),
    ];
}
// Story 8.11 finding #7: multi-point structured history per tag. Each session
// represents one past calibration/verification visit; rows are produced per
// measurement point so the Compare screen can render a per-point variation
// timeline across past tests.
function buildPriorReadingSession(definition) {
    const span = definition.rangeMax - definition.rangeMin;
    return definition.points.map((point) => {
        const expectedValue = definition.rangeMin + (point.pointPercent / 100) * span;
        const observedValue = expectedValue + point.deviation;
        const percentOfSpan = span > 0 ? (point.deviation / span) * 100 : null;
        return {
            id: `reading-${definition.sessionId}-${point.pointPercent}`,
            tagId: definition.tagId,
            templateId: definition.templateId,
            observedAt: definition.observedAt,
            pointPercent: point.pointPercent,
            pointLabel: point.pointLabel,
            expectedValue,
            observedValue: roundReading(observedValue),
            unit: definition.unit,
            signedDeviation: roundReading(point.deviation),
            percentOfSpan: percentOfSpan === null ? null : roundReading(percentOfSpan),
            result: point.result ?? 'pass',
            technicianNote: point.technicianNote ?? null,
            supervisorNote: point.supervisorNote ?? null,
        };
    });
}
function roundReading(value) {
    return Math.round(value * 1000) / 1000;
}
function buildPackageOnePriorReadings() {
    // PT-101 pressure transmitter (0-10 bar, +/-0.25% span tolerance).
    // The drift narrative matches the historySummary trend hint: positive bias
    // builds at 75% across 3 consecutive checks before the most recent visit.
    const pt101Sessions = [
        {
            sessionId: 'pt101-2025-11',
            tagId: 'tag-pt-101',
            templateId: 'tpl-pressure-as-found',
            observedAt: '2025-11-15T09:30:00.000Z',
            unit: 'bar',
            rangeMin: 0,
            rangeMax: 10,
            points: [
                { pointPercent: 0, pointLabel: '0%', deviation: 0 },
                { pointPercent: 25, pointLabel: '25%', deviation: 0.005 },
                { pointPercent: 50, pointLabel: '50%', deviation: -0.005 },
                { pointPercent: 75, pointLabel: '75%', deviation: 0.01 },
                { pointPercent: 100, pointLabel: '100%', deviation: 0.005 },
            ],
        },
        {
            sessionId: 'pt101-2026-01',
            tagId: 'tag-pt-101',
            templateId: 'tpl-pressure-as-found',
            observedAt: '2026-01-20T10:15:00.000Z',
            unit: 'bar',
            rangeMin: 0,
            rangeMax: 10,
            points: [
                { pointPercent: 0, pointLabel: '0%', deviation: 0 },
                { pointPercent: 25, pointLabel: '25%', deviation: 0.005 },
                { pointPercent: 50, pointLabel: '50%', deviation: 0.01 },
                { pointPercent: 75, pointLabel: '75%', deviation: 0.06 },
                { pointPercent: 100, pointLabel: '100%', deviation: 0.04 },
            ],
        },
        {
            sessionId: 'pt101-2026-02',
            tagId: 'tag-pt-101',
            templateId: 'tpl-pressure-as-found',
            observedAt: '2026-02-15T11:00:00.000Z',
            unit: 'bar',
            rangeMin: 0,
            rangeMax: 10,
            points: [
                { pointPercent: 0, pointLabel: '0%', deviation: 0.005 },
                { pointPercent: 25, pointLabel: '25%', deviation: 0.01 },
                { pointPercent: 50, pointLabel: '50%', deviation: 0.02 },
                {
                    pointPercent: 75,
                    pointLabel: '75%',
                    deviation: 0.1,
                    result: 'pass-with-note',
                    technicianNote: 'Bias positivo crescente em 75%. Marcar para reavaliacao.',
                },
                { pointPercent: 100, pointLabel: '100%', deviation: 0.06 },
            ],
        },
        {
            sessionId: 'pt101-2026-03',
            tagId: 'tag-pt-101',
            templateId: 'tpl-pressure-as-found',
            observedAt: '2026-03-14T14:30:00.000Z',
            unit: 'bar',
            rangeMin: 0,
            rangeMax: 10,
            points: [
                { pointPercent: 0, pointLabel: '0%', deviation: 0.005 },
                { pointPercent: 25, pointLabel: '25%', deviation: 0.015 },
                { pointPercent: 50, pointLabel: '50%', deviation: 0.03 },
                {
                    pointPercent: 75,
                    pointLabel: '75%',
                    deviation: 0.12,
                    result: 'pass-with-note',
                    technicianNote: 'Deriva no limite em 75%. Tecnico justificou e supervisor aprovou.',
                    supervisorNote: 'Recheck em 30 dias. Investigar diafragma se padrao persistir.',
                },
                { pointPercent: 100, pointLabel: '100%', deviation: 0.07 },
            ],
        },
    ];
    // TT-205 RTD input (0-250 C, +/-0.3 C). Stable deviations; supports
    // technician confidence that the loop is steady at all 5 points.
    const tt205Sessions = [
        {
            sessionId: 'tt205-2025-11',
            tagId: 'tag-tt-205',
            templateId: 'tpl-temperature-calibration-verification',
            observedAt: '2025-11-20T08:45:00.000Z',
            unit: 'C',
            rangeMin: 0,
            rangeMax: 250,
            points: [
                { pointPercent: 0, pointLabel: '0 C', deviation: 0.05 },
                { pointPercent: 25, pointLabel: '62 C', deviation: 0.1 },
                { pointPercent: 50, pointLabel: '125 C', deviation: 0.12 },
                { pointPercent: 75, pointLabel: '188 C', deviation: 0.15 },
                { pointPercent: 100, pointLabel: '250 C', deviation: 0.1 },
            ],
        },
        {
            sessionId: 'tt205-2026-01',
            tagId: 'tag-tt-205',
            templateId: 'tpl-temperature-calibration-verification',
            observedAt: '2026-01-22T09:30:00.000Z',
            unit: 'C',
            rangeMin: 0,
            rangeMax: 250,
            points: [
                { pointPercent: 0, pointLabel: '0 C', deviation: 0.08 },
                { pointPercent: 25, pointLabel: '62 C', deviation: 0.12 },
                { pointPercent: 50, pointLabel: '125 C', deviation: 0.15 },
                { pointPercent: 75, pointLabel: '188 C', deviation: 0.18 },
                { pointPercent: 100, pointLabel: '250 C', deviation: 0.14 },
            ],
        },
        {
            sessionId: 'tt205-2026-02',
            tagId: 'tag-tt-205',
            templateId: 'tpl-temperature-calibration-verification',
            observedAt: '2026-02-12T10:00:00.000Z',
            unit: 'C',
            rangeMin: 0,
            rangeMax: 250,
            points: [
                { pointPercent: 0, pointLabel: '0 C', deviation: 0.06 },
                { pointPercent: 25, pointLabel: '62 C', deviation: 0.1 },
                { pointPercent: 50, pointLabel: '125 C', deviation: 0.13 },
                { pointPercent: 75, pointLabel: '188 C', deviation: 0.16 },
                { pointPercent: 100, pointLabel: '250 C', deviation: 0.11 },
            ],
        },
        {
            sessionId: 'tt205-2026-03',
            tagId: 'tag-tt-205',
            templateId: 'tpl-temperature-calibration-verification',
            observedAt: '2026-03-12T09:15:00.000Z',
            unit: 'C',
            rangeMin: 0,
            rangeMax: 250,
            points: [
                { pointPercent: 0, pointLabel: '0 C', deviation: 0.05 },
                { pointPercent: 25, pointLabel: '62 C', deviation: 0.09 },
                { pointPercent: 50, pointLabel: '125 C', deviation: 0.12 },
                {
                    pointPercent: 75,
                    pointLabel: '188 C',
                    deviation: 0.18,
                    technicianNote: 'Reaperto do bloco de terminais resolveu ruido intermitente.',
                },
                { pointPercent: 100, pointLabel: '250 C', deviation: 0.1 },
            ],
        },
    ];
    // AI-330 4-20 mA process loop (0-100% process, +/-1% span). Recurring mid-
    // range drift documented in the trend hint.
    const ai330Sessions = [
        {
            sessionId: 'ai330-2025-12',
            tagId: 'tag-ai-330',
            templateId: 'tpl-loop-current-vs-process',
            observedAt: '2025-12-08T14:30:00.000Z',
            unit: '%',
            rangeMin: 0,
            rangeMax: 100,
            points: [
                { pointPercent: 0, pointLabel: '0%', deviation: 0.1 },
                { pointPercent: 25, pointLabel: '25%', deviation: 0.3 },
                { pointPercent: 50, pointLabel: '50%', deviation: 0.5 },
                { pointPercent: 75, pointLabel: '75%', deviation: 0.4 },
                { pointPercent: 100, pointLabel: '100%', deviation: 0.2 },
            ],
        },
        {
            sessionId: 'ai330-2026-01',
            tagId: 'tag-ai-330',
            templateId: 'tpl-loop-current-vs-process',
            observedAt: '2026-01-25T13:00:00.000Z',
            unit: '%',
            rangeMin: 0,
            rangeMax: 100,
            points: [
                { pointPercent: 0, pointLabel: '0%', deviation: 0.1 },
                { pointPercent: 25, pointLabel: '25%', deviation: 0.3 },
                { pointPercent: 50, pointLabel: '50%', deviation: 0.7 },
                { pointPercent: 75, pointLabel: '75%', deviation: 0.4 },
                { pointPercent: 100, pointLabel: '100%', deviation: 0.2 },
            ],
        },
        {
            sessionId: 'ai330-2026-02',
            tagId: 'tag-ai-330',
            templateId: 'tpl-loop-current-vs-process',
            observedAt: '2026-02-20T12:45:00.000Z',
            unit: '%',
            rangeMin: 0,
            rangeMax: 100,
            points: [
                { pointPercent: 0, pointLabel: '0%', deviation: 0.15 },
                { pointPercent: 25, pointLabel: '25%', deviation: 0.4 },
                { pointPercent: 50, pointLabel: '50%', deviation: 0.9 },
                { pointPercent: 75, pointLabel: '75%', deviation: 0.5 },
                { pointPercent: 100, pointLabel: '100%', deviation: 0.25 },
            ],
        },
        {
            sessionId: 'ai330-2026-03',
            tagId: 'tag-ai-330',
            templateId: 'tpl-loop-current-vs-process',
            observedAt: '2026-03-18T13:10:00.000Z',
            unit: '%',
            rangeMin: 0,
            rangeMax: 100,
            points: [
                { pointPercent: 0, pointLabel: '0%', deviation: 0.2 },
                { pointPercent: 25, pointLabel: '25%', deviation: 0.5 },
                {
                    pointPercent: 50,
                    pointLabel: '50%',
                    deviation: 1.1,
                    result: 'pass-with-note',
                    technicianNote: 'Bias 50% no limite. Tecnico anexou foto da placa do isolador.',
                    supervisorNote: 'Reverificacao em 15 dias.',
                },
                { pointPercent: 75, pointLabel: '75%', deviation: 0.6 },
                { pointPercent: 100, pointLabel: '100%', deviation: 0.3 },
            ],
        },
    ];
    return [...pt101Sessions, ...tt205Sessions, ...ai330Sessions].flatMap(buildPriorReadingSession);
}
function buildPackageTwoPriorReadings() {
    // LT-410 level transmitter (0-8 m, +/-0.2% span). Upper-range bias building
    // toward the recalibration window flagged in the existing trend hint.
    const lt410Sessions = [
        {
            sessionId: 'lt410-2025-11',
            tagId: 'tag-lt-410',
            templateId: 'tpl-level-basic-calibration',
            observedAt: '2025-11-30T15:00:00.000Z',
            unit: 'm',
            rangeMin: 0,
            rangeMax: 8,
            points: [
                { pointPercent: 0, pointLabel: '0%', deviation: 0.002 },
                { pointPercent: 25, pointLabel: '25%', deviation: 0.005 },
                { pointPercent: 50, pointLabel: '50%', deviation: 0.01 },
                { pointPercent: 75, pointLabel: '75%', deviation: 0.04 },
                { pointPercent: 100, pointLabel: '100%', deviation: 0.05 },
            ],
        },
        {
            sessionId: 'lt410-2025-12',
            tagId: 'tag-lt-410',
            templateId: 'tpl-level-basic-calibration',
            observedAt: '2025-12-28T15:30:00.000Z',
            unit: 'm',
            rangeMin: 0,
            rangeMax: 8,
            points: [
                { pointPercent: 0, pointLabel: '0%', deviation: 0.003 },
                { pointPercent: 25, pointLabel: '25%', deviation: 0.006 },
                { pointPercent: 50, pointLabel: '50%', deviation: 0.015 },
                { pointPercent: 75, pointLabel: '75%', deviation: 0.06 },
                { pointPercent: 90, pointLabel: '90%', deviation: 0.09 },
            ],
        },
        {
            sessionId: 'lt410-2026-01',
            tagId: 'tag-lt-410',
            templateId: 'tpl-level-basic-calibration',
            observedAt: '2026-01-30T15:45:00.000Z',
            unit: 'm',
            rangeMin: 0,
            rangeMax: 8,
            points: [
                { pointPercent: 0, pointLabel: '0%', deviation: 0.004 },
                { pointPercent: 25, pointLabel: '25%', deviation: 0.008 },
                { pointPercent: 50, pointLabel: '50%', deviation: 0.02 },
                { pointPercent: 75, pointLabel: '75%', deviation: 0.08 },
                { pointPercent: 90, pointLabel: '90%', deviation: 0.1 },
            ],
        },
        {
            sessionId: 'lt410-2026-02',
            tagId: 'tag-lt-410',
            templateId: 'tpl-level-basic-calibration',
            observedAt: '2026-02-28T16:05:00.000Z',
            unit: 'm',
            rangeMin: 0,
            rangeMax: 8,
            points: [
                { pointPercent: 0, pointLabel: '0%', deviation: 0.005 },
                { pointPercent: 25, pointLabel: '25%', deviation: 0.01 },
                { pointPercent: 50, pointLabel: '50%', deviation: 0.025 },
                { pointPercent: 75, pointLabel: '75%', deviation: 0.1 },
                {
                    pointPercent: 90,
                    pointLabel: '90%',
                    deviation: 0.12,
                    result: 'pass-with-note',
                    technicianNote: 'Bias acima de tolerancia em 90%. Justificado por tanque em movimento.',
                    supervisorNote: 'Recalibrar na proxima janela.',
                },
            ],
        },
    ];
    // XV-402 valve stroke test (0-100% position). Commanded vs observed travel
    // at the three stroke checkpoints with steady positioner response.
    const xv402Sessions = [
        {
            sessionId: 'xv402-2025-12',
            tagId: 'tag-xv-402',
            templateId: 'tpl-valve-stroke-test',
            observedAt: '2025-12-22T08:00:00.000Z',
            unit: '%',
            rangeMin: 0,
            rangeMax: 100,
            points: [
                { pointPercent: 0, pointLabel: 'Fechado', deviation: 0.5 },
                { pointPercent: 50, pointLabel: 'Meio curso', deviation: 1.2 },
                { pointPercent: 100, pointLabel: 'Aberto', deviation: 0.8 },
            ],
        },
        {
            sessionId: 'xv402-2026-01',
            tagId: 'tag-xv-402',
            templateId: 'tpl-valve-stroke-test',
            observedAt: '2026-01-20T08:15:00.000Z',
            unit: '%',
            rangeMin: 0,
            rangeMax: 100,
            points: [
                { pointPercent: 0, pointLabel: 'Fechado', deviation: 0.6 },
                { pointPercent: 50, pointLabel: 'Meio curso', deviation: 1.3 },
                { pointPercent: 100, pointLabel: 'Aberto', deviation: 0.9 },
            ],
        },
        {
            sessionId: 'xv402-2026-02',
            tagId: 'tag-xv-402',
            templateId: 'tpl-valve-stroke-test',
            observedAt: '2026-02-22T08:10:00.000Z',
            unit: '%',
            rangeMin: 0,
            rangeMax: 100,
            points: [
                { pointPercent: 0, pointLabel: 'Fechado', deviation: 0.7 },
                { pointPercent: 50, pointLabel: 'Meio curso', deviation: 1.4 },
                { pointPercent: 100, pointLabel: 'Aberto', deviation: 1.0 },
            ],
        },
        {
            sessionId: 'xv402-2026-03',
            tagId: 'tag-xv-402',
            templateId: 'tpl-valve-stroke-test',
            observedAt: '2026-03-22T08:20:00.000Z',
            unit: '%',
            rangeMin: 0,
            rangeMax: 100,
            points: [
                { pointPercent: 0, pointLabel: 'Fechado', deviation: 0.8 },
                { pointPercent: 50, pointLabel: 'Meio curso', deviation: 1.5 },
                { pointPercent: 100, pointLabel: 'Aberto', deviation: 1.1 },
            ],
        },
    ];
    return [...lt410Sessions, ...xv402Sessions].flatMap(buildPriorReadingSession);
}
function buildSeedAssignedWorkPackages(technicianUserId) {
    // Story 11.4 (issues #3A / #4A): make seed timestamps relative to the
    // current server boot so the 24h-staleness check in the mobile shell
    // (localTagContextService + history risk item) does not fire for demo
    // packages. Previously the timestamps were hard-coded to 2026-04-19,
    // which is older than 24h on every boot after that day. The
    // technician then saw "Desatualizado" / "Historico local desatualizado"
    // immediately after a fresh download, which contradicts the demo
    // intent.
    const now = new Date();
    const nowIso = now.toISOString();
    const startOfToday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 8, 0, 0)).toISOString();
    const endOfToday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 17, 0, 0)).toISOString();
    const packageOne = {
        id: 'wp-seed-1001',
        sourceReference: 'seed-cmms-1001',
        title: 'North Process Loop Verification',
        assignedTeam: 'Instrumentation Alpha',
        priority: 'high',
        status: 'assigned',
        packageVersion: 4,
        snapshotContractVersion: '2026-04-v1',
        tagCount: 3,
        dueWindow: {
            startsAt: startOfToday,
            endsAt: endOfToday,
        },
        updatedAt: nowIso,
    };
    const packageTwo = {
        id: 'wp-seed-1002',
        sourceReference: 'seed-cmms-1002',
        title: 'Tank Farm Level and Valve Checks',
        assignedTeam: 'Instrumentation Alpha',
        priority: 'routine',
        status: 'assigned',
        packageVersion: 4,
        snapshotContractVersion: '2026-04-v1',
        tagCount: 2,
        dueWindow: {
            startsAt: startOfToday,
            endsAt: endOfToday,
        },
        updatedAt: nowIso,
    };
    return [
        {
            assignedUserId: technicianUserId,
            summary: packageOne,
            snapshot: {
                contractVersion: packageOne.snapshotContractVersion,
                generatedAt: nowIso,
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
                        // Story 10.3 (issue #3): trimmed to 3 templates per instrument
                        // (Comparacao no campo, Injecao via calibrador para SCADA,
                        // Teste de loop). Dropped tpl-temperature-range-check because
                        // it duplicated the expected-vs-measured single-point pattern
                        // that tpl-temperature-calibration-verification already covers.
                        templateIds: [
                            'tpl-temperature-calibration-verification',
                            'tpl-temperature-input-simulation',
                            'tpl-temperature-loop-range',
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
                        // Story 10.3 (issue #3): trimmed to 2 templates for the 4-20 mA
                        // loop family because the family IS itself the loop (so there
                        // is no separate "Teste de loop" entry). Dropped
                        // tpl-loop-signal-validation because it duplicated the
                        // expected-vs-measured single-point pattern that the other two
                        // already provide.
                        templateIds: [
                            'tpl-loop-integrity-check',
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
                        title: 'Comparacao no campo',
                        calculationMode: 'point deviation by span',
                        acceptanceStyle: 'within tolerance by point and overall span',
                        captureSummary: 'Capture structured pressure checkpoints before recalibration and compare measured versus expected values.',
                        expectedLabel: 'Expected pressure',
                        observedLabel: 'Measured pressure',
                        checklistSteps: buildPressureChecklistSteps(),
                        guidedDiagnosisPrompts: buildPressureDiagnosisPrompts(),
                        minimumSubmissionEvidence: ['as-found readings', 'instrument note'],
                        expectedEvidence: ['supporting photo', 'loop condition note'],
                        historyComparisonExpectation: 'compare last approved span error and repeated drift',
                    }),
                    buildTemplate({
                        id: 'tpl-pressure-as-left',
                        instrumentFamily: 'pressure transmitter',
                        testPattern: 'as-left calibration check',
                        title: 'Injecao via calibrador para SCADA',
                        calculationMode: 'point deviation by span',
                        acceptanceStyle: 'within tolerance by point and overall span',
                        captureSummary: 'Capture post-adjustment pressure checkpoints and confirm the final instrument state against expected values.',
                        expectedLabel: 'Expected pressure',
                        observedLabel: 'Measured pressure',
                        checklistSteps: buildPressureChecklistSteps(),
                        guidedDiagnosisPrompts: buildPressureDiagnosisPrompts(),
                        minimumSubmissionEvidence: ['as-left readings', 'adjustment note'],
                        expectedEvidence: ['supporting photo', 'adjustment reference note'],
                        historyComparisonExpectation: 'compare final result against last approved as-left check',
                    }),
                    buildTemplate({
                        id: 'tpl-pressure-loop-range',
                        instrumentFamily: 'pressure transmitter',
                        testPattern: 'loop verification against expected range',
                        title: 'Teste de loop',
                        calculationMode: 'expected range vs measured loop output',
                        acceptanceStyle: 'within tolerance across expected range checkpoints',
                        captureSummary: 'Capture applied checkpoints and confirm the loop output against the expected operating range.',
                        expectedLabel: 'Expected loop value',
                        observedLabel: 'Measured loop value',
                        checklistSteps: buildPressureChecklistSteps(),
                        guidedDiagnosisPrompts: buildPressureDiagnosisPrompts(),
                        minimumSubmissionEvidence: ['loop checkpoints', 'measured outputs'],
                        expectedEvidence: ['reference source note', 'supporting photo'],
                        historyComparisonExpectation: 'compare repeated loop or configuration drift at tested points',
                    }),
                    buildTemplate({
                        id: 'tpl-temperature-input-simulation',
                        instrumentFamily: 'temperature transmitter / RTD input',
                        testPattern: 'input simulation check',
                        title: 'Injecao via calibrador para SCADA',
                        calculationMode: 'simulated input vs reported output',
                        acceptanceStyle: 'point deviation across expected RTD inputs',
                        captureSummary: 'Capture simulated temperature or RTD checkpoints and compare the reported output at each point.',
                        expectedLabel: 'Simulated input',
                        observedLabel: 'Reported output',
                        checklistSteps: buildTemperatureChecklistSteps(),
                        guidedDiagnosisPrompts: buildTemperatureDiagnosisPrompts(),
                        minimumSubmissionEvidence: ['simulated inputs', 'reported outputs'],
                        expectedEvidence: ['input source note', 'supporting photo'],
                        historyComparisonExpectation: 'compare last approved zero/span drift pattern',
                    }),
                    buildTemplate({
                        id: 'tpl-temperature-calibration-verification',
                        instrumentFamily: 'temperature transmitter / RTD input',
                        testPattern: 'calibration verification',
                        title: 'Comparacao no campo',
                        calculationMode: 'expected temperature vs measured output',
                        acceptanceStyle: 'tolerance-based pass/fail with clear deviation display',
                        captureSummary: 'Capture calibration checkpoints and verify the measured output against the expected temperature values.',
                        expectedLabel: 'Expected temperature',
                        observedLabel: 'Measured output',
                        checklistSteps: buildTemperatureChecklistSteps(),
                        guidedDiagnosisPrompts: buildTemperatureDiagnosisPrompts(),
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
                        captureSummary: 'Capture expected and measured range checkpoints to verify the transmitter across the configured operating band.',
                        expectedLabel: 'Expected temperature',
                        observedLabel: 'Measured output',
                        checklistSteps: buildTemperatureChecklistSteps(),
                        guidedDiagnosisPrompts: buildTemperatureDiagnosisPrompts(),
                        minimumSubmissionEvidence: ['range checkpoints', 'measured outputs'],
                        expectedEvidence: ['input source note', 'supporting photo'],
                        historyComparisonExpectation: 'compare comparable temperature verification results when available',
                    }),
                    // Story 8.12 finding #4: every 4-20 mA ranged instrument needs an
                    // explicit loop-test sweep template so the technician can run a
                    // 0/25/50/75/100% verification across the configured range.
                    buildTemplate({
                        id: 'tpl-temperature-loop-range',
                        instrumentFamily: 'temperature transmitter / RTD input',
                        testPattern: 'loop verification across configured range',
                        title: 'Teste de loop',
                        calculationMode: 'expected output vs measured output across loop range',
                        acceptanceStyle: 'within tolerance at each loop checkpoint',
                        captureSummary: 'Capture 0/25/50/75/100% temperature checkpoints and verify the loop output across the configured operating range.',
                        expectedLabel: 'Expected temperature',
                        observedLabel: 'Measured output',
                        checklistSteps: buildTemperatureChecklistSteps(),
                        guidedDiagnosisPrompts: buildTemperatureDiagnosisPrompts(),
                        minimumSubmissionEvidence: ['loop checkpoints', 'measured outputs'],
                        expectedEvidence: ['reference source note', 'supporting photo'],
                        historyComparisonExpectation: 'compare repeated loop drift at the same checkpoints',
                    }),
                    // Story 8.13 finding #1: this template was previously titled
                    // "Analog loop integrity check" which made the visual pattern
                    // resolver classify it as a loop-test and route it through
                    // LoopExecutionScreen. Renamed to "Analog continuity check"
                    // so it routes through the single-point calculation screen;
                    // the dedicated loop sweep lives in tpl-loop-current-vs-process.
                    buildTemplate({
                        id: 'tpl-loop-integrity-check',
                        instrumentFamily: 'analog 4-20 mA loop',
                        testPattern: 'continuity verification at zero point',
                        title: 'Continuidade no campo',
                        calculationMode: 'expected current vs measured current at zero point',
                        acceptanceStyle: 'within tolerance at the zero checkpoint',
                        captureSummary: 'Capture expected and measured current at the zero checkpoint to verify analog continuity and stable signal transfer.',
                        expectedLabel: 'Expected current',
                        observedLabel: 'Measured current',
                        expectedUnit: 'mA',
                        observedUnit: 'mA',
                        calculationRangeOverride: { min: 4, max: 20, unit: 'mA' },
                        conversionBasisSummary: 'Linear 4-20 mA conversion derived from the configured process range.',
                        expectedRangeSummary: '0 to 100 % maps to 4-20 mA.',
                        checklistSteps: buildLoopChecklistSteps(),
                        guidedDiagnosisPrompts: buildLoopDiagnosisPrompts(),
                        minimumSubmissionEvidence: ['loop checkpoints', 'measured current values'],
                        expectedEvidence: ['supply/continuity note', 'supporting photo'],
                        historyComparisonExpectation: 'compare repeated continuity loss, instability, or loop drift at the same checkpoints',
                    }),
                    buildTemplate({
                        // Story 8.13 finding #1: renamed from "Analog loop signal
                        // validation" so the visual pattern resolver routes this
                        // through the single-point calculation screen instead of
                        // the loop-test screen. The dedicated loop sweep is in
                        // tpl-loop-current-vs-process below.
                        id: 'tpl-loop-signal-validation',
                        instrumentFamily: 'analog 4-20 mA loop',
                        testPattern: 'signal validation at span point',
                        title: 'Analog signal validation at span',
                        calculationMode: 'expected current vs measured current at span',
                        acceptanceStyle: 'tolerance-based pass/fail at the span checkpoint',
                        captureSummary: 'Capture expected and measured current at the span checkpoint to verify analog signal integrity against the configured process range.',
                        expectedLabel: 'Expected current',
                        observedLabel: 'Measured current',
                        expectedUnit: 'mA',
                        observedUnit: 'mA',
                        calculationRangeOverride: { min: 4, max: 20, unit: 'mA' },
                        conversionBasisSummary: 'Linear 4-20 mA conversion derived from the configured process range.',
                        expectedRangeSummary: '0 to 100 % maps to 4-20 mA.',
                        checklistSteps: buildLoopChecklistSteps(),
                        guidedDiagnosisPrompts: buildLoopDiagnosisPrompts(),
                        minimumSubmissionEvidence: ['validated current points', 'process reference note'],
                        expectedEvidence: ['input source note', 'supporting photo'],
                        historyComparisonExpectation: 'compare repeated signal validation drift or intermittent response',
                    }),
                    buildTemplate({
                        id: 'tpl-loop-current-vs-process',
                        instrumentFamily: 'analog 4-20 mA loop',
                        testPattern: 'expected current versus process value verification',
                        title: 'Injecao via calibrador para SCADA',
                        calculationMode: 'expected current vs measured current',
                        acceptanceStyle: 'deviation and tolerance outcome against the configured conversion basis',
                        captureSummary: 'Capture the expected loop current derived from the process value basis and compare it against the observed loop current.',
                        expectedLabel: 'Expected current',
                        observedLabel: 'Measured current',
                        expectedUnit: 'mA',
                        observedUnit: 'mA',
                        calculationRangeOverride: { min: 4, max: 20, unit: 'mA' },
                        conversionBasisSummary: 'Expected current is derived from the configured process range using a linear 4-20 mA conversion basis.',
                        expectedRangeSummary: '0 to 100 % process value range / 4-20 mA signal range.',
                        checklistSteps: buildLoopChecklistSteps(),
                        guidedDiagnosisPrompts: buildLoopDiagnosisPrompts(),
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
                        summary: 'Confirm impulse path and vent condition before accepting transmitter deviation as instrument fault.',
                        whyItMatters: 'Rules out process-side restriction before calibration decisions.',
                        sourceReference: 'TAGWISE-BP-PT-001',
                    },
                    {
                        id: 'guide-rtd-input-check',
                        title: 'RTD input verification baseline',
                        version: '2026.04',
                        summary: 'Validate simulated sensor input stability before documenting transmitter offset.',
                        whyItMatters: 'Reduces false adjustment caused by unstable simulator or loose termination.',
                        sourceReference: 'TAGWISE-BP-TT-002',
                    },
                    {
                        id: 'guide-loop-integrity-check',
                        title: 'Analog loop integrity baseline',
                        version: '2026.04',
                        summary: 'Confirm supply, polarity, and continuity before accepting a loop deviation as a device fault.',
                        whyItMatters: 'Separates instrument issues from simple wiring or supply-side problems.',
                        sourceReference: 'TAGWISE-BP-LOOP-001',
                    },
                ],
                historySummaries: [
                    // Story 8.8 data realism: enrich history summaries with measured
                    // values so the technician can verify the comparison screen against
                    // realistic prior calibration data. The structure remains the same
                    // (a single summary per tag); the freeform narrative now contains
                    // explicit point/value pairs and decision context.
                    {
                        id: 'history-pt-101',
                        tagId: 'tag-pt-101',
                        lastObservedAt: '2026-03-14T14:30:00.000Z',
                        summaryText: 'Calibracao aprovada com observacao em 2026-03-14. Ponto 75%: medido 7,62 bar vs esperado 7,50 bar (+0,12 bar, dentro de +/-0,25% span). Supervisor aprovou apos justificativa do tecnico. Recomendou novo check em 30 dias.',
                        lastResult: 'pass-with-note',
                        trendHint: 'Deriva positiva acima da meia escala em 3 checks consecutivos. Investigar diafragma se padrao persistir.',
                    },
                    {
                        id: 'history-tt-205',
                        tagId: 'tag-tt-205',
                        lastObservedAt: '2026-03-12T09:15:00.000Z',
                        summaryText: 'Verificacao RTD aprovada em 2026-03-12. Pontos 0/25/50/75/100 C dentro de +/-0,3 C (desvio max +0,18 C @ 75 C). Bloco de terminais reapertado apos ruido intermitente; supervisor aprovou sem observacao.',
                        lastResult: 'pass',
                        trendHint: 'Reaperto resolveu ruido. Repetir check de fiacao se ruido reaparecer no proximo ciclo.',
                    },
                    {
                        id: 'history-ai-330',
                        tagId: 'tag-ai-330',
                        lastObservedAt: '2026-03-18T13:10:00.000Z',
                        summaryText: 'Validacao de loop 4-20 mA com observacao em 2026-03-18. Em 50%: medido 12,18 mA vs esperado 12,00 mA (+0,18 mA, ~1,1% span, no limite). Tecnico anexou foto da placa do isolador. Supervisor aprovou e marcou para reverificacao em 15 dias.',
                        lastResult: 'pass-with-note',
                        trendHint: 'Deriva recorrente em meio de faixa. Escalar se proximo check apresentar mesma tendencia.',
                    },
                ],
                priorTestReadings: buildPackageOnePriorReadings(),
            },
        },
        {
            assignedUserId: technicianUserId,
            summary: packageTwo,
            snapshot: {
                contractVersion: packageTwo.snapshotContractVersion,
                generatedAt: nowIso,
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
                        // Story 10.3 (issue #3): trimmed to 3 templates per instrument.
                        // Dropped tpl-level-range-check because it duplicated the
                        // expected-vs-measured single-point pattern that
                        // tpl-level-basic-calibration already covers.
                        templateIds: [
                            'tpl-level-basic-calibration',
                            'tpl-level-output-verification',
                            'tpl-level-loop-range',
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
                        captureSummary: 'Capture applied low, mid, and high checkpoints and compare the observed output across the configured level range.',
                        expectedLabel: 'Expected level',
                        observedLabel: 'Observed output',
                        checklistSteps: buildLevelChecklistSteps(),
                        guidedDiagnosisPrompts: buildLevelDiagnosisPrompts(),
                        minimumSubmissionEvidence: ['level checkpoints', 'output values'],
                        expectedEvidence: ['reference setup note', 'supporting photo'],
                        historyComparisonExpectation: 'compare repeated lower-range or upper-range bias',
                    }),
                    buildTemplate({
                        id: 'tpl-level-basic-calibration',
                        instrumentFamily: 'level transmitter',
                        testPattern: 'basic calibration check',
                        title: 'Comparacao no campo',
                        calculationMode: 'expected level vs measured output',
                        acceptanceStyle: 'tolerance/pass-fail classification against configured operating range',
                        captureSummary: 'Capture calibration checkpoints and verify the measured level output against the configured reference values.',
                        expectedLabel: 'Expected level',
                        observedLabel: 'Measured output',
                        checklistSteps: buildLevelChecklistSteps(),
                        guidedDiagnosisPrompts: buildLevelDiagnosisPrompts(),
                        minimumSubmissionEvidence: ['calibration checkpoints', 'measured outputs'],
                        expectedEvidence: ['reference setup note', 'adjustment note'],
                        historyComparisonExpectation: 'compare recurring calibration drift before recalibration',
                    }),
                    buildTemplate({
                        id: 'tpl-level-output-verification',
                        instrumentFamily: 'level transmitter',
                        testPattern: 'expected-versus-measured output verification',
                        title: 'Injecao via calibrador para SCADA',
                        calculationMode: 'expected value vs measured output',
                        acceptanceStyle: 'tolerance/pass-fail classification against configured operating range',
                        captureSummary: 'Capture expected level references and compare them against the observed transmitter output at each point.',
                        expectedLabel: 'Expected level',
                        observedLabel: 'Observed output',
                        checklistSteps: buildLevelChecklistSteps(),
                        guidedDiagnosisPrompts: buildLevelDiagnosisPrompts(),
                        minimumSubmissionEvidence: ['expected references', 'observed outputs'],
                        expectedEvidence: ['reference setup note', 'supporting photo'],
                        historyComparisonExpectation: 'compare repeated bias at the same operating region',
                    }),
                    // Story 8.12 finding #4: explicit loop-test sweep template for the
                    // level transmitter so the technician can run a 0/25/50/75/100%
                    // verification across the configured 0-8 m range.
                    buildTemplate({
                        id: 'tpl-level-loop-range',
                        instrumentFamily: 'level transmitter',
                        testPattern: 'loop verification across configured range',
                        title: 'Teste de loop',
                        calculationMode: 'expected level vs measured output across loop range',
                        acceptanceStyle: 'within tolerance at each loop checkpoint',
                        captureSummary: 'Capture 0/25/50/75/100% level checkpoints and verify the loop output across the configured operating range.',
                        expectedLabel: 'Expected level',
                        observedLabel: 'Measured output',
                        checklistSteps: buildLevelChecklistSteps(),
                        guidedDiagnosisPrompts: buildLevelDiagnosisPrompts(),
                        minimumSubmissionEvidence: ['loop checkpoints', 'measured outputs'],
                        expectedEvidence: ['reference setup note', 'supporting photo'],
                        historyComparisonExpectation: 'compare repeated loop drift at the same checkpoints',
                    }),
                    buildTemplate({
                        id: 'tpl-valve-stroke-test',
                        instrumentFamily: 'control valve with positioner',
                        testPattern: 'stroke test',
                        title: 'Teste de stroke',
                        calculationMode: 'commanded position vs observed travel',
                        acceptanceStyle: 'pass/fail classification at commanded movement checkpoints',
                        captureSummary: 'Capture commanded open, mid, and closed checkpoints and compare the observed travel response at each stroke point.',
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
                    buildTemplate({
                        id: 'tpl-valve-position-feedback-verification',
                        instrumentFamily: 'control valve with positioner',
                        testPattern: 'position feedback verification',
                        title: 'Feedback do posicionador',
                        calculationMode: 'commanded position vs observed travel',
                        acceptanceStyle: 'pass/fail classification at commanded feedback checkpoints',
                        captureSummary: 'Capture commanded position checkpoints and compare them against the observed position feedback response.',
                        expectedLabel: 'Commanded position',
                        observedLabel: 'Observed feedback',
                        checklistPrompts: [
                            'Confirm feedback indication is available before treating the issue as a travel fault.',
                            'Use concise prompts to separate positioner feedback issues from actuator movement issues.',
                            'If feedback is unavailable, record that condition instead of blocking the check.',
                        ],
                        checklistSteps: buildValveChecklistSteps(),
                        guidedDiagnosisPrompts: buildValveDiagnosisPrompts(),
                        minimumSubmissionEvidence: [
                            'commanded points',
                            'observed feedback responses',
                        ],
                        expectedEvidence: ['supporting photo', 'positioner note'],
                        historyComparisonExpectation: 'compare repeat feedback mismatch or delayed response notes',
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
                        summary: 'Observe travel smoothness and positioner response before escalating to mechanical fault.',
                        whyItMatters: 'Separates feedback issues from actual valve sticking.',
                        sourceReference: 'TAGWISE-BP-XV-003',
                    },
                ],
                historySummaries: [
                    {
                        id: 'history-lt-410',
                        tagId: 'tag-lt-410',
                        lastObservedAt: '2026-02-28T16:05:00.000Z',
                        summaryText: 'Verificacao de nivel aprovada com observacao em 2026-02-28. Em 90% da faixa: medido 6,12 m vs esperado 6,00 m (+0,12 m, +2,0%, acima de tolerancia 1%). Tecnico justificou como condicao do tanque em movimento. Supervisor aprovou e marcou para recalibracao na proxima janela.',
                        lastResult: 'pass-with-note',
                        trendHint: 'Bias positivo em extremo superior em 2 checks. Recalibrar antes da proxima campanha.',
                    },
                    {
                        id: 'history-xv-402',
                        tagId: 'tag-xv-402',
                        lastObservedAt: '2026-03-22T08:20:00.000Z',
                        summaryText: 'Teste de stroke da valvula aprovado em 2026-03-22. Tempo de abertura 0-100%: 3,8 s (limite 4,0 s). Retracao 100-0%: 3,1 s. Posicionador respondeu sem oscilacao em ambos os sentidos. Sem comentarios adicionais do supervisor.',
                        lastResult: 'pass',
                        trendHint: 'Resposta dentro do limite. Reavaliar tempo de abertura se ultrapassar 4 s no proximo check.',
                    },
                ],
                priorTestReadings: buildPackageTwoPriorReadings(),
            },
        },
    ];
}
