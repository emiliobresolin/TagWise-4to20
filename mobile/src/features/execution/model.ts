export type SharedExecutionStepKind =
  | 'context'
  | 'calculation'
  | 'history'
  | 'guidance'
  | 'report';

export type SharedExecutionCaptureFieldId = 'expectedValue' | 'observedValue';

export interface SharedExecutionTemplateStepContract {
  id: string;
  title: string;
  kind: SharedExecutionStepKind;
}

export interface SharedExecutionTemplateCaptureFieldContract {
  id: SharedExecutionCaptureFieldId;
  label: string;
  inputKind: 'numeric';
  unit?: string;
}

export interface SharedExecutionTemplateContract {
  id: string;
  title: string;
  version: string;
  instrumentFamily: string;
  testPattern: string;
  calculationMode: string;
  acceptanceStyle: string;
  captureSummary: string;
  captureFields: SharedExecutionTemplateCaptureFieldContract[];
  calculationRangeOverride: SharedExecutionCalculationRange | null;
  conversionBasisSummary: string | null;
  expectedRangeSummary: string | null;
  checklistPrompts: string[];
  checklistSteps: SharedExecutionGuidanceItem[];
  guidedDiagnosisPrompts: SharedExecutionGuidanceItem[];
  minimumSubmissionEvidence: string[];
  expectedEvidence: string[];
  historyComparisonExpectation: string;
  steps: SharedExecutionTemplateStepContract[];
}

export type SharedExecutionFieldState = 'available' | 'missing' | 'unavailable';

export interface SharedExecutionField {
  label: string;
  value: string;
  state: SharedExecutionFieldState;
}

export interface SharedExecutionStepView {
  id: string;
  title: string;
  kind: SharedExecutionStepKind;
  summary: string;
  detail: string;
  fields: SharedExecutionField[];
}

export interface SharedExecutionProgressState {
  currentStepId: string;
  visitedStepIds: string[];
  updatedAt: string;
}

export type SharedExecutionCalculationAcceptance =
  | 'pass'
  | 'fail'
  | 'unavailable';

export interface SharedExecutionCalculationDefinition {
  modeLabel: string;
  acceptanceLabel: string;
  expectedLabel: string;
  observedLabel: string;
  unit: string | null;
  span: number | null;
  calculationRange: SharedExecutionCalculationRange | null;
  toleranceSource: string;
  toleranceMode: 'percent-of-span' | 'absolute' | 'unavailable';
  toleranceValue: number | null;
  executionContext: SharedExecutionCalculationExecutionContext;
}

export interface SharedExecutionCalculationRange {
  min: number;
  max: number;
  unit: string;
}

export interface SharedExecutionCalculationExecutionContext {
  conversionBasisSummary: string | null;
  expectedRangeSummary: string | null;
}

export interface SharedExecutionCalculationRawInputs {
  expectedValue: string;
  observedValue: string;
}

export interface SharedExecutionCalculationResult {
  signedDeviation: number;
  absoluteDeviation: number;
  percentOfSpan: number | null;
  acceptance: SharedExecutionCalculationAcceptance;
  acceptanceReason: string;
}

export interface SharedExecutionCalculationState {
  definition: SharedExecutionCalculationDefinition;
  rawInputs: SharedExecutionCalculationRawInputs;
  result: SharedExecutionCalculationResult | null;
  updatedAt: string | null;
}

export interface SharedExecutionRiskInputs {
  historyState: 'available' | 'stale' | 'age-unknown' | 'missing' | 'unavailable';
  missingContextFieldLabels: string[];
}

export interface SharedExecutionShell {
  workPackageId: string;
  workPackageTitle: string;
  tagId: string;
  tagCode: string;
  template: SharedExecutionTemplateContract;
  steps: SharedExecutionStepView[];
  progress: SharedExecutionProgressState;
  calculation: SharedExecutionCalculationState | null;
  riskInputs: SharedExecutionRiskInputs;
  guidance: SharedExecutionGuidanceState;
  evidence: SharedExecutionEvidenceState;
  report: SharedExecutionReportDraftState;
}

