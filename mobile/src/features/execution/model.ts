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
  toleranceSource: string;
  toleranceMode: 'percent-of-span' | 'absolute' | 'unavailable';
  toleranceValue: number | null;
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
  rawInputs: SharedExecutionCalculationRawInputs;
  result: SharedExecutionCalculationResult;
  updatedAt: string;
}
