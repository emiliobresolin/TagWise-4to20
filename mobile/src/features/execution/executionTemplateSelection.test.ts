import { describe, expect, it } from 'vitest';

import type { LocalExecutionTemplateOption } from '../work-packages/model';
import {
  canProceedToExecutionShell,
  resolveExplicitExecutionTemplateSelection,
} from './executionTemplateSelection';

const templates: LocalExecutionTemplateOption[] = [
  {
    id: 'tpl-pressure-as-found',
    title: 'Pressure transmitter as-found calibration',
    instrumentFamily: 'pressure transmitter',
    testPattern: 'as-found calibration check',
    captureSummary: 'Capture pre-adjustment checkpoints.',
    minimumSubmissionEvidence: ['as-found readings'],
    expectedEvidence: ['supporting photo'],
  },
  {
    id: 'tpl-pressure-as-left',
    title: 'Pressure transmitter as-left calibration',
    instrumentFamily: 'pressure transmitter',
    testPattern: 'as-left calibration check',
    captureSummary: 'Capture post-adjustment checkpoints.',
    minimumSubmissionEvidence: ['as-left readings'],
    expectedEvidence: ['supporting photo'],
  },
];

describe('execution template selection', () => {
  it('does not preselect a template when multiple options exist', () => {
    expect(resolveExplicitExecutionTemplateSelection(templates, null)).toBeNull();
    expect(canProceedToExecutionShell(templates, null)).toBe(false);
  });

  it('requires an explicit template choice before proceeding to the shell', () => {
    expect(
      resolveExplicitExecutionTemplateSelection(templates, 'tpl-pressure-as-left'),
    ).toMatchObject({
      id: 'tpl-pressure-as-left',
      testPattern: 'as-left calibration check',
    });
    expect(canProceedToExecutionShell(templates, 'tpl-pressure-as-left')).toBe(true);
  });

  it('does not silently resolve an invalid template id', () => {
    expect(
      resolveExplicitExecutionTemplateSelection(templates, 'tpl-missing'),
    ).toBeNull();
    expect(canProceedToExecutionShell(templates, 'tpl-missing')).toBe(false);
  });
});
