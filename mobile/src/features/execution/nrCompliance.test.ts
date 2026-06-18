import { describe, it, expect } from 'vitest';
import { LocalExecutionTemplateRegistry } from './localExecutionTemplateRegistry';

// Minimal snapshot fixture for NR compliance testing.
// Cast to `any` so TypeScript does not require every optional snapshot field,
// but field names match the runtime shape that resolveTemplate reads.
function buildMinimalSnapshot(instrumentFamily: string, templateId: string) {
  return {
    contractVersion: '2026-04-v1',
    generatedAt: '2026-04-19T10:00:00.000Z',
    summary: {
      id: 'wp-test',
      sourceReference: 'test',
      title: 'NR Test Package',
      assignedTeam: 'Test Team',
      priority: 'medium',
      status: 'assigned',
      packageVersion: 1,
      snapshotContractVersion: '2026-04-v1',
      tagCount: 1,
      dueWindow: { startsAt: null, endsAt: null },
      updatedAt: '2026-04-19T10:00:00.000Z',
    },
    tags: [
      {
        id: 'tag-test',
        tagCode: 'TEST-001',
        shortDescription: 'Test instrument',
        area: 'Plant A',
        parentAssetReference: 'asset-test',
        instrumentFamily,
        instrumentSubtype: 'generic',
        measuredVariable: 'process value',
        signalType: '4-20mA',
        range: { min: 0, max: 100, unit: '%' },
        tolerance: '+/-0.5% span',
        criticality: 'medium',
        templateIds: [templateId],
        guidanceReferenceIds: [],
        historySummaryId: 'history-test',
      },
    ],
    templates: [
      {
        id: templateId,
        title: 'Test Template',
        instrumentFamily,
        testPattern: 'single-point',
        calculationMode: 'point deviation by span',
        acceptanceStyle: 'within tolerance at point',
        captureSummary: 'Test capture',
        captureFields: [
          { id: 'expectedValue' as const, label: 'Expected', inputKind: 'numeric' as const },
          { id: 'observedValue' as const, label: 'Observed', inputKind: 'numeric' as const },
        ],
        calculationRangeOverride: null,
        conversionBasisSummary: undefined,
        expectedRangeSummary: undefined,
        checklistPrompts: [],
        checklistSteps: [],
        guidedDiagnosisPrompts: [],
        minimumSubmissionEvidence: ['structured-readings'],
        expectedEvidence: ['structured-readings', 'photo-evidence'],
        historyComparisonExpectation: 'Stable reading expected.',
      },
    ],
    guidance: [],
    historySummaries: [],
  };
}

describe('NR mandatory checklist items', () => {
  const registry = new LocalExecutionTemplateRegistry();

  it('always injects NR-10 electrical isolation and NR-12 lockout/tagout for all instrument families', () => {
    const snapshot = buildMinimalSnapshot('temperature-transmitter', 'tpl-tt-001') as any;
    const tag = snapshot.tags[0];
    const resolved = registry.resolveTemplate(snapshot, tag, 'tpl-tt-001');

    expect(resolved).not.toBeNull();
    const ids = resolved!.checklistSteps.map((s) => s.id);
    expect(ids).toContain('nr10-electrical-isolation');
    expect(ids).toContain('nr12-lockout-tagout');
  });

  it('injects NR-13 pressure items for pressure transmitter family', () => {
    const snapshot = buildMinimalSnapshot('pressure-transmitter', 'tpl-pt-001') as any;
    const tag = snapshot.tags[0];
    const resolved = registry.resolveTemplate(snapshot, tag, 'tpl-pt-001');

    const ids = resolved!.checklistSteps.map((s) => s.id);
    expect(ids).toContain('nr13-pressure-inspection');
    expect(ids).toContain('nr13-calibration-cert');
  });

  it('injects NR-13 level safety item for level transmitter family', () => {
    const snapshot = buildMinimalSnapshot('level-transmitter', 'tpl-lt-001') as any;
    const tag = snapshot.tags[0];
    const resolved = registry.resolveTemplate(snapshot, tag, 'tpl-lt-001');

    const ids = resolved!.checklistSteps.map((s) => s.id);
    expect(ids).toContain('nr13-level-safety');
  });

  it('injects NR-13 valve calibration item for control valve family', () => {
    const snapshot = buildMinimalSnapshot('control-valve-positioner', 'tpl-cv-001') as any;
    const tag = snapshot.tags[0];
    const resolved = registry.resolveTemplate(snapshot, tag, 'tpl-cv-001');

    const ids = resolved!.checklistSteps.map((s) => s.id);
    expect(ids).toContain('nr13-valve-calibration');
  });

  it('marks all NR items as nrMandatory: true with the correct nrArticle', () => {
    const snapshot = buildMinimalSnapshot('pressure-transmitter', 'tpl-pt-002') as any;
    const tag = snapshot.tags[0];
    const resolved = registry.resolveTemplate(snapshot, tag, 'tpl-pt-002');

    const nrItems = resolved!.checklistSteps.filter((s) => s.nrMandatory);
    expect(nrItems.length).toBeGreaterThanOrEqual(4); // NR-10, NR-12, NR-13 x2

    const nr10 = nrItems.find((s) => s.id === 'nr10-electrical-isolation');
    expect(nr10?.nrArticle).toBe('NR-10');

    const nr12 = nrItems.find((s) => s.id === 'nr12-lockout-tagout');
    expect(nr12?.nrArticle).toBe('NR-12');

    const nr13items = nrItems.filter((s) => s.nrArticle === 'NR-13');
    expect(nr13items.length).toBeGreaterThanOrEqual(2);
  });

  it('NR items are prepended before template-specific checklist items', () => {
    const snapshot = buildMinimalSnapshot('pressure-transmitter', 'tpl-pt-003') as any;
    snapshot.templates[0].checklistSteps = [
      {
        id: 'custom-step-1',
        prompt: 'Check the custom thing',
        whyItMatters: 'Important',
        helpsRuleOut: 'Nothing',
        sourceReference: 'CUSTOM',
      },
    ];
    const tag = snapshot.tags[0];
    const resolved = registry.resolveTemplate(snapshot, tag, 'tpl-pt-003');

    const ids = resolved!.checklistSteps.map((s) => s.id);
    // NR items come first
    expect(ids[0]).toBe('nr10-electrical-isolation');
    expect(ids[1]).toBe('nr12-lockout-tagout');
    // Custom item comes after
    expect(ids).toContain('custom-step-1');
    const customIndex = ids.indexOf('custom-step-1');
    const nr10Index = ids.indexOf('nr10-electrical-isolation');
    expect(nr10Index).toBeLessThan(customIndex);
  });
});
