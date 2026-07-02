import { describe, expect, it } from 'vitest';

import type { ActiveUserSession } from '../auth/model';
import type { SupervisorReviewQueueItem, SupervisorReviewReportDetail } from '../review/model';
import {
  buildVisualReviewAccess,
  buildVisualReviewDecisionFeedback,
  buildVisualReviewDecisionRequest,
  buildVisualReviewDetailProjection,
  buildVisualReviewQueueGroups,
  createVisualReviewDecisionActions,
} from './serviceBackedReview';

describe('service-backed visual review adapter', () => {
  it('hides review entry and actions from technician sessions', () => {
    const access = buildVisualReviewAccess(buildSession({ role: 'technician' }));
    const detail = buildVisualReviewDetailProjection(buildReportDetail(), access);

    expect(access).toMatchObject({
      state: 'hidden',
      entryVisible: false,
      canLoadQueue: false,
      canUseDecisionActions: false,
    });
    expect(detail.canApprove).toBe(false);
    expect(detail.canReturn).toBe(false);
    expect(detail.canEscalate).toBe(false);
  });

  it('exposes connected supervisor and manager review access while preserving role-specific escalation', () => {
    const supervisor = buildVisualReviewAccess(buildSession({ role: 'supervisor' }));
    const manager = buildVisualReviewAccess(buildSession({ role: 'manager' }));

    expect(supervisor).toMatchObject({
      state: 'available',
      reviewerRole: 'supervisor',
      entryVisible: true,
      canLoadQueue: true,
    });
    expect(
      buildVisualReviewDetailProjection(buildReportDetail(), supervisor),
    ).toMatchObject({
      canApprove: true,
      canReturn: true,
      canEscalate: true,
    });
    expect(manager).toMatchObject({
      state: 'available',
      reviewerRole: 'manager',
      entryVisible: true,
      canLoadQueue: true,
    });
    expect(buildVisualReviewDetailProjection(buildReportDetail(), manager)).toMatchObject({
      canApprove: true,
      canReturn: true,
      canEscalate: false,
    });
  });

  it('keeps offline reviewer sessions in a connected-required state without API/action authority', () => {
    const access = buildVisualReviewAccess(
      buildSession({
        role: 'supervisor',
        connectionMode: 'offline',
        reviewActionsAvailable: false,
      }),
    );
    const detail = buildVisualReviewDetailProjection(buildReportDetail(), access);

    expect(access).toMatchObject({
      state: 'connected-required',
      entryVisible: false,
      canLoadQueue: false,
      canUseDecisionActions: false,
    });
    expect(detail.canApprove).toBe(false);
    expect(detail.canReturn).toBe(false);
    expect(detail.canEscalate).toBe(false);
  });

  it('groups review queue items by service-provided lifecycle state without demo reports', () => {
    const groups = buildVisualReviewQueueGroups([
      buildQueueItem({ reportId: 'report-pending', reportState: 'submitted-pending-review' }),
      buildQueueItem({
        reportId: 'report-escalated',
        reportState: 'escalated-pending-manager-review',
        lifecycleState: 'Escalated - Pending Manager Review',
      }),
      buildQueueItem({
        reportId: 'report-approved',
        reportState: 'approved',
        lifecycleState: 'Approved',
      }),
    ]);

    expect(groups.find((group) => group.key === 'pending-review')?.items).toHaveLength(1);
    expect(groups.find((group) => group.key === 'pending-review')?.count).toBe(1);
    expect(groups.find((group) => group.key === 'escalated')?.items[0]?.reportId).toBe(
      'report-escalated',
    );
    expect(groups.find((group) => group.key === 'approved')?.items[0]?.statusLabel).toBe(
      'Approved',
    );
    expect(JSON.stringify(groups)).not.toContain('PT-204');
    expect(JSON.stringify(groups)).not.toContain('Enviar para Aprovacao');
  });

  it('projects service-backed report detail, evidence, risk, AI, and approval history', () => {
    const access = buildVisualReviewAccess(buildSession({ role: 'supervisor' }));
    const detail = buildVisualReviewDetailProjection(buildReportDetail(), access);

    expect(detail.state).toBe('available');
    expect(detail.summaryRows.map((row) => row.value)).toContain(
      'Structured pressure readings are captured.',
    );
    expect(detail.evidenceReferences[0]).toMatchObject({
      label: 'Structured readings',
      stateLabel: 'Atendida',
    });
    expect(detail.photoAttachments[0]).toMatchObject({
      evidenceId: 'evidence-photo-001',
      finalizedLabel: expect.stringContaining('2026'),
    });
    expect(detail.riskFlags[0]).toMatchObject({
      reasonType: 'missing-expected-evidence',
      stateLabel: 'Risco visivel',
      justificationLabel: 'Area access restricted.',
    });
    expect(detail.approvalHistory.items[0]).toMatchObject({
      actorRole: 'supervisor',
      actionType: 'report.supervisor.escalated',
      stateTransitionLabel:
        'Submitted - Pending Supervisor Review -> Escalated - Pending Manager Review',
      correlationId: 'corr-escalate',
    });
    expect(detail.aiDiagnosis).toMatchObject({
      state: 'unavailable',
      blocking: false,
    });
    // When decisions exist, no placeholder is rendered.
    expect(detail.approvalHistory.placeholder).toBe('');
  });

  it('replaces the backend English empty-history placeholder with PT-BR copy', () => {
    const access = buildVisualReviewAccess(buildSession({ role: 'supervisor' }));
    const report = buildReportDetail();
    report.approvalHistory = {
      items: [],
      placeholder: 'No approval decisions have been recorded for this report yet.',
    };

    const detail = buildVisualReviewDetailProjection(report, access);

    expect(detail.approvalHistory.items).toHaveLength(0);
    expect(detail.approvalHistory.placeholder).toBe(
      'Nenhuma decisao de aprovacao foi registrada para este relatorio ainda.',
    );
  });

  it('requires confirmation before approval dispatch', async () => {
    const access = buildVisualReviewAccess(buildSession({ role: 'supervisor' }));
    const detail = buildVisualReviewDetailProjection(buildReportDetail(), access);
    const calls: string[] = [];
    const actions = createVisualReviewDecisionActions({
      onApproveReport: (reportId) => {
        calls.push(`approve:${reportId}`);
      },
      onReturnReport: (reportId) => {
        calls.push(`return:${reportId}`);
      },
      onEscalateReport: (reportId) => {
        calls.push(`escalate:${reportId}`);
      },
    });
    const request = buildVisualReviewDecisionRequest({
      kind: 'approve',
      detail,
      returnComment: '',
      escalationRationale: '',
    });

    expect(request).toMatchObject({
      state: 'requires-confirmation',
      kind: 'approve',
    });
    expect(calls).toEqual([]);

    await actions.confirmDecision(request);

    expect(calls).toEqual(['approve:tag-report:wp-seed-1001:tag-pt-101']);
    expect(
      buildVisualReviewDecisionFeedback({
        kind: 'approve',
        reportId: 'tag-report:wp-seed-1001:tag-pt-101',
        tagId: 'PT-101',
      }),
    ).toContain('aprovado');
  });

  it('blocks return/escalation without required comments and dispatches only confirmed requests', async () => {
    const access = buildVisualReviewAccess(buildSession({ role: 'supervisor' }));
    const detail = buildVisualReviewDetailProjection(buildReportDetail(), access);
    const calls: string[] = [];
    const actions = createVisualReviewDecisionActions({
      onApproveReport: (reportId) => {
        calls.push(`approve:${reportId}`);
      },
      onReturnReport: (reportId) => {
        calls.push(`return:${reportId}`);
      },
      onEscalateReport: (reportId) => {
        calls.push(`escalate:${reportId}`);
      },
    });

    expect(
      buildVisualReviewDecisionRequest({
        kind: 'return',
        detail,
        returnComment: '   ',
        escalationRationale: '',
      }),
    ).toMatchObject({
      state: 'blocked',
      message: 'Comentario e obrigatorio antes de devolver o relatorio.',
    });
    expect(
      buildVisualReviewDecisionRequest({
        kind: 'escalate',
        detail,
        returnComment: '',
        escalationRationale: '   ',
      }),
    ).toMatchObject({
      state: 'blocked',
      message: 'Justificativa e obrigatoria antes de escalar o relatorio.',
    });

    const returnRequest = buildVisualReviewDecisionRequest({
      kind: 'return',
      detail,
      returnComment: ' Needs calibration note. ',
      escalationRationale: '',
    });
    const escalationRequest = buildVisualReviewDecisionRequest({
      kind: 'escalate',
      detail,
      returnComment: '',
      escalationRationale: ' Higher-risk review needed. ',
    });

    expect(calls).toEqual([]);
    await actions.confirmDecision(returnRequest);
    await actions.confirmDecision(escalationRequest);

    expect(calls).toEqual([
      'return:tag-report:wp-seed-1001:tag-pt-101',
      'escalate:tag-report:wp-seed-1001:tag-pt-101',
    ]);
  });

  it('blocks visual decision dispatch for technician access even with a stale selected detail', () => {
    const access = buildVisualReviewAccess(buildSession({ role: 'technician' }));
    const detail = buildVisualReviewDetailProjection(buildReportDetail(), access);

    expect(
      buildVisualReviewDecisionRequest({
        kind: 'approve',
        detail,
        returnComment: '',
        escalationRationale: '',
      }),
    ).toMatchObject({
      state: 'blocked',
      message: 'Acesso conectado de revisor e obrigatorio antes de aprovar.',
    });
  });
});

