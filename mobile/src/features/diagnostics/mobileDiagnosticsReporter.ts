import type { MobileRuntimeErrorRepository } from '../../data/local/repositories/mobileRuntimeErrorRepository';
import type { ActiveUserSession } from '../auth/model';
import type { MobileDiagnosticsApiClient } from './mobileDiagnosticsApiClient';

export interface MobileDiagnosticsReportSummary {
  attempted: number;
  succeeded: number;
  failed: number;
}

export class MobileDiagnosticsReporter {
  constructor(
    private readonly repository: MobileRuntimeErrorRepository,
    private readonly apiClient: MobileDiagnosticsApiClient,
  ) {}

  async flushUnreportedErrors(
    session: ActiveUserSession | null,
    limit: number = 10,
  ): Promise<MobileDiagnosticsReportSummary> {
    if (!session || session.connectionMode !== 'connected') {
      return {
        attempted: 0,
        succeeded: 0,
        failed: 0,
      };
    }

    const events = await this.repository.listUnreportedErrors(limit);
    const summary: MobileDiagnosticsReportSummary = {
      attempted: events.length,
      succeeded: 0,
      failed: 0,
    };

    for (const event of events) {
      try {
        const response = await this.apiClient.reportRuntimeError(event);
        await this.repository.markReported(event.id, response.reportedAt);
        summary.succeeded += 1;
      } catch {
        summary.failed += 1;
      }
    }

    return summary;
  }
}
