import type {
  AssignedWorkPackageSnapshot,
  AssignedWorkPackageTagSnapshot,
  AssignedWorkPackageTemplateCaptureFieldSnapshot,
} from '../work-packages/model';
import type { SharedExecutionTemplateContract } from './model';

const sharedExecutionSteps = [
  { id: 'context', title: 'Context', kind: 'context' as const },
  { id: 'calculation', title: 'Calculation setup', kind: 'calculation' as const },
  { id: 'history', title: 'History comparison', kind: 'history' as const },
  { id: 'guidance', title: 'Checklist and guidance', kind: 'guidance' as const },
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
