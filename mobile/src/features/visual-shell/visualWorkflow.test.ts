import { describe, expect, it } from 'vitest';

import {
  buildTechnicianVisualWorkflow,
  calculateVisualError,
  isVisualDemoShellEnabled,
} from './model';
import type {
  LocalAssignedTagEntry,
  LocalAssignedWorkPackageSummary,
  LocalTagContext,
} from '../work-packages/model';

describe('technician visual workflow model', () => {
  it('disables seeded signed-out operational demo by default', () => {
    const model = buildTechnicianVisualWorkflow();

    expect(isVisualDemoShellEnabled(undefined)).toBe(false);
    expect(isVisualDemoShellEnabled('false')).toBe(false);
    expect(model.source).toBe('local-empty');
    expect(model.selectedTag).toBeNull();
    expect(model.pendingTags).toEqual([]);
    expect(model.report.tagCode).toBe('Sem tag selecionada');
  });

  it('keeps seeded PT-204 data only when the explicit demo flag is enabled', () => {
    const model = buildTechnicianVisualWorkflow({ demoEnabled: true });

    expect(isVisualDemoShellEnabled('true')).toBe(true);
    expect(model.source).toBe('seeded-demo');
    expect(model.selectedTag?.code).toBe('PT-204');
    expect(model.pendingTags.map((tag) => tag.code)).toContain('PT-204');
    expect(model.report.tagCode).toBe('PT-204');
  });

  it('uses local tags as the authenticated catalog without seeded fallback', () => {
    const model = buildTechnicianVisualWorkflow({
      authenticated: true,
      localTags: [localTag('tag-pt-101', 'PT-101'), localTag('tag-tt-205', 'TT-205')],
      workPackages: [workPackage()],
    });

    expect(model.source).toBe('local-authenticated');
    expect(model.selectedTag).toBeNull();
    expect(model.counts.all).toBe(2);
    expect(model.pendingTags.map((tag) => tag.code)).toEqual(['PT-101', 'TT-205']);
    expect(model.recentTags.map((tag) => tag.code)).toEqual(['PT-101', 'TT-205']);
    expect(model.pendingTags.map((tag) => tag.code)).not.toContain('PT-204');
    expect(model.report.tagCode).toBe('Sem tag selecionada');
  });

  it('preserves selected local tag identity and local context details', () => {
    const selected = localTag('tag-tt-205', 'TT-205', 'wp-alpha');
    const model = buildTechnicianVisualWorkflow({
      authenticated: true,
      localTags: [localTag('tag-pt-101', 'PT-101', 'wp-alpha'), selected],
      selectedTag: selected,
      selectedTagContext: tagContext(selected),
      workPackages: [workPackage('wp-alpha')],
    });

    expect(model.selectedTag).toMatchObject({
      code: 'TT-205',
      tagId: 'tag-tt-205',
      workPackageId: 'wp-alpha',
      source: 'local',
    });
    expect(model.variableRangeLabel).toBe('0 to 200 degC');
    expect(model.lastValueLabel).toBe('last-result-TT-205');
    expect(model.recentTags[0]?.code).toBe('TT-205');
    expect(model.report.tagCode).toBe('TT-205');
  });

  it('does not substitute PT-204 when authenticated local catalog is empty', () => {
    const model = buildTechnicianVisualWorkflow({
      authenticated: true,
      localTags: [],
      workPackages: [workPackage()],
    });

    expect(model.source).toBe('local-empty');
    expect(model.selectedTag).toBeNull();
    expect(model.pendingTags).toEqual([]);
    expect(model.recentTags).toEqual([]);
    expect(model.counts.all).toBe(0);
  });

  it('calculates the visual shell failure result from deterministic values', () => {
    const result = calculateVisualError({
      expectedValue: 8,
      observedValue: 9.45,
      tolerance: 0.5,
      unit: 'bar',
    });

    expect(result.error).toBe(1.45);
    expect(result.absoluteError).toBe(1.45);
    expect(result.status).toBe('fail');
    expect(result.statusLabel).toBe('FALHA');
  });
});

function localTag(
  tagId: string,
  tagCode: string,
  workPackageId = 'wp-local',
): LocalAssignedTagEntry {
  return {
    workPackageId,
    workPackageTitle: 'Local package',
    tagId,
    tagCode,
    shortDescription: `Descricao ${tagCode}`,
    area: 'Area local',
    instrumentFamily: tagCode.startsWith('TT') ? 'Temperatura' : 'Pressao',
    instrumentSubtype: 'Transmissor',
    parentAssetReference: 'Asset local',
  };
}

function workPackage(id = 'wp-local'): LocalAssignedWorkPackageSummary {
  return {
    id,
    sourceReference: 'LOCAL-001',
    title: 'Local package',
    assignedTeam: 'Instrumentation',
    priority: 'high',
    status: 'assigned',
    packageVersion: 1,
    snapshotContractVersion: '1',
    tagCount: 2,
    dueWindow: { startsAt: null, endsAt: null },
    updatedAt: '2026-05-07T00:00:00.000Z',
    downloadedAt: '2026-05-07T00:00:00.000Z',
    localUpdatedAt: '2026-05-07T00:00:00.000Z',
    hasSnapshot: true,
    snapshotGeneratedAt: '2026-05-07T00:00:00.000Z',
  };
}

function tagContext(tag: LocalAssignedTagEntry): LocalTagContext {
  return {
    workPackageId: tag.workPackageId,
    workPackageTitle: tag.workPackageTitle,
    tagId: tag.tagId,
    tagCode: tag.tagCode,
    shortDescription: tag.shortDescription,
    area: { label: 'Area', value: tag.area, state: 'available' },
    parentAssetReference: {
      label: 'Asset reference',
      value: tag.parentAssetReference,
      state: 'available',
    },
    instrumentFamily: {
      label: 'Instrument family',
      value: tag.instrumentFamily,
      state: 'available',
    },
    instrumentSubtype: {
      label: 'Instrument subtype',
      value: tag.instrumentSubtype,
      state: 'available',
    },
    measuredVariable: { label: 'Measured variable', value: 'Temperature', state: 'available' },
    signalType: { label: 'Signal type', value: '4-20 mA', state: 'available' },
    range: { label: 'Range', value: '0 to 200 degC', state: 'available' },
    tolerance: { label: 'Tolerance', value: '+/- 1 degC', state: 'available' },
    criticality: { label: 'Criticality', value: 'high', state: 'available' },
    dueIndicator: { label: 'Due', value: 'Due today', state: 'available', overdue: false },
    historyPreview: {
      state: 'available',
      title: 'History available',
      summary: 'Cached history summary',
      detail: 'Cached history detail',
      lastObservedAt: '2026-05-01T00:00:00.000Z',
      lastResult: `last-result-${tag.tagCode}`,
      recurrenceCue: 'No recurrence',
    },
    priorReadings: [],
    referencePointers: {
      state: 'available',
      templates: ['tpl-local'],
      executionTemplates: [
        {
          id: 'tpl-local',
          title: 'Local template',
          instrumentFamily: tag.instrumentFamily,
          testPattern: 'as-found',
          captureSummary: 'Capture expected and observed values',
          minimumSubmissionEvidence: ['calculation'],
          expectedEvidence: ['photo'],
        },
      ],
      guidance: ['guide-local'],
      detail: 'Local references available',
    },
  };
}
