import { describe, expect, it } from 'vitest';

import {
  buildCalculatorApplyTargets,
  calculateFieldValue,
  calculateLoopTest,
  createDefaultLoopPoints,
  formatLoopTestEvidenceNote,
  normalizeLoopPointCount,
  updateLoopPoint,
} from './fieldCalculator';

describe('field calculator', () => {
  it('calculates 4-20 mA, percent, PV, and error without requiring a selected instrument', () => {
    expect(
      calculateFieldValue({
        mode: 'pv-to-ma',
        value: '50',
        processMin: '0',
        processMax: '100',
        unit: 'bar',
        expected: '',
        measured: '',
        tolerance: '',
      }),
    ).toMatchObject({ state: 'available', value: 12 });

    expect(
      calculateFieldValue({
        mode: 'pv-to-percent',
        value: '50',
        processMin: '0',
        processMax: '100',
        unit: 'bar',
        expected: '',
        measured: '',
        tolerance: '',
      }),
    ).toMatchObject({ state: 'available', value: 50 });

    expect(
      calculateFieldValue({
        mode: 'ma-to-percent',
        value: '12',
        processMin: '',
        processMax: '',
        unit: '',
        expected: '',
        measured: '',
        tolerance: '',
      }),
    ).toMatchObject({ state: 'available', value: 50 });

    expect(
      calculateFieldValue({
        mode: 'error',
        value: '',
        processMin: '',
        processMax: '',
        unit: 'bar',
        expected: '10',
        measured: '10,2',
        tolerance: '0,5',
      }),
    ).toMatchObject({ state: 'available', value: 0.2 });
  });

  it('builds loop tests with five default points and caps editable points at ten', () => {
    expect(createDefaultLoopPoints()).toHaveLength(5);
    expect(normalizeLoopPointCount([], 12)).toHaveLength(10);
    expect(normalizeLoopPointCount([], 0)).toHaveLength(1);
  });

  it('calculates loop point conversions and pass/fail summary', () => {
    let points = createDefaultLoopPoints(2);
    points = updateLoopPoint(points, 'point-1', 'expected', '0');
    points = updateLoopPoint(points, 'point-1', 'measured', '0.1');
    points = updateLoopPoint(points, 'point-2', 'expected', '100');
    points = updateLoopPoint(points, 'point-2', 'measured', '101');

    const result = calculateLoopTest({
      points,
      inputMode: 'pv',
      processMin: '0',
      processMax: '100',
      tolerance: '0.5',
    });

    expect(result.rows[0]).toMatchObject({
      expectedMa: 4,
      measuredMa: 4.016,
      passed: true,
    });
    expect(result.rows[1]).toMatchObject({
      expectedMa: 20,
      measuredMa: 20.16,
      passed: false,
    });
    expect(result.summary).toMatchObject({
      passedCount: 1,
      failedCount: 1,
      overallLabel: 'Falha no loop',
    });
    expect(result.rows[1]).toMatchObject({
      measuredPercent: 101,
      errorPercent: 1,
    });
  });

  it('builds explicit apply-to-test targets instead of assuming the 50 percent point', () => {
    const targets = buildCalculatorApplyTargets(createDefaultLoopPoints(5));

    expect(targets.map((target) => target.label)).toContain('Usar no medido do ponto 50%');
    expect(targets.map((target) => target.label)).toContain('Usar no medido do ponto 100%');
    expect(targets.find((target) => target.label === 'Usar como valor medido')).toBeDefined();
  });

  it('formats loop test notes for local evidence without backend acceptance claims', () => {
    const result = calculateLoopTest({
      points: createDefaultLoopPoints(1),
      inputMode: 'ma',
      processMin: '0',
      processMax: '100',
      tolerance: '0.2',
    });

    expect(
      formatLoopTestEvidenceNote({
        rows: result.rows,
        summary: result.summary,
        inputMode: 'ma',
        unit: 'bar',
      }),
    ).toContain('Teste de loop salvo localmente');
  });
});
