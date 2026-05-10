import { describe, expect, it } from 'vitest';

import type { SharedExecutionShell } from '../execution/model';
import type { ReportSyncDetail } from '../sync/syncStateService';
import {
  buildVisualAiDiagnosisProjection,
  buildVisualReportProjection,
  createVisualReportActions,
  TECHNICIAN_REPORT_SUBMIT_ROUTE,
} from './serviceBackedReport';

describe('service-backed visual report adapter', () => {
  it('projects report and evidence state from the selected execution shell', () => {
    const shell = buildShell();
    const report = buildVisualReportProjection(shell, buildSyncDetail());

    expect(report.state).toBe('available');
    expect(report.tagCode).toBe('FT-888');
    expect(report.reportId).toBe('report-ft-888');
    expect(report.templateTitle).toBe('Flow transmitter verification');
    expect(report.summaryRows.map((row) => row.value)).toContain(
      'FT-888 local execution summary from SharedExecutionShell.',
    );
    expect(report.evidenceReferences[0]).toMatchObject({
      label: 'Structured readings',
      stateLabel: 'Satisfied',
    });
    expect(report.photoAttachments[0]?.fileName).toBe('real-photo-ft-888.jpg');
    expect(report.riskFlags[0]?.title).toBe('Expected photo is missing');
    expect(JSON.stringify(report)).not.toContain('PT-204');
    expect(JSON.stringify(report)).not.toContain('Alimentacao eletrica');
  });

  it('keeps technician-owned draft editable and submitted reports read-only', () => {
    const draft = buildVisualReportProjection(buildShell(), null);
    const submitted = buildVisualReportProjection(
      buildShell({
        reportState: 'submitted-pending-sync',
        lifecycleState: 'Submitted - Pending Sync',
        syncState: 'queued',
      }),
      buildSyncDetail({ syncState: 'queued' }),
    );

    expect(draft.editable).toBe(true);
    expect(draft.canSaveDraft).toBe(true);
    expect(draft.canSubmit).toBe(true);
    expect(submitted.editable).toBe(false);
    expect(submitted.canSaveDraft).toBe(false);
    expect(submitted.canSubmit).toBe(false);
  });

  it('uses service-backed sync detail for badges and retry controls', () => {
    const report = buildVisualReportProjection(
      buildShell({
        reportState: 'submitted-pending-sync',
        lifecycleState: 'Submitted - Pending Sync',
        syncState: 'sync-issue',
      }),
      buildSyncDetail({
        syncState: 'sync-issue',
        label: 'Sync Issue',
        detail: 'Evidence binary upload needs retry.',
        canRetry: true,
        queueItemCount: 3,
        retryableQueueItemCount: 2,
        issueCount: 1,
      }),
    );

    expect(report.syncBadge).toMatchObject({
      state: 'sync-issue',
      label: 'Sync Issue',
      detail: 'Evidence binary upload needs retry.',
    });
    expect(report.canRetrySync).toBe(true);
    expect(report.syncDetailRows.map((row) => row.value)).toContain('3');
    expect(report.syncDetailRows.map((row) => row.value)).toContain('2');
    expect(report.syncDetailRows.map((row) => row.value)).toContain('1');
  });

  it('does not send technician submit to approval', async () => {
    const calls: string[] = [];
    const actions = createVisualReportActions({
      onAttachPhoto: (source) => {
        calls.push(`attach:${source}`);
      },
      onRemovePhoto: (evidenceId) => {
        calls.push(`remove:${evidenceId}`);
      },
      onSaveDraft: () => {
        calls.push('save');
      },
      onSubmitReport: () => {
        calls.push('submit');
      },
      onRetrySync: () => {
        calls.push('retry');
      },
      onRefreshServerStatus: () => {
        calls.push('refresh');
      },
    });

    const result = await actions.submitReport();

    expect(calls).toEqual(['submit']);
    expect(result.routeAfterSubmit).toBe(TECHNICIAN_REPORT_SUBMIT_ROUTE);
    expect(result.routeAfterSubmit).not.toBe('approval');
  });

  it('routes photo and draft actions through supplied service handlers', async () => {
    const calls: string[] = [];
    const actions = createVisualReportActions({
      onAttachPhoto: (source) => {
        calls.push(`attach:${source}`);
      },
      onRemovePhoto: (evidenceId) => {
        calls.push(`remove:${evidenceId}`);
      },
      onSaveDraft: () => {
        calls.push('save');
      },
      onSubmitReport: () => {
        calls.push('submit');
      },
      onRetrySync: () => {
        calls.push('retry');
      },
      onRefreshServerStatus: () => {
        calls.push('refresh');
      },
    });

    await actions.attachPhotoFromCamera();
    await actions.attachPhotoFromLibrary();
    await actions.removePhoto('evidence-001');
    await actions.saveDraft();
    await actions.retrySync();
    await actions.refreshServerStatus();

    expect(calls).toEqual([
      'attach:camera',
      'attach:library',
      'remove:evidence-001',
      'save',
      'retry',
      'refresh',
    ]);
  });

  it('projects AI Diagnosis as report-level nonblocking states without invented content', () => {
    expect(buildVisualAiDiagnosisProjection()).toMatchObject({
      state: 'unavailable',
      summary: null,
      blocking: false,
    });
    expect(
      buildVisualAiDiagnosisProjection({
        state: 'pending',
      }),
    ).toMatchObject({
      state: 'pending',
      summary: null,
      blocking: false,
    });
    expect(
      buildVisualAiDiagnosisProjection({
        state: 'failed-nonblocking',
        detail: 'Provider timed out.',
      }),
    ).toMatchObject({
      state: 'failed-nonblocking',
      detail: 'Provider timed out.',
      summary: null,
      blocking: false,
    });
    expect(
      buildVisualAiDiagnosisProjection({
        state: 'available',
        summary: 'Stored backend diagnosis for report review.',
        providerLabel: 'backend-provider',
      }),
    ).toMatchObject({
      state: 'available',
      summary: 'Stored backend diagnosis for report review.',
      providerLabel: 'backend-provider',
      blocking: false,
    });
  });

  it('keeps missing report shell nonblocking', () => {
    const report = buildVisualReportProjection(null, null);

    expect(report.state).toBe('unavailable');
    expect(report.canSubmit).toBe(false);
    expect(report.unavailableReason).toContain('Load a local execution template');
    expect(report.routeAfterSubmit).toBe('report');
  });
});

