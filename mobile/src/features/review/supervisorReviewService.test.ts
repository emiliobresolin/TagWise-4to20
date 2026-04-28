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
      async approveSupervisorReport() {
        throw new Error('not used');
      },
      async returnSupervisorReport() {
        throw new Error('not used');
      },
      async escalateSupervisorReport() {
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
      async approveSupervisorReport() {
        throw new Error('offline sessions must not call the review API');
      },
      async returnSupervisorReport() {
        throw new Error('offline sessions must not call the review API');
      },
      async escalateSupervisorReport() {
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
      async approveSupervisorReport() {
        throw new Error('technicians must not call the review API');
      },
      async returnSupervisorReport() {
        throw new Error('technicians must not call the review API');
      },
      async escalateSupervisorReport() {
        throw new Error('technicians must not call the review API');
      },
    });

    await expect(
      service.refreshQueue(buildSession({ role: 'technician' })),
    ).rejects.toBeInstanceOf(SupervisorReviewAccessError);
  });

  it('sends connected supervisor approve, return, and escalation decisions through the backend client', async () => {
    const calls: Array<{ action: string; reportId: string; comment?: string; rationale?: string }> = [];
    const service = new SupervisorReviewService({
      async listSupervisorQueue() {
        throw new Error('not used');
      },
      async getSupervisorReportDetail() {
        throw new Error('not used');
      },
      async approveSupervisorReport(reportId) {
        calls.push({ action: 'approve', reportId });
        return {
          contractVersion: SUPERVISOR_REVIEW_API_CONTRACT_VERSION,
          reportId,
          decisionType: 'approved',
          reportState: 'approved',
          lifecycleState: 'Approved',
          syncState: 'synced',
          decidedAt: '2026-04-23T15:00:00.000Z',
          auditEventId: 'audit-approve',
          comment: null,
        };
      },
      async returnSupervisorReport(reportId, comment) {
        calls.push({ action: 'return', reportId, comment });
        return {
          contractVersion: SUPERVISOR_REVIEW_API_CONTRACT_VERSION,
          reportId,
          decisionType: 'returned',
          reportState: 'returned-by-supervisor',
          lifecycleState: 'Returned by Supervisor',
          syncState: 'synced',
          decidedAt: '2026-04-23T15:05:00.000Z',
          auditEventId: 'audit-return',
          comment,
        };
      },
      async escalateSupervisorReport(reportId, rationale) {
        calls.push({ action: 'escalate', reportId, rationale });
        return {
          contractVersion: SUPERVISOR_REVIEW_API_CONTRACT_VERSION,
          reportId,
          decisionType: 'escalated',
          reportState: 'escalated-pending-manager-review',
          lifecycleState: 'Escalated - Pending Manager Review',
          syncState: 'synced',
          decidedAt: '2026-04-23T15:10:00.000Z',
          auditEventId: 'audit-escalate',
          comment: rationale,
          managerReviewerUserId: 'user-manager',
        };
      },
    });

    await expect(
      service.approveReport(buildSession(), 'tag-report:wp-seed-1001:tag-pt-101'),
    ).resolves.toMatchObject({
      decisionType: 'approved',
      lifecycleState: 'Approved',
    });
    await expect(
      service.returnReport(
        buildSession(),
        'tag-report:wp-seed-1001:tag-pt-101',
        '  Clarify instrument note.  ',
      ),
    ).resolves.toMatchObject({
      decisionType: 'returned',
      lifecycleState: 'Returned by Supervisor',
      comment: 'Clarify instrument note.',
    });
    await expect(
      service.escalateReport(
        buildSession(),
        'tag-report:wp-seed-1001:tag-pt-101',
        '  Higher-risk review needed.  ',
      ),
    ).resolves.toMatchObject({
      decisionType: 'escalated',
      lifecycleState: 'Escalated - Pending Manager Review',
      comment: 'Higher-risk review needed.',
      managerReviewerUserId: 'user-manager',
    });

    expect(calls).toEqual([
      {
        action: 'approve',
        reportId: 'tag-report:wp-seed-1001:tag-pt-101',
      },
      {
        action: 'return',
        reportId: 'tag-report:wp-seed-1001:tag-pt-101',
        comment: 'Clarify instrument note.',
      },
      {
        action: 'escalate',
        reportId: 'tag-report:wp-seed-1001:tag-pt-101',
        rationale: 'Higher-risk review needed.',
      },
    ]);
  });

  it('blocks blank return comments before sending a supervisor return command', async () => {
    const service = new SupervisorReviewService({
      async listSupervisorQueue() {
        throw new Error('not used');
      },
      async getSupervisorReportDetail() {
        throw new Error('not used');
      },
      async approveSupervisorReport() {
        throw new Error('not used');
      },
      async returnSupervisorReport() {
        throw new Error('blank return comments must not call the review API');
      },
      async escalateSupervisorReport() {
        throw new Error('not used');
      },
    });

    await expect(
      service.returnReport(buildSession(), 'tag-report:wp-seed-1001:tag-pt-101', '   '),
    ).rejects.toBeInstanceOf(SupervisorReviewAccessError);
  });

  it('blocks blank escalation rationales before sending an escalation command', async () => {
    const service = new SupervisorReviewService({
      async listSupervisorQueue() {
        throw new Error('not used');
      },
      async getSupervisorReportDetail() {
        throw new Error('not used');
      },
      async approveSupervisorReport() {
        throw new Error('not used');
      },
      async returnSupervisorReport() {
        throw new Error('not used');
      },
      async escalateSupervisorReport() {
        throw new Error('blank escalation rationales must not call the review API');
      },
    });

    await expect(
      service.escalateReport(buildSession(), 'tag-report:wp-seed-1001:tag-pt-101', '   '),
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
