import type {
  SharedExecutionPhotoAttachment,
  SharedExecutionReportEvidenceReference,
  SharedExecutionRiskItem,
  SharedExecutionShell,
  SharedExecutionSyncState,
} from '../execution/model';
import type { ReportSyncDetail } from '../sync/syncStateService';
import { buildSyncStateBadgeModel, type SyncStateBadgeModel } from '../sync/syncStateModel';

export type VisualAiDiagnosisState =
  | 'available'
  | 'pending'
  | 'unavailable'
  | 'failed-nonblocking';

export interface VisualAiDiagnosisProjectionInput {
  state: VisualAiDiagnosisState;
  summary?: string | null;
  detail?: string | null;
  generatedAt?: string | null;
  providerLabel?: string | null;
}

export interface VisualAiDiagnosisProjection {
  state: VisualAiDiagnosisState;
  label: string;
  detail: string;
  summary: string | null;
  generatedAtLabel: string | null;
  providerLabel: string | null;
  blocking: false;
}

export interface VisualReportSummaryRow {
  label: string;
  value: string;
  emphasis?: 'normal' | 'warning' | 'success';
}

export interface VisualReportEvidenceReference
  extends SharedExecutionReportEvidenceReference {
  stateLabel: string;
}

export interface VisualReportRiskFlag extends SharedExecutionRiskItem {
  stateLabel: string;
}

export interface VisualReportProjection {
  state: 'available' | 'unavailable';
  reportId: string | null;
  tagCode: string;
  templateTitle: string;
  lifecycleStateLabel: string;
  reportStateLabel: string;
  submitReadinessLabel: string;
  syncBadge: SyncStateBadgeModel;
  syncDetailRows: VisualReportSummaryRow[];
  reviewNotes: string;
  summaryRows: VisualReportSummaryRow[];
  checklistOutcomes: SharedExecutionShell['report']['checklistOutcomes'];
  evidenceReferences: VisualReportEvidenceReference[];
  riskFlags: VisualReportRiskFlag[];
  photoAttachments: SharedExecutionPhotoAttachment[];
  aiDiagnosis: VisualAiDiagnosisProjection;
  editable: boolean;
  canSaveDraft: boolean;
  canSubmit: boolean;
  canRetrySync: boolean;
  canRefreshServerStatus: boolean;
  routeAfterSubmit: 'report';
  unavailableReason: string | null;
}

export interface VisualReportActionCallbacks {
  onAttachPhoto: (source: 'camera' | 'library') => Promise<void> | void;
  onRemovePhoto: (evidenceId: string) => Promise<void> | void;
  onSaveDraft: () => Promise<void> | void;
  onSubmitReport: () => Promise<void> | void;
  onRetrySync: () => Promise<void> | void;
  onRefreshServerStatus: () => Promise<void> | void;
}

export const TECHNICIAN_REPORT_SUBMIT_ROUTE = 'report' as const;

export function buildVisualReportProjection(
  shell: SharedExecutionShell | null,
  syncDetail: ReportSyncDetail | null,
  aiDiagnosis?: VisualAiDiagnosisProjectionInput | null,
): VisualReportProjection {
  if (!shell) {
    return {
      state: 'unavailable',
      reportId: null,
      tagCode: 'No tag selected',
      templateTitle: 'No execution template loaded',
      lifecycleStateLabel: 'Unavailable',
      reportStateLabel: 'Unavailable',
      submitReadinessLabel: 'Unavailable',
      syncBadge: buildSyncStateBadgeModel('local-only'),
      syncDetailRows: [],
      reviewNotes: '',
      summaryRows: [],
      checklistOutcomes: [],
      evidenceReferences: [],
      riskFlags: [],
      photoAttachments: [],
      aiDiagnosis: buildVisualAiDiagnosisProjection(aiDiagnosis),
      editable: false,
      canSaveDraft: false,
      canSubmit: false,
      canRetrySync: false,
      canRefreshServerStatus: false,
      routeAfterSubmit: TECHNICIAN_REPORT_SUBMIT_ROUTE,
      unavailableReason:
        'Load a local execution template for the selected tag before reviewing the report draft.',
    };
  }

  const report = shell.report;
  const editable = report.state === 'technician-owned-draft';
  const aggregateSyncState = syncDetail?.syncState ?? report.syncState;
  const syncIssueDetail =
    syncDetail?.detail ?? report.syncIssue ?? report.syncIssueReasonCode ?? null;
  const syncBadge = syncDetail
    ? {
        state: syncDetail.syncState,
        label: syncDetail.label,
        tone: buildSyncStateBadgeModel(syncDetail.syncState, syncDetail.detail).tone,
        detail: syncDetail.detail,
      }
    : buildSyncStateBadgeModel(aggregateSyncState, syncIssueDetail);

  return {
    state: 'available',
    reportId: report.reportId,
    tagCode: shell.tagCode,
    templateTitle: shell.template.title,
    lifecycleStateLabel: report.lifecycleState,
    reportStateLabel: toReportStateLabel(report.state),
    submitReadinessLabel:
      shell.guidance.submitReadiness === 'blocked'
        ? 'Minimum submission evidence or justifications are still required.'
        : 'Minimum local submission checks are satisfied.',
    syncBadge,
    syncDetailRows: buildSyncDetailRows(report.syncState, syncDetail),
    reviewNotes: report.reviewNotes,
    summaryRows: [
      { label: 'Tag context', value: report.tagContextSummary },
      { label: 'Execution', value: report.executionSummary },
      { label: 'History', value: report.historySummary },
      { label: 'Deterministic guidance', value: report.draftDiagnosisSummary },
      { label: 'Technician', value: `${report.technicianName} (${report.technicianEmail})` },
      { label: 'Saved at', value: formatTimestamp(report.savedAt) },
      { label: 'Submitted at', value: formatTimestamp(report.submittedAt) },
    ],
    checklistOutcomes: report.checklistOutcomes,
    evidenceReferences: report.evidenceReferences.map((reference) => ({
      ...reference,
      stateLabel: reference.satisfied ? 'Satisfied' : 'Missing',
    })),
    riskFlags: report.riskFlags.map((riskFlag) => ({
      ...riskFlag,
      stateLabel:
        riskFlag.justificationRequired && riskFlag.justificationText.trim().length === 0
          ? 'Justification required'
          : riskFlag.severity === 'submit-block'
            ? 'Submit-blocking'
            : 'Visible risk',
    })),
    photoAttachments: shell.evidence.photoAttachments,
    aiDiagnosis: buildVisualAiDiagnosisProjection(aiDiagnosis),
    editable,
    canSaveDraft: editable,
    canSubmit: editable && shell.guidance.submitReadiness === 'ready',
    canRetrySync: Boolean(syncDetail?.canRetry),
    canRefreshServerStatus:
      report.state !== 'technician-owned-draft' &&
      (report.syncState === 'synced' || report.syncState === 'pending-validation'),
    routeAfterSubmit: TECHNICIAN_REPORT_SUBMIT_ROUTE,
    unavailableReason: null,
  };
}

