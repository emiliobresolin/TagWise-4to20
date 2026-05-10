import type {
  SharedExecutionCalculationAcceptance,
  SharedExecutionCalculationDefinition,
  SharedExecutionCalculationRange,
  SharedExecutionCalculationState,
  SharedExecutionChecklistItem,
  SharedExecutionField,
  SharedExecutionGuidanceItem,
  SharedExecutionLinkedGuidanceSnippet,
  SharedExecutionRiskItem,
  SharedExecutionShell,
} from '../execution/model';

export type VisualExecutionSeverity = 'high' | 'medium' | 'low' | 'ok' | 'due';

export interface VisualExecutionCalculationViewModel {
  state: 'available' | 'unavailable';
  tagCode: string;
  templateTitle: string;
  modeLabel: string;
  acceptanceLabel: string;
  expectedLabel: string;
  observedLabel: string;
  expectedValue: string;
  observedValue: string;
  unitLabel: string;
  rangeLabel: string;
  toleranceLabel: string;
  conversionBasisLabel: string;
  expectedRangeLabel: string;
  result: {
    signedDeviationLabel: string;
    absoluteDeviationLabel: string;
    percentOfSpanLabel: string;
    acceptanceLabel: string;
    acceptanceSeverity: VisualExecutionSeverity;
    acceptanceReason: string;
  } | null;
  updatedAtLabel: string;
  editable: boolean;
  conversion: VisualLoopConversionMetadata;
  unavailableReason: string | null;
}

export interface VisualLoopConversionMetadata {
  state: 'available' | 'unavailable';
  reason: string;
  basisLabel: string;
  processRange: SharedExecutionCalculationRange | null;
  loopRange: SharedExecutionCalculationRange | null;
}

export type VisualLoopConversionMode =
  | 'process-to-milliamp'
  | 'milliamp-to-process'
  | 'milliamp-to-percent'
  | 'percent-to-milliamp';

export interface VisualLoopConversionResult {
  state: 'available' | 'unavailable';
  label: string;
  detail: string;
  value: number | null;
}

export interface VisualExecutionHistoryRow {
  label: string;
  value: string;
  stateLabel: string;
  severity: VisualExecutionSeverity;
}

export interface VisualExecutionHistoryViewModel {
  state: 'available' | 'missing' | 'unavailable';
  tagCode: string;
  title: string;
  summary: string;
  detail: string;
  currentResultLabel: string;
  currentResultSeverity: VisualExecutionSeverity;
  historyStateLabel: string;
  rows: VisualExecutionHistoryRow[];
  unavailableReason: string | null;
}

export interface VisualExecutionGuidanceViewModel {
  state: 'available' | 'missing' | 'unavailable';
  tagCode: string;
  title: string;
  summary: string;
  detail: string;
  checklistItems: SharedExecutionChecklistItem[];
  guidedDiagnosisPrompts: SharedExecutionGuidanceItem[];
  linkedGuidance: SharedExecutionLinkedGuidanceSnippet[];
  riskItems: SharedExecutionRiskItem[];
  observationNotes: string;
  guidanceEvidenceSavedAtLabel: string;
  riskStateLabel: string;
  riskSeverity: VisualExecutionSeverity;
  submitReadinessLabel: string;
  submitReadinessSeverity: VisualExecutionSeverity;
  editable: boolean;
  unavailableReason: string | null;
}

const unavailableConversion: VisualLoopConversionMetadata = {
  state: 'unavailable',
  reason: '4-20 mA conversion metadata is not available for this selected template.',
  basisLabel: 'Unavailable',
  processRange: null,
  loopRange: null,
};

