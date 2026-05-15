export type AiDiagnosisProviderName = 'mock' | 'openai';

/**
 * Story 8.9 D-01: canonical state machine for the per-report AI diagnosis row.
 * The mobile projection union (`VisualAiDiagnosisProjectionInput.state`)
 * mirrors these values 1:1 so the supervisor and technician see a stable
 * label. AI is always assistive — `failed-nonblocking` is the explicit
 * signal that a provider error MUST NOT halt the report itself.
 */
export type AiDiagnosisRecordState =
  | 'pending'
  | 'available'
  | 'unavailable'
  | 'failed-nonblocking';

export type AiDiagnosisRequestSource = 'auto-on-submit' | 'manual';

export interface AiDiagnosisRiskFlagInput {
  id: string;
  reasonType: string;
  detail: string;
}

export interface AiDiagnosisInput {
  tagCode: string;
  instrumentFamily: string;
  templateId: string;
  deterministicResultSummary: string;
  historySummary: string;
  riskFlags: AiDiagnosisRiskFlagInput[];
  evidenceSummary: string;
}

export interface AiDiagnosisResult {
  provider: AiDiagnosisProviderName;
  model: string;
  generatedAt: string;
  summary: string;
  likelyIssuePatterns: string[];
  recommendedChecks: string[];
  missingEvidenceWarnings: string[];
  disclaimer: 'assistive-ai-suggestion';
}

/**
 * Story 8.9 D-01: persisted per-report AI diagnosis row. Read by the
 * supervisor review projection and the technician's report status fetch.
 */
export interface AiDiagnosisRecord {
  ownerUserId: string;
  reportId: string;
  state: AiDiagnosisRecordState;
  result: AiDiagnosisResult | null;
  providerLabel: string | null;
  summary: string | null;
  detail: string | null;
  failureReason: string | null;
  lastRequestedAt: string;
  lastRequestSource: AiDiagnosisRequestSource;
  generatedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export class AiDiagnosisProviderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AiDiagnosisProviderError';
  }
}

export class AiDiagnosisServiceError extends Error {
  readonly statusCode: number;

  constructor(message: string, statusCode: number = 400) {
    super(message);
    this.name = 'AiDiagnosisServiceError';
    this.statusCode = statusCode;
  }
}
