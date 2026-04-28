import type { ActiveUserSession } from '../auth/model';
import type {
  SupervisorReviewDecisionResponse,
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
  constructor(private readonly apiClient: SupervisorReviewApiClient) {}

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
    return response.report;
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
}

function assertConnectedSupervisor(session: ActiveUserSession): void {
  if (session.role !== 'supervisor') {
    throw new SupervisorReviewAccessError('Supervisor role is required for the review queue.');
  }

  if (session.connectionMode !== 'connected') {
    throw new SupervisorReviewAccessError('Connected supervisor session is required for review.');
  }
}
