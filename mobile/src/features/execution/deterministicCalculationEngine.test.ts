import { describe, expect, it } from 'vitest';

import type { AssignedWorkPackageTagSnapshot } from '../work-packages/model';
import {
  DeterministicCalculationInputError,
  computeDeterministicCalculation,
  resolveDeterministicCalculationDefinition,
} from './deterministicCalculationEngine';

const pressureTag: AssignedWorkPackageTagSnapshot = {
  id: 'tag-pt-101',
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
  templateIds: ['tpl-pressure'],
  guidanceReferenceIds: ['guide-pressure'],
  historySummaryId: 'history-001',
};

const temperatureTag: AssignedWorkPackageTagSnapshot = {
  ...pressureTag,
  id: 'tag-tt-205',
  tagCode: 'TT-205',
  measuredVariable: 'temperature',
  range: { min: 0, max: 250, unit: 'C' },
  tolerance: '+/-0.3C',
};

const noSpanAbsoluteToleranceTag = {
  ...temperatureTag,
  id: 'tag-tt-999',
  tagCode: 'TT-999',
  range: undefined,
} as unknown as AssignedWorkPackageTagSnapshot;

const nonNumericToleranceTag: AssignedWorkPackageTagSnapshot = {
  ...pressureTag,
  id: 'tag-xv-402',
  tagCode: 'XV-402',
  instrumentFamily: 'control valve with positioner',
  measuredVariable: 'position',
  range: { min: 0, max: 100, unit: '%' },
  tolerance: 'N/A',
};

describe('deterministicCalculationEngine', () => {
  it('computes a reproducible percent-of-span pass/fail result', () => {
    const definition = resolveDeterministicCalculationDefinition(
      pressureTag,
      'point deviation by span',
      'within tolerance by point and overall span',
    );

    const result = computeDeterministicCalculation(definition, {
      expectedValue: '5',
      observedValue: '5.01',
    });

    expect(result.signedDeviation).toBeCloseTo(0.01, 6);
    expect(result.absoluteDeviation).toBeCloseTo(0.01, 6);
    expect(result.percentOfSpan).not.toBeNull();
    expect(result.percentOfSpan ?? 0).toBeCloseTo(0.1, 6);
    expect(result.acceptance).toBe('pass');
  });

  it('returns the same output for the same inputs across repeat runs', () => {
    const definition = resolveDeterministicCalculationDefinition(
      pressureTag,
      'point deviation by span',
      'within tolerance by point and overall span',
    );

    const firstResult = computeDeterministicCalculation(definition, {
      expectedValue: '5',
      observedValue: '5.01',
    });
    const secondResult = computeDeterministicCalculation(definition, {
      expectedValue: '5',
      observedValue: '5.01',
    });

    expect(secondResult).toEqual(firstResult);
  });

  it('falls back to generic labels for unknown calculation modes', () => {
    const definition = resolveDeterministicCalculationDefinition(
      pressureTag,
      'future custom mode',
      'future acceptance style',
    );

    expect(definition).toMatchObject({
      expectedLabel: 'Expected value (bar)',
      observedLabel: 'Observed value (bar)',
    });
  });

  it('computes a reproducible absolute-tolerance fail result', () => {
    const definition = resolveDeterministicCalculationDefinition(
      temperatureTag,
      'simulated input vs reported output',
      'point deviation across expected RTD inputs',
    );

    const result = computeDeterministicCalculation(definition, {
      expectedValue: '100',
      observedValue: '100.5',
    });

    expect(result).toMatchObject({
      absoluteDeviation: 0.5,
      acceptance: 'fail',
      acceptanceReason: 'Tolerance is 0.3 C.',
    });
  });

  it('parses numeric absolute tolerance even when span is unavailable', () => {
    const definition = resolveDeterministicCalculationDefinition(
      noSpanAbsoluteToleranceTag,
      'simulated input vs reported output',
      'point deviation across expected RTD inputs',
    );

    expect(definition).toMatchObject({
      toleranceMode: 'absolute',
      toleranceValue: 0.3,
      span: null,
    });

    const result = computeDeterministicCalculation(definition, {
      expectedValue: '100',
      observedValue: '100.2',
    });

    expect(result.signedDeviation).toBeCloseTo(0.2, 6);
    expect(result.absoluteDeviation).toBeCloseTo(0.2, 6);
    expect(result.percentOfSpan).toBeNull();
    expect(result.acceptance).toBe('pass');
  });

  it('returns unavailable acceptance while still computing deviation for non-numeric tolerance', () => {
    const definition = resolveDeterministicCalculationDefinition(
      nonNumericToleranceTag,
      'commanded position vs observed travel',
      'open/close travel and feedback within expected band',
    );

    const result = computeDeterministicCalculation(definition, {
      expectedValue: '50',
      observedValue: '52',
    });

    expect(definition).toMatchObject({
      toleranceMode: 'unavailable',
      toleranceValue: null,
    });
    expect(result).toMatchObject({
      signedDeviation: 2,
      absoluteDeviation: 2,
      percentOfSpan: 2,
      acceptance: 'unavailable',
      acceptanceReason:
        'Deterministic deviation is available, but local tolerance metadata is not numeric yet.',
    });
  });

  it('fails fast for non-numeric raw inputs', () => {
    const definition = resolveDeterministicCalculationDefinition(
      pressureTag,
      'point deviation by span',
      'within tolerance by point and overall span',
    );

    expect(() =>
      computeDeterministicCalculation(definition, {
        expectedValue: 'abc',
        observedValue: '5',
      }),
    ).toThrowError(new DeterministicCalculationInputError('Expected value (bar) must be numeric.'));
  });
});
