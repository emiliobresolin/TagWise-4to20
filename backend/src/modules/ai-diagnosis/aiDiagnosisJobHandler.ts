import type { WorkerJobHandler, WorkerJobRecord } from '../worker-jobs/model';
import type { AiDiagnosisProvider } from './aiDiagnosisProvider';
import type { AiDiagnosisRepository } from './aiDiagnosisRepository';
import {
  AiDiagnosisProviderError,
  type AiDiagnosisInput,
  type AiDiagnosisRequestSource,
} from './model';
import { AI_DIAGNOSIS_JOB_TYPE, type AiDiagnosisJobPayload } from './aiDiagnosisService';

export interface AiDiagnosisJobHandlerOptions {
  repository: AiDiagnosisRepository;
  provider: AiDiagnosisProvider;
  now?: () => Date;
}

/**
 * Story 8.9 D-01: worker handler for the `ai-diagnosis.generate-for-report`
 * job. Reads the job payload, runs the provider, persists the result. Errors
 * are caught and the row is moved to `failed-nonblocking` so the supervisor
 * still sees a clear status without the report itself being held up. The
 * error is re-thrown so the worker job service can retry within its retry
 * budget.
 */
export function createAiDiagnosisJobHandler(
  options: AiDiagnosisJobHandlerOptions,
): WorkerJobHandler {
  const now = options.now ?? (() => new Date());

  return {
    jobType: AI_DIAGNOSIS_JOB_TYPE,
    async handle(job: WorkerJobRecord): Promise<void> {
      const payload = parseAiDiagnosisJobPayload(job.payloadJson);
      if (!payload) {
        await options.repository.markFailedNonblocking({
          ownerUserId: extractStringField(job.payloadJson, 'ownerUserId') ?? '',
          reportId: extractStringField(job.payloadJson, 'reportId') ?? '',
          failureReason: 'AI diagnosis job payload was malformed.',
          updatedAt: now().toISOString(),
        });
        throw new Error('AI diagnosis job payload was malformed.');
      }

      try {
        const result = await options.provider.generateDiagnosis(payload.input);
        const generatedAt = result.generatedAt;
        const detail = buildDetailText(result.likelyIssuePatterns, result.recommendedChecks);

        await options.repository.markAvailable({
          ownerUserId: payload.ownerUserId,
          reportId: payload.reportId,
          result,
          providerLabel: `${result.provider} (${result.model})`,
          summary: result.summary,
          detail,
          generatedAt,
          updatedAt: now().toISOString(),
        });
      } catch (error) {
        const failureReason =
          error instanceof AiDiagnosisProviderError
            ? error.message
            : error instanceof Error
              ? error.message
              : 'AI diagnosis provider failed.';

        await options.repository.markFailedNonblocking({
          ownerUserId: payload.ownerUserId,
          reportId: payload.reportId,
          failureReason,
          updatedAt: now().toISOString(),
        });

        // Re-throw so the worker job service can retry within its retry budget.
        // The AI row stays in 'failed-nonblocking' between retries — the
        // supervisor sees a clear status the entire time.
        throw error instanceof Error ? error : new Error(failureReason);
      }
    },
  };
}

function parseAiDiagnosisJobPayload(payload: unknown): AiDiagnosisJobPayload | null {
  if (typeof payload !== 'object' || payload === null) return null;
  const candidate = payload as Partial<AiDiagnosisJobPayload>;
  if (
    typeof candidate.ownerUserId !== 'string' ||
    typeof candidate.reportId !== 'string' ||
    !isRequestSource(candidate.requestSource) ||
    !isAiDiagnosisInput(candidate.input)
  ) {
    return null;
  }
  return candidate as AiDiagnosisJobPayload;
}

function isRequestSource(value: unknown): value is AiDiagnosisRequestSource {
  return value === 'auto-on-submit' || value === 'manual';
}

function isAiDiagnosisInput(value: unknown): value is AiDiagnosisInput {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Partial<AiDiagnosisInput>;
  return (
    typeof candidate.tagCode === 'string' &&
    typeof candidate.instrumentFamily === 'string' &&
    typeof candidate.templateId === 'string' &&
    typeof candidate.deterministicResultSummary === 'string' &&
    typeof candidate.historySummary === 'string' &&
    typeof candidate.evidenceSummary === 'string' &&
    Array.isArray(candidate.riskFlags)
  );
}

function extractStringField(payload: unknown, key: string): string | undefined {
  if (typeof payload !== 'object' || payload === null) return undefined;
  const value = (payload as Record<string, unknown>)[key];
  return typeof value === 'string' ? value : undefined;
}

function buildDetailText(
  patterns: string[],
  checks: string[],
): string {
  const patternLine = patterns.length > 0 ? `Padroes provaveis: ${patterns.join('; ')}.` : '';
  const checksLine = checks.length > 0 ? ` Sugestoes de verificacao: ${checks.join('; ')}.` : '';
  return `${patternLine}${checksLine}`.trim();
}
