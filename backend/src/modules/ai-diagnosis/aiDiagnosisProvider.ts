import type { AiDiagnosisInput, AiDiagnosisResult } from './model';

export interface AiDiagnosisProvider {
  generateDiagnosis(input: AiDiagnosisInput): Promise<AiDiagnosisResult>;
}
