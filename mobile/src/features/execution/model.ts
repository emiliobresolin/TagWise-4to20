export type SharedExecutionStepKind =
  | 'context'
  | 'instrument'
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
  /**
   * Optional human-readable sub-step context for this photo. Used to
   * disambiguate photos taken at different points of a multi-point execution
   * (e.g., "Ponto de loop 50%"). System-set at attach time.
   * Set per-call via `attachPhotoEvidence(..., { contextNote })`.
   */
  contextNote: string | null;
  /**
   * Optional free-text technician observation for this photo (e.g.,
   * "Loop OK, cabos danificados na flange"). User-set at or after attach.
   * Separate from `contextNote`: contextNote is system-set sub-step label,
   * technicianNote is free-text observation.
   */
  technicianNote: string | null;
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

export interface SharedExecutionLoopReadingPoint {
  setpointPercent: number;
  expected: string;
  measured: string;
  expectedPv: number | null;
  expectedMa: number | null;
  measuredPv: number | null;
  measuredMa: number | null;
  error: number | null;
  errorPercent: number | null;
  passed: boolean | null;
}

export interface SharedExecutionEvidenceState {
  draftReportId: string;
  draftReportState: SharedExecutionReportState;
  observationNotes: string;
  calculationEvidenceUpdatedAt: string | null;
  guidanceEvidenceUpdatedAt: string | null;
  photoAttachments: SharedExecutionPhotoAttachment[];
  photoEvidenceUpdatedAt: string | null;
  // Story 8.15: when the technician saved a loop test on this
  // template, the per-point detail rehydrates here so the loop screen
  // can show the curve after navigating away and the Report screen can
  // display a formatted results section.
  loopReadings: SharedExecutionLoopReadingPoint[];
  loopInputMode: 'pv' | 'ma' | null;
  loopUpdatedAt: string | null;
}

export type SharedExecutionReportState =
  | 'technician-owned-draft'
  | 'submitted-pending-sync'
  | 'submitted-pending-review';

export type SharedExecutionReportLifecycleState =
  | 'In Progress'
  | 'Ready to Submit'
  | 'Submitted - Pending Sync'
  | 'Submitted - Pending Supervisor Review'
  | 'Escalated - Pending Manager Review'
  | 'Returned by Supervisor'
  | 'Returned by Manager'
  | 'Approved';

export type SharedExecutionSyncState =
  | 'local-only'
  | 'queued'
  | 'syncing'
  | 'pending-validation'
  | 'synced'
  | 'sync-issue';

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

export interface SharedExecutionApprovalHistoryItem {
  auditEventId: string;
  actorRole: string;
  actionType: string;
  occurredAt: string;
  correlationId: string;
  priorState: string | null;
  nextState: string | null;
  comment: string | null;
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
  syncIssue?: string | null;
  syncIssueReasonCode?: string | null;
  // Story 8.12 finding #2: when a supervisor returns a report, the draft
  // is marked `invalidated: true` so the technician cannot keep editing
  // the same row. Re-opening the tag mints a fresh draft (new reportId),
  // and the invalidated row remains as a read-only history entry the
  // technician can review but not re-submit. `invalidationReason` carries
  // the supervisor's "Devolver" comment so the technician understands
  // what needs to change in the new visit.
  invalidated?: boolean;
  invalidationReason?: string | null;
  approvalHistory?: {
    items: SharedExecutionApprovalHistoryItem[];
    placeholder: string;
  };
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

export interface StoredExecutionLoopReadingPoint {
  setpointPercent: number;
  expected: string;
  measured: string;
  expectedPv: number | null;
  expectedMa: number | null;
  measuredPv: number | null;
  measuredMa: number | null;
  error: number | null;
  errorPercent: number | null;
  passed: boolean | null;
}

export type StoredExecutionLoopInputMode = 'pv' | 'ma';

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
  // Story 8.15: when this evidence row was produced by a loop test,
  // the per-point detail is preserved here so the loop screen can
  // rehydrate the points after the technician navigates away and the
  // Report screen can render a "Resultados do teste de loop" table.
  // The single-point fields above reflect the worst-case row for
  // visit aggregation. Old rows that pre-date this field stay valid
  // because both fields below are optional.
  loopReadings?: StoredExecutionLoopReadingPoint[];
  loopInputMode?: StoredExecutionLoopInputMode;
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
  /**
   * Persisted form of `SharedExecutionPhotoAttachment.contextNote`. Optional and
   * backwards-compatible: existing rows pre-Story-8.7 do not have this field; the
   * parser falls back to `null`.
   */
  contextNote?: string | null;
  /**
   * Persisted form of `SharedExecutionPhotoAttachment.technicianNote`. Optional
   * and backwards-compatible: existing rows pre-Story-8.8 do not have this
   * field; the parser falls back to `null`.
   */
  technicianNote?: string | null;
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
