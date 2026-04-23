export type SharedExecutionStepKind = 'context' | 'calculation' | 'history' | 'guidance';

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

export interface SharedExecutionShell {
  workPackageId: string;
  workPackageTitle: string;
  tagId: string;
  tagCode: string;
  template: SharedExecutionTemplateContract;
  steps: SharedExecutionStepView[];
  progress: SharedExecutionProgressState;
  calculation: SharedExecutionCalculationState | null;
  guidance: SharedExecutionGuidanceState;
  evidence: SharedExecutionEvidenceState;
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

export interface SharedExecutionGuidanceState {
  checklistItems: SharedExecutionChecklistItem[];
  guidedDiagnosisPrompts: SharedExecutionGuidanceItem[];
  linkedGuidance: SharedExecutionLinkedGuidanceSnippet[];
  riskState: 'clear' | 'flagged';
  riskHooks: string[];
}

export type SharedExecutionPhotoAttachmentSource = 'camera' | 'library';

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
  createdAt: string;
  updatedAt: string;
}

export interface SharedExecutionEvidenceState {
  draftReportId: string;
  draftReportState: 'technician-owned-draft';
  observationNotes: string;
  calculationEvidenceUpdatedAt: string | null;
  guidanceEvidenceUpdatedAt: string | null;
  photoAttachments: SharedExecutionPhotoAttachment[];
  photoEvidenceUpdatedAt: string | null;
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
}
