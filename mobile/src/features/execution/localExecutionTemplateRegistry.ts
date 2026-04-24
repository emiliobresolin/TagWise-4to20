import type {
  AssignedWorkPackageSnapshot,
  AssignedWorkPackageTagSnapshot,
  AssignedWorkPackageTemplateCaptureFieldSnapshot,
  AssignedWorkPackageTemplateGuidanceItemSnapshot,
} from '../work-packages/model';
import type { SharedExecutionGuidanceItem, SharedExecutionTemplateContract } from './model';

const sharedExecutionSteps = [
  { id: 'context', title: 'Context', kind: 'context' as const },
  { id: 'calculation', title: 'Calculation setup', kind: 'calculation' as const },
  { id: 'history', title: 'History comparison', kind: 'history' as const },
  { id: 'guidance', title: 'Checklist and guidance', kind: 'guidance' as const },
  { id: 'report', title: 'Report draft review', kind: 'report' as const },
];

export class LocalExecutionTemplateRegistry {
  resolveTemplate(
    snapshot: AssignedWorkPackageSnapshot,
    tag: AssignedWorkPackageTagSnapshot,
    templateId: string,
  ): SharedExecutionTemplateContract | null {
    if (!tag.templateIds.includes(templateId)) {
      return null;
    }

    const template = snapshot.templates.find((item) => item.id === templateId) ?? null;

    if (!template) {
      return null;
    }

    return {
      id: template.id,
      title: template.title,
      version: snapshot.summary.snapshotContractVersion,
      instrumentFamily: template.instrumentFamily,
      testPattern: template.testPattern,
      calculationMode: template.calculationMode,
      acceptanceStyle: template.acceptanceStyle,
      captureSummary: normalizeCaptureSummary(template.captureSummary, template.testPattern),
      captureFields: normalizeCaptureFields(template.captureFields),
      calculationRangeOverride: normalizeCalculationRange(template.calculationRangeOverride),
      conversionBasisSummary: normalizeOptionalSummary(template.conversionBasisSummary),
      expectedRangeSummary: normalizeOptionalSummary(template.expectedRangeSummary),
      checklistPrompts: normalizeChecklistPrompts(template.checklistPrompts),
      checklistSteps: normalizeGuidanceItems(
        template.checklistSteps,
        normalizeChecklistPrompts(template.checklistPrompts),
        snapshot,
        tag,
      ),
      guidedDiagnosisPrompts: normalizeDiagnosisPrompts(
        template.guidedDiagnosisPrompts,
        snapshot,
        tag,
      ),
      minimumSubmissionEvidence: template.minimumSubmissionEvidence,
      expectedEvidence: Array.isArray(template.expectedEvidence) ? template.expectedEvidence : [],
      historyComparisonExpectation: template.historyComparisonExpectation,
      steps: sharedExecutionSteps,
    };
  }
}

function normalizeCaptureSummary(
  captureSummary: string | undefined,
  testPattern: string,
): string {
  return typeof captureSummary === 'string' && captureSummary.trim().length > 0
    ? captureSummary
    : `Capture the local execution values for ${testPattern}.`;
}

function normalizeCaptureFields(
  captureFields: AssignedWorkPackageTemplateCaptureFieldSnapshot[] | undefined,
): SharedExecutionTemplateContract['captureFields'] {
  if (Array.isArray(captureFields) && captureFields.length > 0) {
    return captureFields;
  }

  return [
    { id: 'expectedValue', label: 'Expected value', inputKind: 'numeric' },
    { id: 'observedValue', label: 'Observed value', inputKind: 'numeric' },
  ];
}

function normalizeOptionalSummary(value: string | undefined): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function normalizeChecklistPrompts(value: string[] | undefined): string[] {
  return Array.isArray(value)
    ? value
        .map((item) => (typeof item === 'string' ? item.trim() : ''))
        .filter((item) => item.length > 0)
    : [];
}

function normalizeGuidanceItems(
  value: AssignedWorkPackageTemplateGuidanceItemSnapshot[] | undefined,
  fallbackPrompts: string[],
  snapshot: AssignedWorkPackageSnapshot,
  tag: AssignedWorkPackageTagSnapshot,
): SharedExecutionGuidanceItem[] {
  const explicitItems = normalizeExplicitGuidanceItems(value);
  if (explicitItems.length > 0) {
    return explicitItems;
  }

  const sourceReference = resolveFallbackSourceReference(snapshot, tag);
  return fallbackPrompts.map((prompt, index) => ({
    id: `checklist-${index + 1}`,
    prompt,
    whyItMatters: 'Keeps the check grounded in the cached field baseline before escalation.',
    helpsRuleOut: 'Common setup, wiring, or operating-condition issues before escalating the result.',
    sourceReference,
  }));
}

function normalizeDiagnosisPrompts(
  value: AssignedWorkPackageTemplateGuidanceItemSnapshot[] | undefined,
  snapshot: AssignedWorkPackageSnapshot,
  tag: AssignedWorkPackageTagSnapshot,
): SharedExecutionGuidanceItem[] {
  const explicitItems = normalizeExplicitGuidanceItems(value);
  if (explicitItems.length > 0) {
    return explicitItems;
  }

  return snapshot.guidance
    .filter((item) => tag.guidanceReferenceIds.includes(item.id))
    .map((item, index) => ({
      id: `diagnosis-${index + 1}`,
      prompt: item.summary,
      whyItMatters: item.whyItMatters,
      helpsRuleOut: 'Simple field-condition or setup issues before treating the result as a confirmed device fault.',
      sourceReference: item.sourceReference,
    }));
}

function normalizeExplicitGuidanceItems(
  value: AssignedWorkPackageTemplateGuidanceItemSnapshot[] | undefined,
): SharedExecutionGuidanceItem[] {
  return Array.isArray(value)
    ? value
        .map((item) => ({
          id: typeof item.id === 'string' ? item.id.trim() : '',
          prompt: typeof item.prompt === 'string' ? item.prompt.trim() : '',
          whyItMatters: typeof item.whyItMatters === 'string' ? item.whyItMatters.trim() : '',
          helpsRuleOut: typeof item.helpsRuleOut === 'string' ? item.helpsRuleOut.trim() : '',
          sourceReference:
            typeof item.sourceReference === 'string' ? item.sourceReference.trim() : '',
        }))
        .filter(
          (item) =>
            item.id.length > 0 &&
            item.prompt.length > 0 &&
            item.whyItMatters.length > 0 &&
            item.helpsRuleOut.length > 0 &&
            item.sourceReference.length > 0,
        )
    : [];
}

function resolveFallbackSourceReference(
  snapshot: AssignedWorkPackageSnapshot,
  tag: AssignedWorkPackageTagSnapshot,
): string {
  const reference = snapshot.guidance.find((item) => tag.guidanceReferenceIds.includes(item.id));
  return reference?.sourceReference ?? 'LOCAL-TEMPLATE-BASELINE';
}

function normalizeCalculationRange(
  range:
    | AssignedWorkPackageSnapshot['templates'][number]['calculationRangeOverride']
    | undefined,
): SharedExecutionTemplateContract['calculationRangeOverride'] {
  if (
    typeof range?.min === 'number' &&
    typeof range?.max === 'number' &&
    typeof range.unit === 'string' &&
    range.unit.trim().length > 0
  ) {
    return {
      min: range.min,
      max: range.max,
      unit: range.unit,
    };
  }

  return null;
}
