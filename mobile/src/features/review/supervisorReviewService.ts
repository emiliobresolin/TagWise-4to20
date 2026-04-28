import type { ActiveUserSession } from '../auth/model';
import type {
  ManagerReviewDecisionResponse,
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
    return response.report;
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
