import { randomUUID } from 'node:crypto';

import type { AuthenticatedUser } from '../auth/model';
import type { AssignedWorkPackageService } from '../work-packages/assignedWorkPackageService';
import type { ReportSubmissionRepository } from '../report-submissions/reportSubmissionRepository';
import type { ReportSubmissionRequest } from '../report-submissions/model';
import type { WorkerJobRepository } from '../worker-jobs/workerJobRepository';
import type { AiDiagnosisRepository } from './aiDiagnosisRepository';
import {
  AiDiagnosisServiceError,
  type AiDiagnosisInput,
  type AiDiagnosisRecord,
  type AiDiagnosisRequestSource,
  type AiDiagnosisRiskFlagInput,
} from './model';

export const AI_DIAGNOSIS_JOB_TYPE = 'ai-diagnosis.generate-for-report' as const;

/**
 * Story 8.9 D-01: the structured payload the worker job handler consumes when
 * it picks up an `ai-diagnosis.generate-for-report` row. Everything the
 * provider needs is baked in at enqueue time so the worker is read-only on
 * report state — it never has to re-resolve work package snapshots or
 * authenticate as a particular user.
 */
export interface AiDiagnosisJobPayload extends Record<string, unknown> {
  ownerUserId: string;
  reportId: string;
  requestSource: AiDiagnosisRequestSource;
  input: AiDiagnosisInput;
}

export interface AiDiagnosisRequestInput {
  user: AuthenticatedUser;
  reportId: string;
  requestSource: AiDiagnosisRequestSource;
}

export class AiDiagnosisService {
  constructor(
    private readonly repository: AiDiagnosisRepository,
    private readonly workerJobRepository: WorkerJobRepository,
    private readonly reportSubmissionRepository: ReportSubmissionRepository,
    private readonly assignedWorkPackageService: AssignedWorkPackageService,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async requestForReport(
    input: AiDiagnosisRequestInput,
  ): Promise<AiDiagnosisRecord> {
    const reportOwnerUserId = input.user.id;
    const reportRecord = await this.reportSubmissionRepository.getByReportId(
      reportOwnerUserId,
      input.reportId,
    );
    if (!reportRecord) {
      throw new AiDiagnosisServiceError(
        'Report submission was not found for this technician.',
        404,
      );
    }

    const requestPayload = parseStoredReportRequest(reportRecord.payloadJson);
    if (!requestPayload) {
      throw new AiDiagnosisServiceError(
        'Report submission payload is missing the fields required to request an AI diagnosis.',
        409,
      );
    }

    const diagnosisInput = await this.buildDiagnosisInput(input.user, requestPayload);
    const requestedAt = this.now().toISOString();

    const pendingRow = await this.repository.upsertPending({
      ownerUserId: reportOwnerUserId,
      reportId: input.reportId,
      requestSource: input.requestSource,
      requestedAt,
    });

    if (pendingRow.state === 'available') {
      // Story 8.9: re-requesting an already-available diagnosis is a no-op.
      // The supervisor / technician already has a result; the worker should
      // not re-spend provider tokens unless the prior result is explicitly
      // discarded (deferred to a later story).
      return pendingRow;
    }

    const jobPayload: AiDiagnosisJobPayload = {
      ownerUserId: reportOwnerUserId,
      reportId: input.reportId,
      requestSource: input.requestSource,
      input: diagnosisInput,
    };

    await this.workerJobRepository.enqueue({
      id: `worker-job:${randomUUID()}`,
      jobType: AI_DIAGNOSIS_JOB_TYPE,
      idempotencyKey: buildAiDiagnosisJobIdempotencyKey({
        ownerUserId: reportOwnerUserId,
        reportId: input.reportId,
        requestedAt,
      }),
      payloadJson: jobPayload,
      maxAttempts: 3,
      availableAt: requestedAt,
      createdAt: requestedAt,
    });

    return pendingRow;
  }

  async getByReportId(
    ownerUserId: string,
    reportId: string,
  ): Promise<AiDiagnosisRecord | null> {
    return this.repository.getByReportId(ownerUserId, reportId);
  }

  private async buildDiagnosisInput(
    user: AuthenticatedUser,
    request: ReportSubmissionRequest,
  ): Promise<AiDiagnosisInput> {
    const snapshot = await this.assignedWorkPackageService.downloadAssignedPackage(
      user,
      request.workPackageId,
    );
    const tag = snapshot?.tags.find((item) => item.id === request.tagId);

    const tagCode = tag?.tagCode ?? request.tagId;
    const instrumentFamily = tag?.instrumentFamily ?? 'unknown';

    const riskFlags: AiDiagnosisRiskFlagInput[] = request.riskFlags.map((flag) => ({
      id: flag.id,
      reasonType: flag.reasonType,
      detail: flag.justificationText.trim().length > 0
        ? flag.justificationText.trim()
        : 'No technician justification captured.',
    }));

    const evidenceSummary = buildEvidenceSummary(request);

    return {
      tagCode,
      instrumentFamily,
      templateId: request.templateId,
      deterministicResultSummary: request.executionSummary,
      historySummary: request.historySummary,
      riskFlags,
      evidenceSummary,
    };
  }
}

export function buildAiDiagnosisJobIdempotencyKey(input: {
  ownerUserId: string;
  reportId: string;
  requestedAt: string;
}): string {
  return `${AI_DIAGNOSIS_JOB_TYPE}:${input.ownerUserId}:${input.reportId}:${input.requestedAt}`;
}

function parseStoredReportRequest(payload: unknown): ReportSubmissionRequest | null {
  const candidate = parseJsonObject(payload);
  if (!candidate) {
    return null;
  }
  if (
    typeof candidate.workPackageId !== 'string' ||
    typeof candidate.tagId !== 'string' ||
    typeof candidate.templateId !== 'string' ||
    typeof candidate.executionSummary !== 'string'
  ) {
    return null;
  }
  return candidate as unknown as ReportSubmissionRequest;
}

function parseJsonObject(value: unknown): Record<string, unknown> | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value) as unknown;
      return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : null;
    } catch {
      return null;
    }
  }
  if (typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

function buildEvidenceSummary(request: ReportSubmissionRequest): string {
  const photoCount = request.photoAttachments?.length ?? 0;
  const minimumGaps = request.evidenceReferences
    .filter((reference) => reference.requirementLevel === 'minimum' && !reference.satisfied)
    .map((reference) => reference.label);
  const minimumGapClause =
    minimumGaps.length > 0
      ? ` Minimum evidence missing: ${minimumGaps.join(', ')}.`
      : '';
  return `${photoCount} photo attachment(s) linked locally;${minimumGapClause} ${request.evidenceReferences.filter((reference) => reference.satisfied).length} satisfied evidence reference(s).`;
}
