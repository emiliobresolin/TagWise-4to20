import type { AssignedWorkPackageTagSnapshot } from '../work-packages/model';
import type {
  SharedExecutionCaptureFieldId,
  SharedExecutionCalculationDefinition,
  SharedExecutionCalculationRawInputs,
  SharedExecutionCalculationResult,
} from './model';

export class DeterministicCalculationInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DeterministicCalculationInputError';
  }
}

type CalculationModeLabelRule = Readonly<{
  pattern: string;
  label: string;
}>;

const calculationModeLabelRules: Readonly<{
  expected: readonly CalculationModeLabelRule[];
  observed: readonly CalculationModeLabelRule[];
}> = {
  expected: [
  { pattern: 'simulated input', label: 'Simulated input' },
  { pattern: 'commanded position', label: 'Commanded position' },
  { pattern: 'applied level', label: 'Applied level' },
  ],
  observed: [
  { pattern: 'reported output', label: 'Reported output' },
  { pattern: 'observed travel', label: 'Observed travel' },
  { pattern: 'output deviation', label: 'Observed output' },
  ],
};

export function resolveDeterministicCalculationDefinition(
  tag: AssignedWorkPackageTagSnapshot,
  calculationMode: string,
  acceptanceStyle: string,
  labelOverrides?: Partial<Record<SharedExecutionCaptureFieldId, string>>,
): SharedExecutionCalculationDefinition {
  const unit = normalizeDisplayValue(tag.range?.unit);
  const span =
    typeof tag.range?.min === 'number' && typeof tag.range?.max === 'number'
      ? Math.abs(tag.range.max - tag.range.min)
      : null;
  const toleranceSpec = parseToleranceSpec(tag.tolerance, span);

  return {
    modeLabel: calculationMode,
    acceptanceLabel: acceptanceStyle,
    expectedLabel: resolveExpectedLabel(calculationMode, unit, labelOverrides?.expectedValue),
    observedLabel: resolveObservedLabel(calculationMode, unit, labelOverrides?.observedValue),
    unit,
    span,
    toleranceSource: normalizeDisplayValue(tag.tolerance) ?? 'Not defined locally',
    toleranceMode: toleranceSpec.mode,
    toleranceValue: toleranceSpec.value,
  };
}

export function computeDeterministicCalculation(
  definition: SharedExecutionCalculationDefinition,
  rawInputs: SharedExecutionCalculationRawInputs,
): SharedExecutionCalculationResult {
  const expectedValue = parseRequiredNumber(rawInputs.expectedValue, definition.expectedLabel);
  const observedValue = parseRequiredNumber(rawInputs.observedValue, definition.observedLabel);
  const signedDeviation = observedValue - expectedValue;
  const absoluteDeviation = Math.abs(signedDeviation);
  const percentOfSpan =
    definition.span && definition.span > 0 ? (absoluteDeviation / definition.span) * 100 : null;

  if (
    definition.toleranceMode === 'percent-of-span' &&
    typeof definition.toleranceValue === 'number' &&
    percentOfSpan !== null
  ) {
    return {
      signedDeviation,
      absoluteDeviation,
      percentOfSpan,
      acceptance: percentOfSpan <= definition.toleranceValue ? 'pass' : 'fail',
      acceptanceReason: `Tolerance is ${formatNumber(definition.toleranceValue)}% of span.`,
    };
  }

  if (
    definition.toleranceMode === 'absolute' &&
    typeof definition.toleranceValue === 'number'
  ) {
    return {
      signedDeviation,
      absoluteDeviation,
      percentOfSpan,
      acceptance: absoluteDeviation <= definition.toleranceValue ? 'pass' : 'fail',
      acceptanceReason: definition.unit
        ? `Tolerance is ${formatNumber(definition.toleranceValue)} ${definition.unit}.`
        : `Tolerance is ${formatNumber(definition.toleranceValue)} in local engineering units.`,
    };
  }

  return {
    signedDeviation,
    absoluteDeviation,
    percentOfSpan,
    acceptance: 'unavailable',
    acceptanceReason:
      'Deterministic deviation is available, but local tolerance metadata is not numeric yet.',
  };
}

function parseRequiredNumber(value: string, label: string): number {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new DeterministicCalculationInputError(`${label} is required.`);
  }

  const parsed = Number(trimmed);
  if (Number.isNaN(parsed)) {
    throw new DeterministicCalculationInputError(`${label} must be numeric.`);
  }

  return parsed;
}

function parseToleranceSpec(
  tolerance: string,
  span: number | null,
): { mode: SharedExecutionCalculationDefinition['toleranceMode']; value: number | null } {
  const normalized = normalizeDisplayValue(tolerance);
  if (!normalized) {
    return { mode: 'unavailable', value: null };
  }

  const percentMatch = normalized.match(/([0-9]+(?:\.[0-9]+)?)\s*%/);
  if (percentMatch?.[1]) {
    return {
      mode: 'percent-of-span',
      value: Number(percentMatch[1]),
    };
  }

  const absoluteMatch = normalized.match(/([0-9]+(?:\.[0-9]+)?)/);
  if (absoluteMatch?.[1]) {
    return {
      mode: 'absolute',
      value: Number(absoluteMatch[1]),
    };
  }

  if (span === null) {
    return { mode: 'unavailable', value: null };
  }

  return { mode: 'unavailable', value: null };
}

function resolveExpectedLabel(
  calculationMode: string,
  unit: string | null,
  overrideLabel?: string,
): string {
  return appendUnit(
    overrideLabel ??
      resolveCalculationModeFieldLabel(
        calculationMode,
        calculationModeLabelRules.expected,
        'Expected value',
      ),
    unit,
  );
}

function resolveObservedLabel(
  calculationMode: string,
  unit: string | null,
  overrideLabel?: string,
): string {
  return appendUnit(
    overrideLabel ??
      resolveCalculationModeFieldLabel(
        calculationMode,
        calculationModeLabelRules.observed,
        'Observed value',
      ),
    unit,
  );
}

function resolveCalculationModeFieldLabel(
  calculationMode: string,
  rules: readonly CalculationModeLabelRule[],
  fallback: string,
): string {
  const normalizedMode = calculationMode.toLowerCase();
  for (const rule of rules) {
    if (normalizedMode.includes(rule.pattern)) {
      return rule.label;
    }
  }

  return fallback;
}

function appendUnit(label: string, unit: string | null): string {
  return unit ? `${label} (${unit})` : label;
}

function normalizeDisplayValue(value: string | null | undefined): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(3).replace(/0+$/, '').replace(/\.$/, '');
}
