import type { AuthenticatedUser } from '../auth/model';
import type { AiDiagnosisService } from '../ai-diagnosis/aiDiagnosisService';
import type { AssignedWorkPackageService } from '../work-packages/assignedWorkPackageService';
import type { ReportSubmissionRepository } from './reportSubmissionRepository';
import {
  REPORT_SUBMISSION_API_CONTRACT_VERSION,
  ReportSubmissionError,
  assertTechnicianCanSubmitReport,
  type ReportSubmissionApprovalHistoryItem,
  type ReportSubmissionAcceptedResult,
  type ReportSubmissionIssueReasonCode,
  type ReportSubmissionRecord,
  type ReportSubmissionRequest,
  type ReportSubmissionStatusResult,
  type ReportSubmissionSyncIssue,
} from './model';

export interface ReportSubmissionServiceOptions {
  /**
   * Story 8.9 D-01: when provided, `submitForValidation` enqueues an AI
   * diagnosis job after acceptance. Optional so existing tests can inject a
   * service without the AI subsystem; in production it is wired in
   * `api/main.ts`. Errors enqueueing AI must NEVER bubble up — AI is assistive
   * and non-blocking.
   */
  aiDiagnosisService?: AiDiagnosisService;
  /**
   * Optional logger callback for AI enqueue failures so production code can
   * surface them in structured logs without coupling this module to the
   * logger.
   */
  onAiEnqueueError?: (error: unknown, reportId: string) => void;
}

export class ReportSubmissionService {
  private readonly aiDiagnosisService?: AiDiagnosisService;
  private readonly onAiEnqueueError?: (error: unknown, reportId: string) => void;

  constructor(
    private readonly repository: ReportSubmissionRepository,
    private readonly assignedWorkPackageService: AssignedWorkPackageService,
    private readonly now: () => Date = () => new Date(),
    options: ReportSubmissionServiceOptions = {},
  ) {
    this.aiDiagnosisService = options.aiDiagnosisService;
    this.onAiEnqueueError = options.onAiEnqueueError;
  }

  async submitForValidation(
    user: AuthenticatedUser,
    request: ReportSubmissionRequest,
  ): Promise<ReportSubmissionAcceptedResult> {
    assertTechnicianCanSubmitReport(user);

    const existing = await this.repository.getByReportId(user.id, request.reportId);
    if (existing) {
      if (
        existing.localObjectVersion === request.objectVersion &&
        existing.idempotencyKey === request.idempotencyKey
      ) {
        return toAcceptedResult(existing);
      }

      if (isReturnedReport(existing)) {
        await this.validateAcceptedSubmission(user, request);
        const acceptedAt = this.now().toISOString();
        const accepted = await this.repository.replaceReturnedWithAccepted(
          buildAcceptedRecord(user.id, request, acceptedAt),
        );

        if (!accepted) {
          throw structuredIssue(
            'conflicting-report-version',
            'Report changed before the returned report could be resubmitted.',
            409,
            existing.serverReportVersion,
          );
        }

        await this.enqueueAiDiagnosisAfterAcceptance(user, accepted.reportId);
        return toAcceptedResult(accepted);
      }

      throw structuredIssue(
        'conflicting-report-version',
        'Report was already accepted at a different submitted version.',
        409,
        existing.serverReportVersion,
      );
    }

    await this.validateAcceptedSubmission(user, request);

    const acceptedAt = this.now().toISOString();
    const accepted = await this.repository.insertAcceptedOrGetExisting(
      buildAcceptedRecord(user.id, request, acceptedAt),
    );

    if (
      accepted.localObjectVersion !== request.objectVersion ||
      accepted.idempotencyKey !== request.idempotencyKey
    ) {
      throw structuredIssue(
        'conflicting-report-version',
        'Report was already accepted at a different submitted version.',
        409,
        accepted.serverReportVersion,
      );
    }

    await this.enqueueAiDiagnosisAfterAcceptance(user, accepted.reportId);
    return toAcceptedResult(accepted);
  }

  /**
   * Story 8.9 D-01: enqueue an AI diagnosis job for the just-accepted report.
   * AI is assistive — provider, repository, or queue failures must never
   * propagate to the technician submission path. The report submission has
   * already succeeded by this point; the AI job is best-effort background
   * work. Errors are logged via the optional callback.
   */
  private async enqueueAiDiagnosisAfterAcceptance(
    user: AuthenticatedUser,
    reportId: string,
  ): Promise<void> {
    if (!this.aiDiagnosisService) {
      return;
    }
    try {
      await this.aiDiagnosisService.requestForReport({
        user,
        reportId,
        requestSource: 'auto-on-submit',
      });
    } catch (error) {
      this.onAiEnqueueError?.(error, reportId);
    }
  }