export function buildVisualExecutionCalculation(
  shell: SharedExecutionShell | null,
): VisualExecutionCalculationViewModel {
  if (!shell?.calculation) {
    return {
      state: 'unavailable',
      tagCode: shell?.tagCode ?? 'No tag selected',
      templateTitle: shell?.template.title ?? 'No execution template loaded',
      modeLabel: 'Unavailable',
      acceptanceLabel: 'Unavailable',
      expectedLabel: 'Expected value',
      observedLabel: 'Observed value',
      expectedValue: '',
      observedValue: '',
      unitLabel: 'Unavailable',
      rangeLabel: 'Unavailable',
      toleranceLabel: 'Unavailable',
      conversionBasisLabel: 'Unavailable',
      expectedRangeLabel: 'Unavailable',
      result: null,
      updatedAtLabel: 'Not saved yet',
      editable: false,
      conversion: unavailableConversion,
      unavailableReason:
        'Load a local execution template for the selected tag before entering readings.',
    };
  }

  const calculation = shell.calculation;
  const definition = calculation.definition;

  return {
    state: 'available',
    tagCode: shell.tagCode,
    templateTitle: shell.template.title,
    modeLabel: definition.modeLabel,
    acceptanceLabel: definition.acceptanceLabel,
    expectedLabel: definition.expectedLabel,
    observedLabel: definition.observedLabel,
    expectedValue: calculation.rawInputs.expectedValue,
    observedValue: calculation.rawInputs.observedValue,
    unitLabel: definition.unit ?? 'Local unit unavailable',
    rangeLabel: formatRange(definition.calculationRange),
    toleranceLabel: formatTolerance(definition),
    conversionBasisLabel:
      definition.executionContext.conversionBasisSummary ?? 'No conversion basis declared',
    expectedRangeLabel:
      definition.executionContext.expectedRangeSummary ?? 'No expected range declared',
    result: buildCalculationResult(calculation),
    updatedAtLabel: calculation.updatedAt ? formatTimestamp(calculation.updatedAt) : 'Not saved yet',
    editable: shell.report.state === 'technician-owned-draft',
    conversion: resolveLoopConversionMetadata(definition),
    unavailableReason: null,
  };
}

export function buildVisualExecutionHistory(
  shell: SharedExecutionShell | null,
): VisualExecutionHistoryViewModel {
  const historyStep = shell?.steps.find((step) => step.kind === 'history') ?? null;

  if (!shell || !historyStep) {
    return {
      state: 'unavailable',
      tagCode: shell?.tagCode ?? 'No tag selected',
      title: 'History comparison unavailable',
      summary: 'No local execution shell history step is loaded.',
      detail: 'The technician can continue, but no cached history comparison is available here.',
      currentResultLabel: 'Not entered yet',
      currentResultSeverity: 'medium',
      historyStateLabel: 'Unavailable',
      rows: [],
      unavailableReason:
        'Load a local execution template for the selected tag before comparing history.',
    };
  }

  const historyStateField = historyStep.fields.find((field) => field.label === 'History state');
  const currentResultField = historyStep.fields.find((field) => field.label === 'Current result');
  const currentAcceptance = shell.calculation?.result?.acceptance ?? 'unavailable';

  return {
    state: mapHistoryState(shell.riskInputs.historyState),
    tagCode: shell.tagCode,
    title: historyStep.title,
    summary: historyStep.summary,
    detail: historyStep.detail,
    currentResultLabel: currentResultField?.value ?? 'Not entered yet',
    currentResultSeverity: acceptanceSeverity(currentAcceptance),
    historyStateLabel: historyStateField?.value ?? toHistoryStateLabel(shell.riskInputs.historyState),
    rows: historyStep.fields.map(mapHistoryRow),
    unavailableReason: null,
  };
}

export function buildVisualExecutionGuidance(
  shell: SharedExecutionShell | null,
): VisualExecutionGuidanceViewModel {
  const guidanceStep = shell?.steps.find((step) => step.kind === 'guidance') ?? null;

  if (!shell || !guidanceStep) {
    return {
      state: 'unavailable',
      tagCode: shell?.tagCode ?? 'No tag selected',
      title: 'Checklist and guidance unavailable',
      summary: 'No local execution shell guidance step is loaded.',
      detail: 'The technician can continue, but no cached checklist or references are available here.',
      checklistItems: [],
      guidedDiagnosisPrompts: [],
      linkedGuidance: [],
      riskItems: [],
      observationNotes: '',
      guidanceEvidenceSavedAtLabel: 'Not saved yet',
      riskStateLabel: 'Unavailable',
      riskSeverity: 'medium',
      submitReadinessLabel: 'Unavailable',
      submitReadinessSeverity: 'medium',
      editable: false,
      unavailableReason:
        'Load a local execution template for the selected tag before using checklist guidance.',
    };
  }

  return {
    state: mapGuidanceState(shell.guidance),
    tagCode: shell.tagCode,
    title: guidanceStep.title,
    summary: guidanceStep.summary,
    detail: guidanceStep.detail,
    checklistItems: shell.guidance.checklistItems,
    guidedDiagnosisPrompts: shell.guidance.guidedDiagnosisPrompts,
    linkedGuidance: shell.guidance.linkedGuidance,
    riskItems: shell.guidance.riskItems,
    observationNotes: shell.evidence.observationNotes,
    guidanceEvidenceSavedAtLabel: shell.evidence.guidanceEvidenceUpdatedAt
      ? formatTimestamp(shell.evidence.guidanceEvidenceUpdatedAt)
      : 'Not saved yet',
    riskStateLabel:
      shell.guidance.riskState === 'flagged' ? 'Visible risk flagged' : 'No visible risk flagged',
    riskSeverity: shell.guidance.riskState === 'flagged' ? 'due' : 'ok',
    submitReadinessLabel:
      shell.guidance.submitReadiness === 'blocked'
        ? 'Submit-blocking hooks active'
        : 'No submit-blocking hooks active',
    submitReadinessSeverity: shell.guidance.submitReadiness === 'blocked' ? 'due' : 'ok',
    editable: shell.report.state === 'technician-owned-draft',
    unavailableReason: null,
  };
}