function buildSession(overrides: Partial<ActiveUserSession> = {}): ActiveUserSession {
  const role = overrides.role ?? 'supervisor';
  const connectionMode = overrides.connectionMode ?? 'connected';
  return {
    userId: `user-${role}`,
    email: `${role}@tagwise.local`,
    displayName: `Field ${role}`,
    role,
    lastAuthenticatedAt: '2026-05-10T10:00:00.000Z',
    accessTokenExpiresAt: '2026-05-10T11:00:00.000Z',
    refreshTokenExpiresAt: '2026-05-10T12:00:00.000Z',
    connectionMode,
    reviewActionsAvailable:
      connectionMode === 'connected' && (role === 'supervisor' || role === 'manager'),
    ...overrides,
  };
}

function buildQueueItem(
  overrides: Partial<SupervisorReviewQueueItem> = {},
): SupervisorReviewQueueItem {
  const reportState = overrides.reportState ?? 'submitted-pending-review';
  return {
    reportId: 'tag-report:wp-seed-1001:tag-pt-101',
    serverReportVersion: 'server-report:user-tech:tag-report:wp-seed-1001:tag-pt-101:v1',
    technicianUserId: 'user-tech',
    workPackageId: 'wp-seed-1001',
    tagId: 'tag-pt-101',
    templateId: 'tpl-pressure-as-found',
    templateVersion: '2026-04-v1',
    reportState,
    lifecycleState:
      overrides.lifecycleState ??
      (reportState === 'submitted-pending-review'
        ? 'Submitted - Pending Supervisor Review'
        : reportState === 'escalated-pending-manager-review'
          ? 'Escalated - Pending Manager Review'
          : reportState === 'approved'
            ? 'Approved'
            : 'Returned by Supervisor'),
    syncState: 'synced',
    submittedAt: '2026-05-10T10:15:00.000Z',
    acceptedAt: '2026-05-10T10:30:00.000Z',
    executionSummary: 'Structured pressure readings are captured.',
    riskFlagCount: 1,
    pendingEvidenceCount: 0,
    ...overrides,
  };
}

