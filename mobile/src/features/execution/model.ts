export type SharedExecutionStepKind = 'context' | 'calculation' | 'history' | 'guidance';

export interface SharedExecutionTemplateStepContract {
  id: string;
  title: string;
  kind: SharedExecutionStepKind;
}

export interface SharedExecutionTemplateContract {
  id: string;
  title: string;
  version: string;
  instrumentFamily: string;
  testPattern: string;
  calculationMode: string;
  acceptanceStyle: string;
  minimumSubmissionEvidence: string[];
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

export interface SharedExecutionShell {
  workPackageId: string;
  workPackageTitle: string;
  tagId: string;
  tagCode: string;
  template: SharedExecutionTemplateContract;
  steps: SharedExecutionStepView[];
  progress: SharedExecutionProgressState;
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
