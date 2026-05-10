export type FieldCalculatorMode =
  | 'pv-to-ma'
  | 'ma-to-pv'
  | 'pv-to-percent'
  | 'ma-to-percent'
  | 'percent-to-ma'
  | 'error';

export interface FieldCalculatorInput {
  mode: FieldCalculatorMode;
  value: string;
  processMin: string;
  processMax: string;
  unit: string;
  expected: string;
  measured: string;
  tolerance: string;
}

export interface FieldCalculatorResult {
  state: 'available' | 'unavailable';
  label: string;
  detail: string;
  value: number | null;
  errorPercent: number | null;
}

export type LoopPointInputMode = 'pv' | 'ma';

export interface LoopTestPoint {
  id: string;
  setpointPercent: number;
  expected: string;
  measured: string;
}

export interface LoopTestPointResult extends LoopTestPoint {
  expectedPv: number | null;
  expectedMa: number | null;
  expectedPercent: number | null;
  measuredPv: number | null;
  measuredMa: number | null;
  measuredPercent: number | null;
  error: number | null;
  errorPercent: number | null;
  passed: boolean | null;
}

export interface LoopTestSummary {
  state: 'available' | 'incomplete';
  passedCount: number;
  failedCount: number;
  pendingCount: number;
  overallLabel: string;
}

export type CalculatorApplyField = 'expectedValue' | 'observedValue';

export interface CalculatorApplyTarget {
  field: CalculatorApplyField;
  label: string;
  pointId: string | null;
  pointLabel: string | null;
}

const LOOP_MA_MIN = 4;
const LOOP_MA_MAX = 20;
const LOOP_MA_SPAN = LOOP_MA_MAX - LOOP_MA_MIN;

export function createDefaultLoopPoints(count = 5): LoopTestPoint[] {
  return normalizeLoopPointCount([], count);
}

export function normalizeLoopPointCount(
  current: readonly LoopTestPoint[],
  requestedCount: number,
): LoopTestPoint[] {
  const count = Math.min(10, Math.max(1, Math.round(requestedCount)));
  const existing = current.slice(0, count);
  const denomin = Math.max(count - 1, 1);

  while (existing.length < count) {
    const index = existing.length;
    existing.push({
      id: `point-${index + 1}`,
      setpointPercent: Math.round((index / denomin) * 100),
      expected: '',
      measured: '',
    });
  }

  return existing.map((point, index) => ({
    ...point,
    id: `point-${index + 1}`,
    setpointPercent: count === 1 ? point.setpointPercent : Math.round((index / denomin) * 100),
  }));
}

export function updateLoopPoint(
  points: readonly LoopTestPoint[],
  pointId: string,
  key: 'expected' | 'measured',
  value: string,
): LoopTestPoint[] {
  return points.map((point) => (point.id === pointId ? { ...point, [key]: value } : point));
}

