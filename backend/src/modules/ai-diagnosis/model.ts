export type AiDiagnosisProviderName = 'mock' | 'openai';

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

export class AiDiagnosisProviderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AiDiagnosisProviderError';
  }
}