  async getReportStatus(
    user: AuthenticatedUser,
    reportId: string,
  ): Promise<ReportSubmissionStatusResult> {
    assertTechnicianCanSubmitReport(user);

    const existing = await this.repository.getByReportId(user.id, reportId);
    if (!existing) {
      throw new ReportSubmissionError('Report submission was not found for this technician.', 404);
    }

    const approvalHistoryItems = await this.repository.listReportApprovalHistory(reportId);
    // Story 8.9 D-01: read the per-report AI diagnosis state. Missing rows
    // map to `'unavailable'` so the mobile projection has a stable default.
    const aiDiagnosisRecord = this.aiDiagnosisService
      ? await this.aiDiagnosisService.getByReportId(user.id, reportId)
      : null;
    return toStatusResult(existing, approvalHistoryItems, aiDiagnosisRecord);
  }

  private async validateAcceptedSubmission(
    user: AuthenticatedUser,
    request: ReportSubmissionRequest,
  ): Promise<void> {
    await this.validateScope(user, request);
    validateLifecycle(request);
    validateMinimumEvidence(request);
    validateRequiredJustifications(request);
    validateEvidenceArrival(request);
    // Story 8.9 C-02: bound the optional per-photo context label and
    // technician observation so a malicious or accidental large note does
    // not balloon the persisted JSON payload nor break the supervisor
    // render. Bounds match the mobile TextInput maxLength.
    validateOptionalPhotoMetadata(request);
  }

  private async validateScope(user: AuthenticatedUser, request: ReportSubmissionRequest): Promise<void> {
    const snapshot = await this.assignedWorkPackageService.downloadAssignedPackage(
      user,
      request.workPackageId,
    );
    const tag = snapshot?.tags.find((item) => item.id === request.tagId);
    const template = snapshot?.templates.find((item) => item.id === request.templateId);

    if (!snapshot || !tag || !template || !tag.templateIds.includes(template.id)) {
      throw structuredIssue(
        'out-of-scope',
        'Report submission does not match an assigned work package, tag, and template.',
        422,
      );
    }

    if (snapshot.contractVersion !== request.templateVersion) {
      throw structuredIssue(
        'out-of-scope',
        'Report submission template version does not match the assigned package snapshot.',
        422,
      );
    }

    validateTemplateMinimumEvidence(template.minimumSubmissionEvidence, request);
  }
}

function validateLifecycle(request: ReportSubmissionRequest): void {
  if (
    request.reportState !== 'submitted-pending-sync' ||
    request.lifecycleState !== 'Submitted - Pending Sync' ||
    (request.syncState !== 'queued' &&
      request.syncState !== 'syncing' &&
      request.syncState !== 'pending-validation')
  ) {
    throw structuredIssue(
      'invalid-lifecycle-transition',
      'Only locally submitted reports pending sync can be validated by the server.',
      422,
    );
  }
}

function validateMinimumEvidence(request: ReportSubmissionRequest): void {
  const unsatisfiedMinimum = request.evidenceReferences.find(
    (item) => item.requirementLevel === 'minimum' && !item.satisfied,
  );

  if (unsatisfiedMinimum) {
    throw structuredIssue(
      'minimum-evidence-missing',
      `Minimum evidence is missing: ${unsatisfiedMinimum.label}.`,
      422,
    );
  }
}

function validateTemplateMinimumEvidence(
  minimumSubmissionEvidence: string[],
  request: ReportSubmissionRequest,
): void {
  for (const label of minimumSubmissionEvidence) {
    const matchingReference = request.evidenceReferences.find(
      (item) => normalizeEvidenceLabel(item.label) === normalizeEvidenceLabel(label),
    );

    if (!matchingReference?.satisfied) {
      throw structuredIssue(
        'minimum-evidence-missing',
        `Minimum evidence is missing: ${label}.`,
        422,
      );
    }
  }
}

function validateRequiredJustifications(request: ReportSubmissionRequest): void {
  const missingJustification = request.riskFlags.find(
    (item) => item.justificationRequired && item.justificationText.trim().length === 0,
  );

  if (missingJustification) {
    throw structuredIssue(
      'required-justification-missing',
      `Required justification is missing for ${missingJustification.reasonType}.`,
      422,
    );
  }
}

function validateEvidenceArrival(request: ReportSubmissionRequest): void {
  const requiredPhotoEvidence = request.evidenceReferences.some(
    (item) =>
      item.requirementLevel === 'minimum' &&
      item.evidenceKind === 'photo-evidence' &&
      item.satisfied,
  );

  if (!requiredPhotoEvidence) {
    return;
  }

  const finalizedPhoto = request.photoAttachments.find(
    (item) => item.serverEvidenceId && item.presenceFinalizedAt,
  );
  if (!finalizedPhoto) {
    throw structuredIssue(
      'required-evidence-not-finalized',
      'Required photo evidence has not reached finalized server presence.',
      422,
    );
  }
}

/**
 * Story 8.9 C-02: cap the optional per-photo `contextNote` (sub-step label
 * set by the mobile client at attach time) and `technicianNote` (free-text
 * observation) so a malicious or accidental large note cannot balloon the
 * persisted JSON payload or break the supervisor render. Bounds:
 * - contextNote: <= 500 chars (sub-step labels are short by design)
 * - technicianNote: <= 2000 chars (free-text observations should fit in
 *   roughly one paragraph of field notes).
 * Violations are reported as malformed payload so the mobile client knows
 * to surface a validation error rather than treat it as a sync issue.
 */