export function buildVisualAiDiagnosisProjection(
  input?: VisualAiDiagnosisProjectionInput | null,
): VisualAiDiagnosisProjection {
  if (!input) {
    return {
      state: 'unavailable',
      label: 'AI Diagnosis unavailable',
      detail:
        'No persisted provider result is available for this report. Technician execution and submit remain nonblocking.',
      summary: null,
      generatedAtLabel: null,
      providerLabel: null,
      blocking: false,
    };
  }

  switch (input.state) {
    case 'available':
      return {
        state: 'available',
        label: 'AI Diagnosis available',
        detail:
          input.detail ??
          'Provider-bound diagnostic assistance was stored for this report.',
        summary: sanitizeAiSummary(input.summary),
        generatedAtLabel: formatTimestamp(input.generatedAt ?? null),
        providerLabel: input.providerLabel ?? null,
        blocking: false,
      };
    case 'pending':
      return {
        state: 'pending',
        label: 'AI Diagnosis pending',
        detail:
          input.detail ??
          'AI diagnostic assistance is queued or awaiting provider/backend availability.',
        summary: null,
        generatedAtLabel: formatTimestamp(input.generatedAt ?? null),
        providerLabel: input.providerLabel ?? null,
        blocking: false,
      };
    case 'failed-nonblocking':
      return {
        state: 'failed-nonblocking',
        label: 'AI Diagnosis failed nonblocking',
        detail:
          input.detail ??
          'AI diagnostic assistance failed, but local report completion remains available.',
        summary: null,
        generatedAtLabel: formatTimestamp(input.generatedAt ?? null),
        providerLabel: input.providerLabel ?? null,
        blocking: false,
      };
    default:
      return {
        state: 'unavailable',
        label: 'AI Diagnosis unavailable',
        detail:
          input.detail ??
          'AI diagnostic assistance is not configured or not available for this report.',
        summary: null,
        generatedAtLabel: formatTimestamp(input.generatedAt ?? null),
        providerLabel: input.providerLabel ?? null,
        blocking: false,
      };
  }
}

export function createVisualReportActions(callbacks: VisualReportActionCallbacks) {
  return {
    attachPhotoFromCamera: () => callbacks.onAttachPhoto('camera'),
    attachPhotoFromLibrary: () => callbacks.onAttachPhoto('library'),
    removePhoto: (evidenceId: string) => callbacks.onRemovePhoto(evidenceId),
    retrySync: () => callbacks.onRetrySync(),
    refreshServerStatus: () => callbacks.onRefreshServerStatus(),
    saveDraft: () => callbacks.onSaveDraft(),
    submitReport: async () => {
      await callbacks.onSubmitReport();
      return {
        routeAfterSubmit: TECHNICIAN_REPORT_SUBMIT_ROUTE,
      };
    },
  };
}

function buildSyncDetailRows(
  reportSyncState: SharedExecutionSyncState,
  syncDetail: ReportSyncDetail | null,
): VisualReportSummaryRow[] {
  if (!syncDetail) {
    return [
      {
        label: 'Report sync state',
        value: buildSyncStateBadgeModel(reportSyncState).detail,
      },
    ];
  }

  return [
    { label: 'Report sync state', value: syncDetail.detail },
    { label: 'Queued work', value: `${syncDetail.queueItemCount}` },
    { label: 'Retryable work', value: `${syncDetail.retryableQueueItemCount}` },
    { label: 'Sync issues', value: `${syncDetail.issueCount}` },
  ];
}

function toReportStateLabel(state: SharedExecutionShell['report']['state']) {
  switch (state) {
    case 'technician-owned-draft':
      return 'Technician-owned draft';
    case 'submitted-pending-sync':
      return 'Submitted - Pending Sync';
    case 'submitted-pending-review':
      return 'Submitted - Pending Supervisor Review';
    default:
      return 'Unavailable';
  }
}

function formatTimestamp(value: string | null) {
  return value ? new Date(value).toLocaleString() : 'Not recorded';
}

function sanitizeAiSummary(value: string | null | undefined) {
  const trimmed = value?.trim() ?? '';
  return trimmed.length > 0 ? trimmed : null;
}