export interface SharedExecutionGuidanceItem {
  id: string;
  prompt: string;
  whyItMatters: string;
  helpsRuleOut: string;
  sourceReference: string;
}

export type SharedExecutionChecklistOutcome =
  | 'pending'
  | 'completed'
  | 'incomplete'
  | 'skipped';

export interface SharedExecutionChecklistItem extends SharedExecutionGuidanceItem {
  outcome: SharedExecutionChecklistOutcome;
}

export interface SharedExecutionLinkedGuidanceSnippet {
  id: string;
  title: string;
  summary: string;
  whyItMatters: string;
  sourceReference: string;
}

export type SharedExecutionRiskReasonType =
  | 'missing-history'
  | 'missing-context'
  | 'checklist-skipped'
  | 'checklist-incomplete'
  | 'missing-expected-evidence'
  | 'missing-minimum-evidence';

export interface SharedExecutionRiskItem {
  id: string;
  reasonType: SharedExecutionRiskReasonType;
  severity: 'warning' | 'submit-block';
  title: string;
  detail: string;
  justificationRequired: boolean;
  justificationPrompt: string | null;
  justificationText: string;
}

export interface SharedExecutionGuidanceState {
  checklistItems: SharedExecutionChecklistItem[];
  guidedDiagnosisPrompts: SharedExecutionGuidanceItem[];
  linkedGuidance: SharedExecutionLinkedGuidanceSnippet[];
  riskState: 'clear' | 'flagged';
  riskHooks: string[];
  riskItems: SharedExecutionRiskItem[];
  submitReadiness: 'ready' | 'blocked';
  submitBlockingHooks: string[];
}

export type SharedExecutionPhotoAttachmentSource = 'camera' | 'library';

export type SharedExecutionPhotoSyncState =
  | 'local-only'
  | 'queued'
  | 'syncing'
  | 'pending-validation'
  | 'synced'
  | 'sync-issue';

export interface SharedExecutionPhotoAttachmentInput {
  source: SharedExecutionPhotoAttachmentSource;
  uri: string;
  fileName: string | null;
  mimeType: string | null;
  width: number | null;
  height: number | null;
  fileSize: number | null;
}

