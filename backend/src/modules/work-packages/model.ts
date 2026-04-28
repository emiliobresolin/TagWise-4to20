export type AssignedWorkPackagePriority = 'routine' | 'high';
export type AssignedWorkPackageStatus =
  | 'assigned'
  | 'in_progress'
  | 'pending_review'
  | 'attention_needed'
  | 'completed';

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
  checklistPrompts?: string[];
  checklistSteps?: AssignedWorkPackageTemplateGuidanceItemSnapshot[];
  guidedDiagnosisPrompts?: AssignedWorkPackageTemplateGuidanceItemSnapshot[];
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

export interface AssignedWorkPackageTemplateGuidanceItemSnapshot {
  id: string;
  prompt: string;
  whyItMatters: string;
  helpsRuleOut: string;
  sourceReference: string;
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

export interface SeededAssignedWorkPackageRecord {
  summary: AssignedWorkPackageSummary;
  snapshot: AssignedWorkPackageSnapshot;
  assignedUserId: string;
}