export function resolveLoopConversionMetadata(
  definition: SharedExecutionCalculationDefinition,
): VisualLoopConversionMetadata {
  const basisText = [
    definition.executionContext.conversionBasisSummary,
    definition.executionContext.expectedRangeSummary,
    definition.calculationRange?.unit,
  ]
    .filter(Boolean)
    .join(' ');
  const hasLoopBasis = /4\s*(?:-|to|a)\s*20\s*m?A/i.test(basisText);

  if (!hasLoopBasis) {
    return unavailableConversion;
  }

  const processRange = resolveProcessRange(definition);

  return {
    state: 'available',
    reason: '4-20 mA conversion metadata is available locally for this selected template.',
    basisLabel: definition.executionContext.conversionBasisSummary ?? '4-20 mA loop',
    processRange,
    loopRange: {
      min: 4,
      max: 20,
      unit: 'mA',
    },
  };
}

export function convertLoopValue(
  metadata: VisualLoopConversionMetadata,
  mode: VisualLoopConversionMode,
  rawValue: string,
): VisualLoopConversionResult {
  if (metadata.state !== 'available' || !metadata.loopRange) {
    return unavailableResult(metadata.reason);
  }

  const value = Number(rawValue.trim().replace(',', '.'));
  if (!Number.isFinite(value)) {
    return unavailableResult('Enter a numeric value before converting.');
  }

  switch (mode) {
    case 'process-to-milliamp': {
      if (!metadata.processRange) {
        return unavailableResult('Process value range metadata is unavailable for PV conversion.');
      }
      const converted = scaleValue(value, metadata.processRange, metadata.loopRange);
      return availableResult(converted, 'PV to mA', `${formatNumber(value)} ${metadata.processRange.unit} maps to ${formatNumber(converted)} mA.`);
    }
    case 'milliamp-to-process': {
      if (!metadata.processRange) {
        return unavailableResult('Process value range metadata is unavailable for PV conversion.');
      }
      const converted = scaleValue(value, metadata.loopRange, metadata.processRange);
      return availableResult(converted, 'mA to PV', `${formatNumber(value)} mA maps to ${formatNumber(converted)} ${metadata.processRange.unit}.`);
    }
    case 'milliamp-to-percent': {
      const converted = scaleValue(value, metadata.loopRange, { min: 0, max: 100, unit: '%' });
      return availableResult(converted, 'mA to percent', `${formatNumber(value)} mA maps to ${formatNumber(converted)}%.`);
    }
    case 'percent-to-milliamp': {
      const converted = scaleValue(value, { min: 0, max: 100, unit: '%' }, metadata.loopRange);
      return availableResult(converted, 'Percent to mA', `${formatNumber(value)}% maps to ${formatNumber(converted)} mA.`);
    }
    default:
      return unavailableResult('Unsupported conversion mode.');
  }
}

function buildCalculationResult(calculation: SharedExecutionCalculationState) {
  if (!calculation.result) {
    return null;
  }

  return {
    signedDeviationLabel: formatDeviation(
      calculation.result.signedDeviation,
      calculation.definition.unit,
    ),
    absoluteDeviationLabel: formatDeviation(
      calculation.result.absoluteDeviation,
      calculation.definition.unit,
    ),
    percentOfSpanLabel:
      calculation.result.percentOfSpan !== null
        ? `${formatNumber(calculation.result.percentOfSpan)}%`
        : 'Unavailable',
    acceptanceLabel: toAcceptanceLabel(calculation.result.acceptance),
    acceptanceSeverity: acceptanceSeverity(calculation.result.acceptance),
    acceptanceReason: calculation.result.acceptanceReason,
  };
}

function resolveProcessRange(
  definition: SharedExecutionCalculationDefinition,
): SharedExecutionCalculationRange | null {
  const parsedRange = parseRangeSummary(definition.executionContext.expectedRangeSummary);
  if (parsedRange) {
    return parsedRange;
  }

  const calculationRange = definition.calculationRange;
  if (!calculationRange) {
    return null;
  }

  if (calculationRange.unit.trim().toLowerCase() === 'ma') {
    return { min: 0, max: 100, unit: '%' };
  }

  return calculationRange;
}