export function calculateFieldValue(input: FieldCalculatorInput): FieldCalculatorResult {
  const processMin = parseNumber(input.processMin);
  const processMax = parseNumber(input.processMax);
  const value = parseNumber(input.value);
  const expected = parseNumber(input.expected);
  const measured = parseNumber(input.measured);
  const tolerance = parseNumber(input.tolerance);
  const unit = input.unit.trim() || 'PV';

  switch (input.mode) {
    case 'pv-to-ma': {
      const range = resolveProcessRange(processMin, processMax);
      if (!range || value === null) {
        return unavailable('Informe faixa PV e valor para converter em mA.');
      }
      const result = pvToMa(value, range.min, range.max);
      return available(result, `${formatNumber(value)} ${unit} = ${formatNumber(result)} mA`);
    }
    case 'ma-to-pv': {
      const range = resolveProcessRange(processMin, processMax);
      if (!range || value === null) {
        return unavailable('Informe faixa PV e corrente em mA.');
      }
      const result = maToPv(value, range.min, range.max);
      return available(result, `${formatNumber(value)} mA = ${formatNumber(result)} ${unit}`);
    }
    case 'pv-to-percent': {
      const range = resolveProcessRange(processMin, processMax);
      if (!range || value === null) {
        return unavailable('Informe faixa PV e valor para converter em %.');
      }
      const result = pvToPercent(value, range.min, range.max);
      return available(result, `${formatNumber(value)} ${unit} = ${formatNumber(result)}%`);
    }
    case 'ma-to-percent': {
      if (value === null) {
        return unavailable('Informe a corrente em mA.');
      }
      const result = maToPercent(value);
      return available(result, `${formatNumber(value)} mA = ${formatNumber(result)}%`);
    }
    case 'percent-to-ma': {
      if (value === null) {
        return unavailable('Informe o percentual.');
      }
      const result = percentToMa(value);
      return available(result, `${formatNumber(value)}% = ${formatNumber(result)} mA`);
    }
    case 'error': {
      if (expected === null || measured === null) {
        return unavailable('Informe esperado e medido.');
      }
      const error = measured - expected;
      const errorPercent =
        expected !== 0 ? (error / Math.abs(expected)) * 100 : null;
      const passed = tolerance === null ? null : Math.abs(error) <= Math.abs(tolerance);
      return {
        state: 'available',
        label: passed === null ? 'Erro calculado' : passed ? 'Dentro da tolerancia' : 'Fora da tolerancia',
        detail: `Erro: ${formatNumber(error)} ${unit}. Erro absoluto: ${formatNumber(Math.abs(error))} ${unit}. Erro percentual: ${
          errorPercent === null ? 'indisponivel' : `${formatNumber(errorPercent)}%`
        }.`,
        value: round(error),
        errorPercent: errorPercent === null ? null : round(errorPercent),
      };
    }
    default:
      return unavailable('Modo de calculo indisponivel.');
  }
}

export function calculateLoopTest(input: {
  points: readonly LoopTestPoint[];
  inputMode: LoopPointInputMode;
  processMin: string;
  processMax: string;
  tolerance: string;
}): { rows: LoopTestPointResult[]; summary: LoopTestSummary } {
  const processMin = parseNumber(input.processMin);
  const processMax = parseNumber(input.processMax);
  const tolerance = parseNumber(input.tolerance);
  const range = resolveProcessRange(processMin, processMax);

  const rows = input.points.map((point) => {
    const expected = parseNumber(point.expected);
    const measured = parseNumber(point.measured);
    const expectedMa =
      input.inputMode === 'ma'
        ? expected
        : expected !== null && range
          ? pvToMa(expected, range.min, range.max)
          : null;
    const measuredMa =
      input.inputMode === 'ma'
        ? measured
        : measured !== null && range
          ? pvToMa(measured, range.min, range.max)
          : null;
    const expectedPercent =
      input.inputMode === 'ma'
        ? expected !== null
          ? maToPercent(expected)
          : null
        : expected !== null && range
          ? pvToPercent(expected, range.min, range.max)
          : null;
    const measuredPercent =
      input.inputMode === 'ma'
        ? measured !== null
          ? maToPercent(measured)
          : null
        : measured !== null && range
          ? pvToPercent(measured, range.min, range.max)
          : null;
    const expectedPv =
      input.inputMode === 'pv'
        ? expected
        : expected !== null && range
          ? maToPv(expected, range.min, range.max)
          : null;
    const measuredPv =
      input.inputMode === 'pv'
        ? measured
        : measured !== null && range
          ? maToPv(measured, range.min, range.max)
          : null;
    const error =
      expected !== null && measured !== null
        ? round(measured - expected)
        : null;
    const errorPercent =
      error !== null && expected !== null && expected !== 0
        ? round((error / Math.abs(expected)) * 100)
        : null;

    return {
      ...point,
      expectedPv,
      expectedMa,
      expectedPercent,
      measuredPv,
      measuredMa,
      measuredPercent,
      error,
      errorPercent,
      passed: error === null || tolerance === null ? null : Math.abs(error) <= Math.abs(tolerance),
    };
  });

  const passedCount = rows.filter((row) => row.passed === true).length;
  const failedCount = rows.filter((row) => row.passed === false).length;
  const pendingCount = rows.filter((row) => row.passed === null).length;

  return {
    rows,
    summary: {
      state: pendingCount > 0 ? 'incomplete' : 'available',
      passedCount,
      failedCount,
      pendingCount,
      overallLabel:
        pendingCount > 0
          ? 'Pontos pendentes'
          : failedCount > 0
            ? 'Falha no loop'
            : 'Loop aprovado',
    },
  };
}