export const CONTEXT_NOTE_MAX_LENGTH = 500;
export const TECHNICIAN_NOTE_MAX_LENGTH = 2000;
function validateOptionalPhotoMetadata(request: ReportSubmissionRequest): void {
  for (const attachment of request.photoAttachments ?? []) {
    if (
      typeof attachment.contextNote === 'string' &&
      attachment.contextNote.length > CONTEXT_NOTE_MAX_LENGTH
    ) {
      throw structuredIssue(
        'malformed-report-payload',
        `Photo contextNote exceeds the ${CONTEXT_NOTE_MAX_LENGTH}-character limit.`,
        400,
      );
    }
    if (
      typeof attachment.technicianNote === 'string' &&
      attachment.technicianNote.length > TECHNICIAN_NOTE_MAX_LENGTH
    ) {
      throw structuredIssue(
        'malformed-report-payload',
        `Photo technicianNote exceeds the ${TECHNICIAN_NOTE_MAX_LENGTH}-character limit.`,
        400,
      );
    }
  }
}

function structuredIssue(
  reasonCode: ReportSubmissionIssueReasonCode,
  message: string,
  statusCode: number,
  serverReportVersion?: string,
): ReportSubmissionError {
  const syncIssue: ReportSubmissionSyncIssue = {
    reasonCode,
    message,
  };
  if (serverReportVersion) {
    syncIssue.serverReportVersion = serverReportVersion;
  }

  return new ReportSubmissionError(message, statusCode, syncIssue);
}

function toAcceptedResult(record: {
  reportId: string;
  serverReportVersion: string;
  reportState: ReportSubmissionAcceptedResult['reportState'];
  lifecycleState: ReportSubmissionAcceptedResult['lifecycleState'];
  syncState: 'synced';
  acceptedAt: string;
}): ReportSubmissionAcceptedResult {
  return {
    contractVersion: REPORT_SUBMISSION_API_CONTRACT_VERSION,
    reportId: record.reportId,
    serverReportVersion: record.serverReportVersion,
    reportState: record.reportState,
    lifecycleState: record.lifecycleState,
    syncState: record.syncState,
    acceptedAt: record.acceptedAt,
  };
}

function toStatusResult(
  record: Parameters<typeof toAcceptedResult>[0],
  approvalHistoryItems: ReportSubmissionApprovalHistoryItem[],
  aiDiagnosisRecord: import('../ai-diagnosis/model').AiDiagnosisRecord | null,
): ReportSubmissionStatusResult {
  return {
    ...toAcceptedResult(record),
    approvalHistory: {
      items: approvalHistoryItems,
      placeholder:
        approvalHistoryItems.length === 0
          ? 'No approval decisions have been recorded for this report yet.'
          : '',
    },
    aiDiagnosis: toAiDiagnosisProjection(aiDiagnosisRecord),
  };
}

export function toAiDiagnosisProjection(
  record: import('../ai-diagnosis/model').AiDiagnosisRecord | null,
): import('./model').ReportSubmissionAiDiagnosisProjection {
  if (!record) {
    return {
      state: 'unavailable',
      summary: null,
      detail: null,
      providerLabel: null,
      generatedAt: null,
      failureReason: null,
      lastRequestedAt: null,
    };
  }
  return {
    state: record.state,
    summary: record.summary,
    detail: record.detail,
    providerLabel: record.providerLabel,
    generatedAt: record.generatedAt,
    failureReason: record.failureReason,
    lastRequestedAt: record.lastRequestedAt,
  };
}

function buildAcceptedRecord(
  ownerUserId: string,
  request: ReportSubmissionRequest,
  acceptedAt: string,
): ReportSubmissionRecord {
  return {
    ownerUserId,
    reportId: request.reportId,
    workPackageId: request.workPackageId,
    tagId: request.tagId,
    templateId: request.templateId,
    templateVersion: request.templateVersion,
    localObjectVersion: request.objectVersion,
    idempotencyKey: request.idempotencyKey,
    serverReportVersion: buildServerReportVersion(ownerUserId, request.reportId, request.objectVersion),
    reportState: 'submitted-pending-review',
    lifecycleState: 'Submitted - Pending Supervisor Review',
    syncState: 'synced',
    submittedAt: request.submittedAt,
    acceptedAt,
    payloadJson: request,
    createdAt: acceptedAt,
    updatedAt: acceptedAt,
  };
}

function isReturnedReport(record: Pick<ReportSubmissionRecord, 'lifecycleState'>): boolean {
  return (
    record.lifecycleState === 'Returned by Supervisor' ||
    record.lifecycleState === 'Returned by Manager'
  );
}

function buildServerReportVersion(
  ownerUserId: string,
  reportId: string,
  objectVersion: string,
): string {
  return `report-submission:${sanitizeVersionSegment(ownerUserId)}:${sanitizeVersionSegment(reportId)}:${sanitizeVersionSegment(objectVersion)}`;
}

function sanitizeVersionSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9._:-]+/g, '-');
}

function normalizeEvidenceLabel(value: string): string {
  return value.trim().toLowerCase();
}