function parseRangeSummary(value: string | null): SharedExecutionCalculationRange | null {
  if (!value) {
    return null;
  }

  const match = value.match(
    /(-?\d+(?:\.\d+)?)\s*(?:to|-|a)\s*(-?\d+(?:\.\d+)?)\s*([a-zA-Z%]+)(?=.*4\s*(?:-|to|a)\s*20\s*m?A)/i,
  );

  if (!match?.[1] || !match[2] || !match[3]) {
    return null;
  }

  return {
    min: Number(match[1]),
    max: Number(match[2]),
    unit: match[3],
  };
}

function scaleValue(
  value: number,
  fromRange: SharedExecutionCalculationRange,
  toRange: SharedExecutionCalculationRange,
) {
  const fromSpan = fromRange.max - fromRange.min;
  const toSpan = toRange.max - toRange.min;

  if (fromSpan === 0) {
    return toRange.min;
  }

  return toRange.min + ((value - fromRange.min) / fromSpan) * toSpan;
}

function availableResult(value: number, label: string, detail: string): VisualLoopConversionResult {
  return {
    state: 'available',
    label,
    detail,
    value,
  };
}

function unavailableResult(detail: string): VisualLoopConversionResult {
  return {
    state: 'unavailable',
    label: 'Unavailable',
    detail,
    value: null,
  };
}

function mapHistoryRow(field: SharedExecutionField): VisualExecutionHistoryRow {
  return {
    label: field.label,
    value: field.value,
    stateLabel: toFieldStateLabel(field.state),
    severity: field.state === 'available' ? 'ok' : field.state === 'missing' ? 'due' : 'medium',
  };
}

function mapHistoryState(
  state: SharedExecutionShell['riskInputs']['historyState'],
): VisualExecutionHistoryViewModel['state'] {
  switch (state) {
    case 'available':
    case 'stale':
    case 'age-unknown':
      return 'available';
    case 'missing':
      return 'missing';
    default:
      return 'unavailable';
  }
}

function mapGuidanceState(
  guidance: SharedExecutionShell['guidance'],
): VisualExecutionGuidanceViewModel['state'] {
  return guidance.checklistItems.length > 0 ||
    guidance.guidedDiagnosisPrompts.length > 0 ||
    guidance.linkedGuidance.length > 0
    ? 'available'
    : 'missing';
}

function toFieldStateLabel(state: SharedExecutionField['state']) {
  switch (state) {
    case 'available':
      return 'Available';
    case 'missing':
      return 'Missing';
    default:
      return 'Unavailable';
  }
}

function toHistoryStateLabel(state: SharedExecutionShell['riskInputs']['historyState']) {
  switch (state) {
    case 'available':
      return 'Available';
    case 'stale':
      return 'Stale';
    case 'age-unknown':
      return 'Age unknown';
    case 'missing':
      return 'Missing';
    default:
      return 'Unavailable';
  }
}

function formatRange(range: SharedExecutionCalculationRange | null) {
  return range ? `${formatNumber(range.min)} to ${formatNumber(range.max)} ${range.unit}` : 'Unavailable';
}

function formatTolerance(definition: SharedExecutionCalculationDefinition) {
  if (definition.toleranceMode === 'percent-of-span' && definition.toleranceValue !== null) {
    return `${formatNumber(definition.toleranceValue)}% of span (${definition.toleranceSource})`;
  }

  if (definition.toleranceMode === 'absolute' && definition.toleranceValue !== null) {
    return definition.unit
      ? `${formatNumber(definition.toleranceValue)} ${definition.unit} (${definition.toleranceSource})`
      : `${formatNumber(definition.toleranceValue)} (${definition.toleranceSource})`;
  }

  return `${definition.toleranceSource} (numeric tolerance unavailable)`;
}

function formatDeviation(value: number, unit: string | null) {
  return unit ? `${formatNumber(value)} ${unit}` : formatNumber(value);
}

function formatTimestamp(value: string) {
  return new Date(value).toLocaleString();
}

function formatNumber(value: number) {
  return Number.isInteger(value) ? value.toFixed(0) : value.toFixed(3).replace(/0+$/, '').replace(/\.$/, '');
}

function toAcceptanceLabel(value: SharedExecutionCalculationAcceptance) {
  switch (value) {
    case 'pass':
      return 'PASS';
    case 'fail':
      return 'FAIL';
    default:
      return 'UNAVAILABLE';
  }
}

function acceptanceSeverity(value: SharedExecutionCalculationAcceptance): VisualExecutionSeverity {
  switch (value) {
    case 'pass':
      return 'ok';
    case 'fail':
      return 'high';
    default:
      return 'medium';
  }
}
