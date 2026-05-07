import type { AiDiagnosisProvider } from './aiDiagnosisProvider';
import type { AiDiagnosisInput, AiDiagnosisResult } from './model';

export class MockAiDiagnosisProvider implements AiDiagnosisProvider {
  constructor(private readonly now: () => Date = () => new Date()) {}

  async generateDiagnosis(input: AiDiagnosisInput): Promise<AiDiagnosisResult> {
    const riskReasonTypes = input.riskFlags.map((riskFlag) => riskFlag.reasonType);

    return {
      provider: 'mock',
      model: 'mock-ai-diagnosis-v1',
      generatedAt: this.now().toISOString(),
      summary:
        `Mock assistive diagnosis for ${input.tagCode}: review deterministic results, recent history, and captured evidence before supervisor review.`,
      likelyIssuePatterns: [
        `${input.instrumentFamily} pattern requires field verification`,
        ...riskReasonTypes,
      ],
      recommendedChecks: [
        'Confirm deterministic calculation inputs before relying on AI suggestions.',
        'Compare the current result with the cached history summary.',
        'Verify minimum and expected evidence is captured before submission.',
      ],
      missingEvidenceWarnings: buildMissingEvidenceWarnings(input.evidenceSummary),
      disclaimer: 'assistive-ai-suggestion',
    };
  }
}

function buildMissingEvidenceWarnings(evidenceSummary: string): string[] {
  return evidenceSummary.trim().length === 0
    ? ['Evidence summary was empty when the assistive diagnosis was requested.']
    : [];
}
