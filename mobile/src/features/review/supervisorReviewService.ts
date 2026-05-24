import type { ActiveUserSession } from '../auth/model';
import {
  EVIDENCE_SYNC_API_CONTRACT_VERSION,
  type EvidenceUploadApiClient,
} from '../sync/evidenceUploadApiClient';
import type {
  ManagerReviewDecisionResponse,
  SupervisorReviewDecisionResponse,
  SupervisorReviewPhotoAttachment,
  SupervisorReviewQueueItem,
  SupervisorReviewReportDetail,
} from './model';
import type { SupervisorReviewApiClient } from './supervisorReviewApiClient';

export class SupervisorReviewAccessError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SupervisorReviewAccessError';
  }
}

export class SupervisorReviewService {
  constructor(
    private readonly apiClient: SupervisorReviewApiClient,
    // Story 10.2 (issue #4): optional evidence access client used to fetch
    // pre-signed download URLs for finalized photo attachments so the
    // review detail screen can render the actual images instead of only
    // metadata. Optional so legacy test harnesses that build the service
    // without an evidence client still typecheck.
    private readonly evidenceClient?: EvidenceUploadApiClient,
  ) {}

  async refreshQueue(session: ActiveUserSession): Promise<SupervisorReviewQueueItem[]> {
    assertConnectedSupervisor(session);

    const response = await this.apiClient.listSupervisorQueue();
    return response.items;
  }

  async loadReportDetail(
    session: ActiveUserSession,
    reportId: string,
  ): Promise<SupervisorReviewReportDetail> {
    assertConnectedSupervisor(session);

    const response = await this.apiClient.getSupervisorReportDetail(reportId);
    return this.attachPhotoDownloadUrls(response.report);
  }

  private async attachPhotoDownloadUrls(
    detail: SupervisorReviewReportDetail,
  ): Promise<SupervisorReviewReportDetail> {
    if (!this.evidenceClient || detail.photoAttachments.length === 0) {
      return detail;
    }

    const enriched = await Promise.all(
      detail.photoAttachments.map(async (attachment) => {
        if (!attachment.serverEvidenceId || !attachment.presenceFinalizedAt) {
          return attachment;
        }
        try {
          const authorization = await this.evidenceClient!.authorizeEvidenceBinaryAccess({
            contractVersion: EVIDENCE_SYNC_API_CONTRACT_VERSION,
            serverEvidenceId: attachment.serverEvidenceId,
          });
          return { ...attachment, downloadUrl: authorization.downloadUrl };
        } catch {
          // Story 10.2: a single failed authorization must not block the
          // rest of the detail render. The image just falls back to the
          // metadata-only card.
          return { ...attachment, downloadUrl: null } satisfies SupervisorReviewPhotoAttachment;
        }
      }),
    );

    return { ...detail, photoAttachments: enriched };
  }

  async approveReport(
    session: ActiveUserSession,
    reportId: string,
  ): Promise<SupervisorReviewDecisionResponse> {
    assertConnectedSupervisor(session);

    return this.apiClient.approveSupervisorReport(reportId);
  }

  async returnReport(
    session: ActiveUserSession,
    reportId: string,
    comment: string,
  ): Promise<SupervisorReviewDecisionResponse> {
    assertConnectedSupervisor(session);

    const trimmedComment = comment.trim();
    if (trimmedComment.length === 0) {
      throw new SupervisorReviewAccessError('Return comment is required before returning a report.');
    }

    return this.apiClient.returnSupervisorReport(reportId, trimmedComment);
  }

  async escalateReport(
    session: ActiveUserSession,
    reportId: string,
    rationale: string,
  ): Promise<SupervisorReviewDecisionResponse> {
    assertConnectedSupervisor(session);

    const trimmedRationale = rationale.trim();
    if (trimmedRationale.length === 0) {
      throw new SupervisorReviewAccessError(
        'Escalation rationale is required before escalating a report.',
      );
    }

    return this.apiClient.escalateSupervisorReport(reportId, trimmedRationale);
  }

  async refreshManagerQueue(session: ActiveUserSession): Promise<SupervisorReviewQueueItem[]> {
    assertConnectedManager(session);

    const response = await this.apiClient.listManagerQueue();
    return response.items;
  }

  async loadManagerReportDetail(
    session: ActiveUserSession,
    reportId: string,
  ): Promise<SupervisorReviewReportDetail> {
    assertConnectedManager(session);

    const response = await this.apiClient.getManagerReportDetail(reportId);
    return this.attachPhotoDownloadUrls(response.report);
  }

  async approveManagerReport(
    session: ActiveUserSession,
    reportId: string,
  ): Promise<ManagerReviewDecisionResponse> {
    assertConnectedManager(session);

    return this.apiClient.approveManagerReport(reportId);
  }

  async returnManagerReport(
    session: ActiveUserSession,
    reportId: string,
    comment: string,
  ): Promise<ManagerReviewDecisionResponse> {
    assertConnectedManager(session);

    const trimmedComment = comment.trim();
    if (trimmedComment.length === 0) {
      throw new SupervisorReviewAccessError('Manager return comment is required before returning a report.');
    }

    return this.apiClient.returnManagerReport(reportId, trimmedComment);
  }
}

function assertConnectedSupervisor(session: ActiveUserSession): void {
  if (session.role !== 'supervisor') {
    throw new SupervisorReviewAccessError('Supervisor role is required for the review queue.');
  }

  if (session.connectionMode !== 'connected') {
    throw new SupervisorReviewAccessError('Connected supervisor session is required for review.');
  }
}

function assertConnectedManager(session: ActiveUserSession): void {
  if (session.role !== 'manager') {
    throw new SupervisorReviewAccessError('Manager role is required for the review queue.');
  }

  if (session.connectionMode !== 'connected') {
    throw new SupervisorReviewAccessError('Connected manager session is required for review.');
  }
}
