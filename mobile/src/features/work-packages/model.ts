export type AssignedWorkPackagePriority = 'routine' | 'high';
export type AssignedWorkPackageStatus = 'assigned' | 'in_progress' | 'pending_review' | 'completed';

export interface AssignedWorkPackageDueWindow {
  startsAt: string | null;
  endsAt: string | null;
}

export interface AssignedWorkPackageSummary {
  id: string;
  sourceReference: string;
  title: string;
  assignedTeam: string;
  priority: AssignedWorkPackagePriority;
  status: AssignedWorkPackageStatus;
  packageVersion: number;
  snapshotContractVersion: string;
  tagCount: number;
  dueWindow: AssignedWorkPackageDueWindow;
  updatedAt: string;
}

export interface LocalAssignedWorkPackageSummary extends AssignedWorkPackageSummary {
  downloadedAt: string | null;
  hasSnapshot: boolean;
  snapshotGeneratedAt: string | null;
}

export type AssignedWorkPackageReadinessState =
  | 'offline-ready'
  | 'incomplete'
  | 'stale'
  | 'age-unknown';

export interface AssignedWorkPackageTagSnapshot {
  id: string;
  tagCode: string;
  shortDescription: string;
  area: string;
  parentAssetReference: string;
  instrumentFamily: string;
  instrumentSubtype: string;
  measuredVariable: string;
  signalType: string;
  range: {
    min: number;
    max: number;
    unit: string;
  };
  tolerance: string;
  criticality: 'medium' | 'high';
  templateIds: string[];
  guidanceReferenceIds: string[];
  historySummaryId: string;
}

export interface AssignedWorkPackageTemplateSnapshot {
  id: string;
  instrumentFamily: string;
  testPattern: string;
  title: string;
  calculationMode: string;
  acceptanceStyle: string;
  captureSummary: string;
  captureFields: AssignedWorkPackageTemplateCaptureFieldSnapshot[];
  calculationRangeOverride?: AssignedWorkPackageTemplateCalculationRangeSnapshot;
  conversionBasisSummary?: string;
  expectedRangeSummary?: string;
  minimumSubmissionEvidence: string[];
  expectedEvidence: string[];
  historyComparisonExpectation: string;
}

export type AssignedWorkPackageTemplateCaptureFieldId = 'expectedValue' | 'observedValue';

export interface AssignedWorkPackageTemplateCaptureFieldSnapshot {
  id: AssignedWorkPackageTemplateCaptureFieldId;
  label: string;
  inputKind: 'numeric';
  unit?: string;
}

export interface AssignedWorkPackageTemplateCalculationRangeSnapshot {
  min: number;
  max: number;
  unit: string;
}

export interface AssignedWorkPackageGuidanceSnapshot {
  id: string;
  title: string;
  version: string;
  summary: string;
  whyItMatters: string;
  sourceReference: string;
}

export interface AssignedWorkPackageHistorySummarySnapshot {
  id: string;
  tagId: string;
  lastObservedAt: string;
  summaryText: string;
  lastResult: string;
  trendHint: string;
}

export interface AssignedWorkPackageSnapshot {
  contractVersion: string;
  generatedAt: string;
  summary: AssignedWorkPackageSummary;
  tags: AssignedWorkPackageTagSnapshot[];
  templates: AssignedWorkPackageTemplateSnapshot[];
  guidance: AssignedWorkPackageGuidanceSnapshot[];
  historySummaries: AssignedWorkPackageHistorySummarySnapshot[];
}

export interface LocalAssignedTagEntry {
  workPackageId: string;
  workPackageTitle: string;
  tagId: string;
  tagCode: string;
  shortDescription: string;
  area: string;
  instrumentFamily: string;
  instrumentSubtype: string;
  parentAssetReference: string;
}

export type LocalTagContextFieldState = 'available' | 'missing';
export type LocalTagHistoryPreviewState = 'available' | 'missing' | 'unavailable';
export type LocalTagReferencePointersState = 'available' | 'missing' | 'unavailable';

export interface LocalExecutionTemplateOption {
  id: string;
  title: string;
  instrumentFamily: string;
  testPattern: string;
  captureSummary: string;
  minimumSubmissionEvidence: string[];
  expectedEvidence: string[];
}

export interface LocalTagContextField {
  label: string;
  value: string;
  state: LocalTagContextFieldState;
}

export interface LocalTagHistoryPreview {
  state: LocalTagHistoryPreviewState;
  title: string;
  summary: string;
  detail: string;
  lastObservedAt: string | null;
}

export interface LocalTagReferencePointers {
  state: LocalTagReferencePointersState;
  templates: string[];
  executionTemplates: LocalExecutionTemplateOption[];
  guidance: string[];
  detail: string;
}

export interface LocalTagDueIndicator {
  label: string;
  value: string;
  state: LocalTagContextFieldState;
  overdue: boolean;
}

export interface LocalTagContext {
  workPackageId: string;
  workPackageTitle: string;
  tagId: string;
  tagCode: string;
  shortDescription: string;
  area: LocalTagContextField;
  parentAssetReference: LocalTagContextField;
  instrumentFamily: LocalTagContextField;
  instrumentSubtype: LocalTagContextField;
  measuredVariable: LocalTagContextField;
  signalType: LocalTagContextField;
  range: LocalTagContextField;
  tolerance: LocalTagContextField;
  criticality: LocalTagContextField;
  dueIndicator: LocalTagDueIndicator;
  historyPreview: LocalTagHistoryPreview;
  referencePointers: LocalTagReferencePointers;
}