function buildShell(
  overrides: Partial<{
    reportState: SharedExecutionShell['report']['state'];
    lifecycleState: SharedExecutionShell['report']['lifecycleState'];
    syncState: SharedExecutionShell['report']['syncState'];
    submitReadiness: SharedExecutionShell['guidance']['submitReadiness'];
  }> = {},
): SharedExecutionShell {
  const reportState = overrides.reportState ?? 'technician-owned-draft';
  const syncState = overrides.syncState ?? 'local-only';

  return {
    workPackageId: 'wp-real',
    workPackageTitle: 'Real local package',
    tagId: 'tag-ft-888',
    tagCode: 'FT-888',
    template: {
      id: 'tpl-flow',
      title: 'Flow transmitter verification',
      version: '2026-05',
      instrumentFamily: 'flow transmitter',
      testPattern: 'as-left',
      calculationMode: 'point deviation',
      acceptanceStyle: 'local tolerance',
      captureSummary: 'Capture expected and observed flow readings.',
      captureFields: [
        { id: 'expectedValue', label: 'Expected flow', inputKind: 'numeric', unit: 'm3/h' },
        { id: 'observedValue', label: 'Observed flow', inputKind: 'numeric', unit: 'm3/h' },
      ],
      calculationRangeOverride: { min: 0, max: 100, unit: 'm3/h' },
      conversionBasisSummary: null,
      expectedRangeSummary: null,
      checklistPrompts: ['Confirm impulse line condition'],
      checklistSteps: [],
      guidedDiagnosisPrompts: [
        {
          id: 'diag-001',
          prompt: 'Compare current reading against cached local baseline',
          whyItMatters: 'Keeps diagnosis deterministic.',
          helpsRuleOut: 'Process drift',
          sourceReference: 'LOCAL-GUIDE-001',
        },
      ],
      minimumSubmissionEvidence: ['structured readings'],
      expectedEvidence: ['photo evidence'],
      historyComparisonExpectation: 'Compare against last cached verification.',
      steps: [
        { id: 'context', title: 'Context', kind: 'context' },
        { id: 'calculation', title: 'Calculation', kind: 'calculation' },
        { id: 'history', title: 'History', kind: 'history' },
        { id: 'guidance', title: 'Guidance', kind: 'guidance' },
        { id: 'report', title: 'Report', kind: 'report' },
      ],
    },
    steps: [],
    progress: {
      currentStepId: 'report',
      visitedStepIds: ['context', 'calculation', 'history', 'guidance', 'report'],
      updatedAt: '2026-05-09T10:00:00.000Z',
    },
    calculation: null,
    riskInputs: {
      historyState: 'available',
      missingContextFieldLabels: [],
    },
    guidance: {
      checklistItems: [
        {
          id: 'check-001',
          prompt: 'Confirm impulse line condition',
          whyItMatters: 'Prevents false report conclusions.',
          helpsRuleOut: 'Plugged impulse line',
          sourceReference: 'LOCAL-CHECK-001',
          outcome: 'completed',
        },
      ],
      guidedDiagnosisPrompts: [
        {
          id: 'diag-001',
          prompt: 'Compare current reading against cached local baseline',
          whyItMatters: 'Keeps diagnosis deterministic.',
          helpsRuleOut: 'Process drift',
          sourceReference: 'LOCAL-GUIDE-001',
        },
      ],
      linkedGuidance: [],
      riskState: 'flagged',
      riskHooks: ['Expected photo is missing.'],
      riskItems: [
        {
          id: 'risk-photo',
          reasonType: 'missing-expected-evidence',
          severity: 'warning',
          title: 'Expected photo is missing',
          detail: 'Template expects a photo, but the technician can justify and continue.',
          justificationRequired: true,
          justificationPrompt: 'Explain why photo evidence is unavailable.',
          justificationText: 'Area access restricted.',
        },
      ],
      submitReadiness: overrides.submitReadiness ?? 'ready',
      submitBlockingHooks: [],
    },
    evidence: {
      draftReportId: 'report-ft-888',
      draftReportState: reportState,
      observationNotes: 'Observed impulse line condition locally.',
      calculationEvidenceUpdatedAt: '2026-05-09T10:00:00.000Z',
      guidanceEvidenceUpdatedAt: '2026-05-09T10:10:00.000Z',
      photoAttachments: [
        {
          evidenceId: 'evidence-photo-001',
          executionStepId: 'guidance',
          fileName: 'real-photo-ft-888.jpg',
          mimeType: 'image/jpeg',
          previewUri: 'file:///sandbox/real-photo-ft-888.jpg',
          mediaRelativePath: 'media/real-photo-ft-888.jpg',
          source: 'camera',
          width: 1280,
          height: 720,
          fileSize: 123456,
          syncState,
          metadataSyncedAt: null,
          serverEvidenceId: null,
          storageObjectKey: null,
          uploadAuthorizedAt: null,
          binaryUploadedAt: null,
          presenceFinalizedAt: null,
          syncIssue: null,
          createdAt: '2026-05-09T10:15:00.000Z',
          updatedAt: '2026-05-09T10:15:00.000Z',
        },
      ],
      photoEvidenceUpdatedAt: '2026-05-09T10:15:00.000Z',
    },
    report: {
      reportId: 'report-ft-888',
      state: reportState,
      lifecycleState: overrides.lifecycleState ?? 'Ready to Submit',
      syncState,
      technicianName: 'Field Technician',
      technicianEmail: 'tech@example.com',
      tagContextSummary: 'FT-888 in Area A from downloaded package.',
      executionSummary: 'FT-888 local execution summary from SharedExecutionShell.',
      historySummary: 'Cached history compared without live fetch.',
      draftDiagnosisSummary: 'Deterministic checklist guidance only.',
      checklistOutcomes: [
        {
          id: 'check-001',
          prompt: 'Confirm impulse line condition',
          outcome: 'completed',
          sourceReference: 'LOCAL-CHECK-001',
        },
      ],
      evidenceReferences: [
        {
          label: 'Structured readings',
          requirementLevel: 'minimum',
          evidenceKind: 'structured-readings',
          satisfied: true,
          detail: 'Calculation evidence is saved locally.',
        },
        {
          label: 'Photo evidence',
          requirementLevel: 'expected',
          evidenceKind: 'photo-evidence',
          satisfied: false,
          detail: 'Expected photo can be justified without blocking execution.',
        },
      ],
      riskFlags: [
        {
          id: 'risk-photo',
          reasonType: 'missing-expected-evidence',
          severity: 'warning',
          title: 'Expected photo is missing',
          detail: 'Template expects a photo, but the technician can justify and continue.',
          justificationRequired: true,
          justificationPrompt: 'Explain why photo evidence is unavailable.',
          justificationText: 'Area access restricted.',
        },
      ],
      reviewNotes: 'Technician-owned review note.',
      savedAt: '2026-05-09T10:20:00.000Z',
      submittedAt: reportState === 'technician-owned-draft' ? null : '2026-05-09T10:30:00.000Z',
    },
  };
}

function buildSyncDetail(overrides: Partial<ReportSyncDetail> = {}): ReportSyncDetail {
  return {
    reportId: 'report-ft-888',
    workPackageId: 'wp-real',
    syncState: overrides.syncState ?? 'local-only',
    label: overrides.label ?? 'Local Only',
    detail: overrides.detail ?? 'Local report and evidence are still on this device.',
    queueItemCount: overrides.queueItemCount ?? 0,
    retryableQueueItemCount: overrides.retryableQueueItemCount ?? 0,
    issueCount: overrides.issueCount ?? 0,
    canRetry: overrides.canRetry ?? false,
  };
}
