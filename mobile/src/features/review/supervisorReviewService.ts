import type { ActiveUserSession } from '../auth/model';
import type {
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
}

function assertConnectedSupervisor(session: ActiveUserSession): void {
  if (session.role !== 'supervisor') {
    throw new SupervisorReviewAccessError('Supervisor role is required for the review queue.');
  }

  if (session.connectionMode !== 'connected') {
    throw new SupervisorReviewAccessError('Connected supervisor session is required for review.');
  }
}
