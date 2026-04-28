import type { AuthenticatedUser } from '../auth/model';
import type { AssignedWorkPackageService } from '../work-packages/assignedWorkPackageService';
import type { ReportSubmissionRepository } from './reportSubmissionRepository';
import {
  REPORT_SUBMISSION_API_CONTRACT_VERSION,
  ReportSubmissionError,
  assertTechnicianCanSubmitReport,
  type ReportSubmissionAcceptedResult,
  type ReportSubmissionIssueReasonCode,
  type ReportSubmissionRequest,
  type ReportSubmissionSyncIssue,
} from './model';

export class ReportSubmissionService {
  constructor(
    private readonly repository: ReportSubmissionRepository,
    private readonly assignedWorkPackageService: AssignedWorkPackageService,
    private readonly now: () => Date = () => new Date(),
  ) {}

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

      throw structuredIssue(
        'conflicting-report-version',
        'Report was already accepted at a different submitted version.',
        409,
        existing.serverReportVersion,
      );
    }

    await this.validateScope(user, request);
    validateLifecycle(request);
    validateMinimumEvidence(request);
    validateRequiredJustifications(request);
    validateEvidenceArrival(request);

    const acceptedAt = this.now().toISOString();
    const accepted = await this.repository.insertAcceptedOrGetExisting({
      ownerUserId: user.id,
      reportId: request.reportId,
      workPackageId: request.workPackageId,
      tagId: request.tagId,
      templateId: request.templateId,
      templateVersion: request.templateVersion,
      localObjectVersion: request.objectVersion,
      idempotencyKey: request.idempotencyKey,
      serverReportVersion: buildServerReportVersion(user.id, request.reportId, request.objectVersion),
      reportState: 'submitted-pending-review',
      lifecycleState: 'Submitted - Pending Supervisor Review',
      syncState: 'synced',
      submittedAt: request.submittedAt,
      acceptedAt,
      payloadJson: request,
      createdAt: acceptedAt,
      updatedAt: acceptedAt,
    });

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

    return toAcceptedResult(accepted);
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
  reportState: 'submitted-pending-review';
  lifecycleState: 'Submitted - Pending Supervisor Review';
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
