import { describe, expect, it } from 'vitest';

import {
  buildExecutionStages,
  resolveVisualExecutionPattern,
  toPtBrTemplateLabel,
} from './executionFlow';

describe('visual execution flow routing', () => {
  it('routes selected templates to the correct execution pattern immediately', () => {
    expect(
      resolveVisualExecutionPattern({
        title: 'pressure transmitter as-left loop verification',
        testPattern: '5 point loop',
        captureSummary: 'Capture loop points',
      }),
    ).toMatchObject({
      pattern: 'loop',
      route: 'loop-test',
      label: 'Teste de loop',
    });

    expect(
      resolveVisualExecutionPattern({
        title: 'pressure transmitter basic calibration',
        testPattern: 'expected-versus-measured',
        captureSummary: 'Capture expected and observed values',
      }),
    ).toMatchObject({
      pattern: 'single-point',
      route: 'calculation',
    });

    expect(
      resolveVisualExecutionPattern({
        title: 'inspection procedure',
        testPattern: 'checklist',
        captureSummary: 'Open procedure checklist',
      }),
    ).toMatchObject({
      pattern: 'checklist',
      route: 'diagnosis',
    });
  });

  it('keeps loop stages in the instrument execution flow, not the standalone calculator', () => {
    const stages = buildExecutionStages('loop');

    expect(stages.find((stage) => stage.id === 'measurement')).toMatchObject({
      label: 'Pontos',
      route: 'loop-test',
    });
    expect(stages.map((stage) => stage.label)).toContain('Checklist');
    expect(stages.map((stage) => stage.label)).toContain('Enviar');
  });

  it('maps visible template labels to PT-BR without changing internal ids', () => {
    expect(toPtBrTemplateLabel('pressure transmitter as-left calibration')).toBe(
      'transmissor de pressao como deixado calibracao',
    );
  });
});