export function buildCalculatorApplyTargets(
  points: readonly LoopTestPoint[] = [],
): CalculatorApplyTarget[] {
  const baseTargets: CalculatorApplyTarget[] = [
    {
      field: 'expectedValue',
      label: 'Usar como valor esperado',
      pointId: null,
      pointLabel: null,
    },
    {
      field: 'observedValue',
      label: 'Usar como valor medido',
      pointId: null,
      pointLabel: null,
    },
  ];

  return [
    ...baseTargets,
    ...points.flatMap((point) => [
      {
        field: 'expectedValue' as const,
        label: `Usar no esperado do ponto ${point.setpointPercent}%`,
        pointId: point.id,
        pointLabel: `${point.setpointPercent}%`,
      },
      {
        field: 'observedValue' as const,
        label: `Usar no medido do ponto ${point.setpointPercent}%`,
        pointId: point.id,
        pointLabel: `${point.setpointPercent}%`,
      },
    ]),
  ];
}

export function formatLoopTestEvidenceNote(input: {
  rows: readonly LoopTestPointResult[];
  summary: LoopTestSummary;
  inputMode: LoopPointInputMode;
  unit: string;
}): string {
  const unit = input.unit.trim() || 'PV';
  const rows = input.rows.map((row) => {
    const expected =
      input.inputMode === 'ma'
        ? `${formatNullable(row.expectedMa)} mA`
        : `${formatNullable(row.expectedPv)} ${unit}`;
    const measured =
      input.inputMode === 'ma'
        ? `${formatNullable(row.measuredMa)} mA`
        : `${formatNullable(row.measuredPv)} ${unit}`;
    const percent =
      row.measuredPercent === null ? 'percentual indisponivel' : `${formatNumber(row.measuredPercent)}%`;
    const status = row.passed === null ? 'pendente' : row.passed ? 'OK' : 'falha';
    return `${row.setpointPercent}%: esperado ${expected}; medido ${measured}; ${percent}; erro ${
      row.error === null ? 'pendente' : formatNumber(row.error)
    }; ${status}.`;
  });

  return [
    `Teste de loop salvo localmente: ${input.summary.overallLabel}.`,
    ...rows,
  ].join('\n');
}

export function formatNumber(value: number): string {
  return Number.isFinite(value)
    ? new Intl.NumberFormat('pt-BR', {
        maximumFractionDigits: 3,
        minimumFractionDigits: 0,
      }).format(value)
    : 'indisponivel';
}

function resolveProcessRange(
  min: number | null,
  max: number | null,
): { min: number; max: number } | null {
  return min !== null && max !== null && max !== min ? { min, max } : null;
}

function parseNumber(value: string): number | null {
  const normalized = value.trim().replace(',', '.');
  if (normalized.length === 0) {
    return null;
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function pvToMa(value: number, min: number, max: number): number {
  return LOOP_MA_MIN + ((value - min) / (max - min)) * LOOP_MA_SPAN;
}

function maToPv(value: number, min: number, max: number): number {
  return min + ((value - LOOP_MA_MIN) / LOOP_MA_SPAN) * (max - min);
}

function maToPercent(value: number): number {
  return ((value - LOOP_MA_MIN) / LOOP_MA_SPAN) * 100;
}

function pvToPercent(value: number, min: number, max: number): number {
  return ((value - min) / (max - min)) * 100;
}

function percentToMa(value: number): number {
  return LOOP_MA_MIN + (value / 100) * LOOP_MA_SPAN;
}

function available(value: number, detail: string): FieldCalculatorResult {
  return {
    state: 'available',
    label: detail,
    detail,
    value: round(value),
    errorPercent: null,
  };
}

function unavailable(detail: string): FieldCalculatorResult {
  return {
    state: 'unavailable',
    label: 'Informe os dados',
    detail,
    value: null,
    errorPercent: null,
  };
}

function formatNullable(value: number | null): string {
  return value === null ? 'pendente' : formatNumber(value);
}

function round(value: number): number {
  return Number(value.toFixed(6));
}