export interface SharedExecutionPhotoAttachment {
  evidenceId: string;
  executionStepId: SharedExecutionStepKind;
  fileName: string;
  mimeType: string | null;
  previewUri: string;
  mediaRelativePath: string;
  source: SharedExecutionPhotoAttachmentSource;
  width: number | null;
  height: number | null;
  fileSize: number | null;
  syncState: SharedExecutionPhotoSyncState;
  metadataSyncedAt: string | null;
  serverEvidenceId: string | null;
  storageObjectKey: string | null;
  uploadAuthorizedAt: string | null;
  binaryUploadedAt: string | null;
  presenceFinalizedAt: string | null;
  syncIssue: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SharedExecutionEvidenceState {
  draftReportId: string;
  draftReportState: SharedExecutionReportState;
  observationNotes: string;
  calculationEvidenceUpdatedAt: string | null;
  guidanceEvidenceUpdatedAt: string | null;
  photoAttachments: SharedExecutionPhotoAttachment[];
  photoEvidenceUpdatedAt: string | null;
}

export type SharedExecutionReportState =
  | 'technician-owned-draft'
  | 'submitted-pending-sync';

export type SharedExecutionReportLifecycleState =
  | 'In Progress'
  | 'Ready to Submit'
  | 'Submitted - Pending Sync';

export type SharedExecutionSyncState =
  | 'local-only'
  | 'queued';

export type SharedExecutionReportEvidenceRequirementLevel =
  | 'minimum'
  | 'expected';

export type SharedExecutionReportEvidenceKind =
  | 'structured-readings'
  | 'observation-notes'
  | 'photo-evidence'
  | 'unmapped';

export interface SharedExecutionReportEvidenceReference {
  label: string;
  requirementLevel: SharedExecutionReportEvidenceRequirementLevel;
  evidenceKind: SharedExecutionReportEvidenceKind;
  satisfied: boolean;
  detail: string;
}

export interface SharedExecutionReportChecklistOutcome {
  id: string;
  prompt: string;
  outcome: SharedExecutionChecklistOutcome;
  sourceReference: string;
}

export interface SharedExecutionReportDraftState {
  reportId: string;
  state: SharedExecutionReportState;
  lifecycleState: SharedExecutionReportLifecycleState;
  syncState: SharedExecutionSyncState;
  technicianName: string;
  technicianEmail: string;
  tagContextSummary: string;
  executionSummary: string;
  historySummary: string;
  draftDiagnosisSummary: string;
  checklistOutcomes: SharedExecutionReportChecklistOutcome[];
  evidenceReferences: SharedExecutionReportEvidenceReference[];
  riskFlags: SharedExecutionRiskItem[];
  reviewNotes: string;
  savedAt: string | null;
  submittedAt: string | null;
}

export interface StoredExecutionProgressRecord {
  workPackageId: string;
  tagId: string;
  templateId: string;
  templateVersion: string;
  instrumentFamily: string;
  testPattern: string;
  currentStepId: string;
  visitedStepIds: string[];
  updatedAt: string;
}

export interface StoredExecutionCalculationRecord {
  workPackageId: string;
  tagId: string;
  templateId: string;
  templateVersion: string;
  calculationMode: string;
  acceptanceStyle: string;
  executionContext: SharedExecutionCalculationExecutionContext;
  rawInputs: SharedExecutionCalculationRawInputs;
  result: SharedExecutionCalculationResult;
  updatedAt: string;
}

export interface StoredExecutionStructuredReadingsEvidence {
  expectedLabel: string;
  observedLabel: string;
  expectedValue: string;
  observedValue: string;
  unit: string | null;
  signedDeviation: number;
  absoluteDeviation: number;
  percentOfSpan: number | null;
  acceptance: SharedExecutionCalculationAcceptance;
  acceptanceReason: string;
}

export interface StoredExecutionChecklistOutcomeRecord {
  checklistItemId: string;
  outcome: SharedExecutionChecklistOutcome;
}

export interface StoredExecutionRiskJustificationRecord {
  riskItemId: string;
  reasonType: SharedExecutionRiskReasonType;
  justificationText: string;
}

export interface StoredExecutionEvidenceRecord {
  workPackageId: string;
  tagId: string;
  templateId: string;
  templateVersion: string;
  draftReportId: string;
  executionStepId: SharedExecutionStepKind;
  structuredReadings: StoredExecutionStructuredReadingsEvidence | null;
  observationNotes: string;
  checklistOutcomes: StoredExecutionChecklistOutcomeRecord[];
  riskJustifications: StoredExecutionRiskJustificationRecord[];
  createdAt: string;
  updatedAt: string;
}

export interface StoredExecutionPhotoAttachmentPayload {
  kind: 'photo';
  workPackageId: string;
  tagId: string;
  templateId: string;
  templateVersion: string;
  draftReportId: string;
  executionStepId: SharedExecutionStepKind;
  source: SharedExecutionPhotoAttachmentSource;
  width: number | null;
  height: number | null;
  fileSize: number | null;
  syncState?: SharedExecutionPhotoSyncState;
  metadataSyncedAt?: string | null;
  serverEvidenceId?: string | null;
  storageObjectKey?: string | null;
  uploadAuthorizedAt?: string | null;
  binaryUploadedAt?: string | null;
  presenceFinalizedAt?: string | null;
  syncIssue?: string | null;
}