function buildReportDetail(): SupervisorReviewReportDetail {
  return {
    ...buildQueueItem(),
    historySummary: 'Cached history was compared.',
    draftDiagnosisSummary: 'Deterministic checklist guidance only.',
    evidenceReferences: [
      {
        label: 'Structured readings',
        requirementLevel: 'minimum',
        evidenceKind: 'structured-readings',
        satisfied: true,
        detail: 'Calculation evidence was accepted by the server.',
      },
      {
        label: 'Photo evidence',
        requirementLevel: 'expected',
        evidenceKind: 'photo-evidence',
        satisfied: false,
        detail: 'Expected photo was justified by technician.',
      },
    ],
    riskFlags: [
      {
        id: 'risk-photo',
        reasonType: 'missing-expected-evidence',
        justificationRequired: true,
        justificationText: 'Area access restricted.',
      },
    ],
    photoAttachments: [
      {
        evidenceId: 'evidence-photo-001',
        serverEvidenceId: 'server-evidence-001',
        presenceFinalizedAt: '2026-05-10T10:45:00.000Z',
        syncState: 'synced',
      },
    ],
    evidenceStatus: {
      state: 'all-photo-evidence-finalized',
      totalPhotoAttachments: 1,
      finalizedPhotoAttachments: 1,
      pendingPhotoAttachments: 0,
      message: 'All photo evidence is finalized.',
    },
    approvalHistory: {
      items: [
        {
          auditEventId: 'audit-escalate',
          actorRole: 'supervisor',
          actionType: 'report.supervisor.escalated',
          occurredAt: '2026-05-10T10:50:00.000Z',
          correlationId: 'corr-escalate',
          priorState: 'Submitted - Pending Supervisor Review',
          nextState: 'Escalated - Pending Manager Review',
          comment: 'Higher-risk review needed.',
        },
      ],
      placeholder: 'No approval decisions have been recorded for this report yet.',
    },
    aiDiagnosis: {
      state: 'unavailable',
      summary: null,
      detail: null,
      providerLabel: null,
      generatedAt: null,
      failureReason: null,
      lastRequestedAt: null,
    },
  };
}
