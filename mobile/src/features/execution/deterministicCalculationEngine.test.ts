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

const analogLoopTag: AssignedWorkPackageTagSnapshot = {
  ...pressureTag,
  id: 'tag-ai-330',
  tagCode: 'AI-330',
  instrumentFamily: 'analog 4-20 mA loop',
  instrumentSubtype: 'isolated analog input loop',
  measuredVariable: 'process value',
  range: { min: 0, max: 100, unit: '%' },
  tolerance: '+/-1% span',
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

  it('does not synthesize analog loop execution context when template metadata is missing', () => {
    const definition = resolveDeterministicCalculationDefinition(
      analogLoopTag,
      'expected current vs measured current',
      'within tolerance at each loop checkpoint',
      {
        expectedValue: 'Expected current',
        observedValue: 'Measured current',
      },
      {
        expectedValue: 'mA',
        observedValue: 'mA',
      },
      {
        min: 4,
        max: 20,
        unit: 'mA',
      },
    );

    expect(definition).toMatchObject({
      expectedLabel: 'Expected current (mA)',
      observedLabel: 'Measured current (mA)',
      calculationRange: {
        min: 4,
        max: 20,
        unit: 'mA',
      },
      executionContext: {
        conversionBasisSummary: null,
        expectedRangeSummary: null,
      },
    });
  });

  it('resolves analog loop conversion basis and mA capture units from template-driven overrides', () => {
    const definition = resolveDeterministicCalculationDefinition(
      analogLoopTag,
      'expected current vs measured current',
      'deviation and tolerance outcome against the configured conversion basis',
      {
        expectedValue: 'Expected current',
        observedValue: 'Measured current',
      },
      {
        expectedValue: 'mA',
        observedValue: 'mA',
      },
      {
        min: 4,
        max: 20,
        unit: 'mA',
      },
      {
        conversionBasisSummary:
          'Expected current is derived from the configured process range using a linear 4-20 mA conversion basis.',
        expectedRangeSummary: '0 to 100 % process value range / 4-20 mA signal range.',
      },
    );

    expect(definition).toMatchObject({
      expectedLabel: 'Expected current (mA)',
      observedLabel: 'Measured current (mA)',
      unit: 'mA',
      executionContext: {
        conversionBasisSummary:
          'Expected current is derived from the configured process range using a linear 4-20 mA conversion basis.',
        expectedRangeSummary: '0 to 100 % process value range / 4-20 mA signal range.',
      },
    });
  });

  it('computes deterministic loop deviation using the shared tolerance path', () => {
    const definition = resolveDeterministicCalculationDefinition(
      analogLoopTag,
      'expected current vs measured current',
      'within tolerance at each loop checkpoint',
      {
        expectedValue: 'Expected current',
        observedValue: 'Measured current',
      },
      {
        expectedValue: 'mA',
        observedValue: 'mA',
      },
      {
        min: 4,
        max: 20,
        unit: 'mA',
      },
      {
        conversionBasisSummary: 'Linear 4-20 mA conversion derived from the configured process range.',
        expectedRangeSummary: '0 to 100 % maps to 4-20 mA.',
      },
    );

    const result = computeDeterministicCalculation(definition, {
      expectedValue: '12',
      observedValue: '12.08',
    });

    expect(result.signedDeviation).toBeCloseTo(0.08, 6);
    expect(result.absoluteDeviation).toBeCloseTo(0.08, 6);
    expect(result.percentOfSpan).not.toBeNull();
    expect(result.percentOfSpan ?? 0).toBeCloseTo(0.5, 6);
    expect(result.acceptance).toBe('pass');
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
