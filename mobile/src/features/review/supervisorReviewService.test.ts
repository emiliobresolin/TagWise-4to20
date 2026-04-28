import { describe, expect, it } from 'vitest';

import type { ActiveUserSession } from '../auth/model';
import { SUPERVISOR_REVIEW_API_CONTRACT_VERSION } from './model';
import {
  SupervisorReviewAccessError,
  SupervisorReviewService,
} from './supervisorReviewService';

describe('SupervisorReviewService', () => {
  it('loads the connected supervisor review queue from the canonical backend client', async () => {
    const service = new SupervisorReviewService({
      async listSupervisorQueue() {
        return {
          contractVersion: SUPERVISOR_REVIEW_API_CONTRACT_VERSION,
          items: [
            {
              reportId: 'tag-report:wp-seed-1001:tag-pt-101',
              serverReportVersion: 'server-report:user-tech:tag-report:wp-seed-1001:tag-pt-101:v1',
              technicianUserId: 'user-tech',
              workPackageId: 'wp-seed-1001',
              tagId: 'tag-pt-101',
              templateId: 'tpl-pressure-as-found',
              templateVersion: '2026-04-v1',
              reportState: 'submitted-pending-review',
              lifecycleState: 'Submitted - Pending Supervisor Review',
              syncState: 'synced',
              submittedAt: '2026-04-23T14:06:00.000Z',
              acceptedAt: '2026-04-23T14:30:00.000Z',
              executionSummary: 'Structured pressure readings are captured.',
              riskFlagCount: 1,
              pendingEvidenceCount: 0,
            },
          ],
        };
      },
      async getSupervisorReportDetail() {
        throw new Error('not used');
      },
    });

    await expect(service.refreshQueue(buildSession())).resolves.toHaveLength(1);
  });

  it('blocks review loading when the supervisor session is offline', async () => {
    const service = new SupervisorReviewService({
      async listSupervisorQueue() {
        throw new Error('offline sessions must not call the review API');
      },
      async getSupervisorReportDetail() {
        throw new Error('offline sessions must not call the review API');
      },
    });

    await expect(
      service.refreshQueue(buildSession({ connectionMode: 'offline' })),
    ).rejects.toBeInstanceOf(SupervisorReviewAccessError);
  });

  it('blocks review loading for non-supervisor roles', async () => {
    const service = new SupervisorReviewService({
      async listSupervisorQueue() {
        throw new Error('technicians must not call the review API');
      },
      async getSupervisorReportDetail() {
        throw new Error('technicians must not call the review API');
      },
    });

    await expect(
      service.refreshQueue(buildSession({ role: 'technician' })),
    ).rejects.toBeInstanceOf(SupervisorReviewAccessError);
  });
});

function buildSession(
  overrides: Partial<ActiveUserSession> = {},
): ActiveUserSession {
  return {
    userId: 'user-supervisor',
    email: 'supervisor@tagwise.local',
    displayName: 'Field Supervisor',
    role: 'supervisor',
    lastAuthenticatedAt: '2026-04-23T14:00:00.000Z',
    accessTokenExpiresAt: '2026-04-23T14:15:00.000Z',
    refreshTokenExpiresAt: '2026-04-23T15:00:00.000Z',
    connectionMode: 'connected',
    reviewActionsAvailable: true,
    ...overrides,
  };
}
