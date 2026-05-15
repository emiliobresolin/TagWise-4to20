import type {
  SharedExecutionPhotoAttachment,
  SharedExecutionReportEvidenceReference,
  SharedExecutionRiskItem,
  SharedExecutionShell,
  SharedExecutionSyncState,
} from '../execution/model';
import type { ReportSyncDetail } from '../sync/syncStateService';
import { buildSyncStateBadgeModel, type SyncStateBadgeModel } from '../sync/syncStateModel';
import { isManualInstrumentWorkPackageId } from '../work-packages/manualInstrumentModel';
import { translateVisibleText } from './serviceBackedExecution';

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
  // Story 8.12 finding #5: backend already stores a provider failure
  // reason (HTTP 401 "OpenAI diagnosis request failed", timeout, etc.).
  // Mobile previously dropped it; now it threads through so the
  // technician/supervisor card can show why the AI run failed.
  failureReason?: string | null;
}

export interface VisualAiDiagnosisProjection {
  state: VisualAiDiagnosisState;
  label: string;
  detail: string;
  summary: string | null;
  generatedAtLabel: string | null;
  providerLabel: string | null;
  failureReason: string | null;
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

export type VisualReportPendingActionRoute = 'calculation' | 'diagnosis' | 'report';

export interface VisualReportPendingAction {
  id: string;
  label: string;
  detail: string;
  route: VisualReportPendingActionRoute;
  blocking: boolean;
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
  pendingActions: VisualReportPendingAction[];
  photoAttachments: SharedExecutionPhotoAttachment[];
  aiDiagnosis: VisualAiDiagnosisProjection;
  editable: boolean;
  editLockReason: string | null;
  canSaveDraft: boolean;
  canSubmit: boolean;
  canRetrySync: boolean;
  canRefreshServerStatus: boolean;
  // Story 8.12 finding #2: visible "Devolvido pelo supervisor - relatorio
  // invalidado" banner driven by the persisted invalidated flag. When
  // truthy, the report screen renders a prominent block with the
  // supervisor's return comment and the technician knows a new visit
  // must be started.
  invalidated: boolean;
  invalidationReason: string | null;
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
      tagCode: 'Nenhuma tag selecionada',
      templateTitle: 'Nenhum teste carregado',
      lifecycleStateLabel: 'Indisponivel',
      reportStateLabel: 'Indisponivel',
      submitReadinessLabel: 'Indisponivel',
      syncBadge: buildSyncStateBadgeModel('local-only'),
      syncDetailRows: [],
      reviewNotes: '',
      summaryRows: [],
      checklistOutcomes: [],
      evidenceReferences: [],
      riskFlags: [],
      pendingActions: [],
      photoAttachments: [],
      aiDiagnosis: buildVisualAiDiagnosisProjection(aiDiagnosis),
      editable: false,
      editLockReason: 'Carregue uma tag antes de editar o relatorio.',
      canSaveDraft: false,
      canSubmit: false,
      canRetrySync: false,
      canRefreshServerStatus: false,
      invalidated: false,
      invalidationReason: null,
      routeAfterSubmit: TECHNICIAN_REPORT_SUBMIT_ROUTE,
      unavailableReason:
        'Carregue um teste local da tag antes de revisar o rascunho do relatorio.',
    };
  }

  const report = shell.report;
  // Story 8.12 finding #2: invalidated drafts (supervisor returned the
  // report) are never editable even if the underlying state would
  // otherwise allow it. The technician must start a new visit instead.
  const invalidated = Boolean(report.invalidated);
  const editable =
    !invalidated &&
    (report.state === 'technician-owned-draft' || report.state === 'submitted-pending-sync');
  const manualInstrument = isManualInstrumentWorkPackageId(shell.workPackageId);
  const aggregateSyncState = syncDetail?.syncState ?? report.syncState;
  const syncIssueDetail =
    syncDetail?.detail ?? report.syncIssue ?? report.syncIssueReasonCode ?? null;
  const syncBadge = syncDetail
    ? {
        state: syncDetail.syncState,
        label: buildSyncStateBadgeModel(syncDetail.syncState, syncDetail.detail).label,
        tone: buildSyncStateBadgeModel(syncDetail.syncState, syncDetail.detail).tone,
        detail: translateOperationalMessage(syncDetail.detail),
      }
    : buildSyncStateBadgeModel(aggregateSyncState, syncIssueDetail);

  return {
    state: 'available',
    reportId: report.reportId,
    tagCode: shell.tagCode,
    templateTitle: shell.template.title,
    lifecycleStateLabel: report.lifecycleState,
    reportStateLabel: toReportStateLabel(report.state),
    submitReadinessLabel: manualInstrument
      ? 'Relatorio manual fica local ate existir reconciliacao com backend.'
      : shell.guidance.submitReadiness === 'blocked'
        ? 'Evidencia minima ou justificativas ainda sao obrigatorias.'
        : 'Checagens minimas locais atendidas.',
    syncBadge,
    syncDetailRows: buildSyncDetailRows(report.syncState, syncDetail),
    reviewNotes: report.reviewNotes,
    summaryRows: [
      { label: 'Contexto', value: translateOperationalMessage(report.tagContextSummary) },
      { label: 'Execucao', value: translateOperationalMessage(report.executionSummary) },
      { label: 'Historico', value: translateOperationalMessage(report.historySummary) },
      { label: 'Orientacao deterministica', value: translateOperationalMessage(report.draftDiagnosisSummary) },
      { label: 'Tecnico', value: `${report.technicianName} (${report.technicianEmail})` },
      { label: 'Salvo em', value: formatTimestamp(report.savedAt) },
      { label: 'Enviado em', value: formatTimestamp(report.submittedAt) },
    ],
    checklistOutcomes: report.checklistOutcomes,
    evidenceReferences: report.evidenceReferences.map((reference) => ({
      ...reference,
      label: translateOperationalMessage(reference.label),
      detail: translateOperationalMessage(reference.detail),
      stateLabel: reference.satisfied ? 'Atendida' : 'Ausente',
    })),
    riskFlags: report.riskFlags.map((riskFlag) => ({
      ...riskFlag,
      title: translateOperationalMessage(riskFlag.title),
      detail: translateOperationalMessage(riskFlag.detail),
      justificationPrompt: riskFlag.justificationPrompt
        ? translateOperationalMessage(riskFlag.justificationPrompt)
        : riskFlag.justificationPrompt,
      stateLabel:
        riskFlag.justificationRequired && riskFlag.justificationText.trim().length === 0
          ? 'Justificativa obrigatoria'
          : riskFlag.severity === 'submit-block'
            ? 'Bloqueia envio'
            : 'Risco visivel',
    })),
    pendingActions: buildReportPendingActions(report),
    photoAttachments: shell.evidence.photoAttachments,
    aiDiagnosis: buildVisualAiDiagnosisProjection(aiDiagnosis),
    editable,
    editLockReason: editable
      ? null
      : invalidated
        ? `Relatorio devolvido pelo supervisor e marcado como invalido. Inicie uma nova visita para registrar correcoes.${
            report.invalidationReason ? ` Motivo: ${report.invalidationReason}` : ''
          }`
        : buildReportEditLockReason(report),
    canSaveDraft: editable,
    canSubmit: editable && shell.guidance.submitReadiness === 'ready' && !manualInstrument,
    canRetrySync: Boolean(syncDetail?.canRetry),
    canRefreshServerStatus:
      report.state !== 'technician-owned-draft' &&
      (report.syncState === 'synced' || report.syncState === 'pending-validation'),
    invalidated,
    invalidationReason: report.invalidationReason ?? null,
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
      label: 'Diagnostico de IA indisponivel',
      detail:
        'Diagnostico de IA ainda nao disponivel. O relatorio pode ser enviado normalmente. Quando houver conexao, o sistema podera gerar uma analise assistiva com base nos dados coletados.',
      summary: null,
      generatedAtLabel: null,
      providerLabel: null,
      failureReason: null,
      blocking: false,
    };
  }

  switch (input.state) {
    case 'available':
      return {
        state: 'available',
        label: 'Diagnostico de IA disponivel',
        detail:
          input.detail ??
          'Assistencia diagnostica do provedor foi salva para este relatorio.',
        summary: sanitizeAiSummary(input.summary),
        generatedAtLabel: formatTimestamp(input.generatedAt ?? null),
        providerLabel: input.providerLabel ?? null,
        failureReason: null,
        blocking: false,
      };
    case 'pending':
      return {
        state: 'pending',
        label: 'Diagnostico de IA pendente',
        detail:
          input.detail ??
          'Diagnostico de IA esta aguardando processamento conectado. O relatorio pode continuar normalmente.',
        summary: null,
        generatedAtLabel: formatTimestamp(input.generatedAt ?? null),
        providerLabel: input.providerLabel ?? null,
        failureReason: null,
        blocking: false,
      };
    case 'failed-nonblocking':
      // Story 8.12 finding #5: when the provider call failed, the
      // backend has the actual reason (e.g. "OpenAI diagnosis request
      // failed with status 401" or a timeout message). Prefer that in
      // the visible detail so the user understands what went wrong;
      // also expose it as a discrete field for explicit rendering.
      return {
        state: 'failed-nonblocking',
        label: 'Diagnostico de IA falhou sem bloquear',
        detail:
          input.failureReason ??
          input.detail ??
          'Nao foi possivel gerar o diagnostico de IA agora. O relatorio local continua salvo e pode seguir sem bloqueio.',
        summary: null,
        generatedAtLabel: formatTimestamp(input.generatedAt ?? null),
        providerLabel: input.providerLabel ?? null,
        failureReason: input.failureReason ?? null,
        blocking: false,
      };
    default:
      return {
        state: 'unavailable',
        label: 'Diagnostico de IA indisponivel',
        detail:
          input.detail ??
          'Diagnostico de IA nao esta habilitado para este relatorio. O fluxo tecnico continua normalmente.',
        summary: null,
        generatedAtLabel: formatTimestamp(input.generatedAt ?? null),
        providerLabel: input.providerLabel ?? null,
        failureReason: null,
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
      label: 'Sync do relatorio',
      value: buildSyncStateBadgeModel(reportSyncState).detail,
    },
  ];
  }

  return [
    { label: 'Sync do relatorio', value: translateOperationalMessage(syncDetail.detail) },
    { label: 'Itens na fila', value: `${syncDetail.queueItemCount}` },
    { label: 'Tentativas disponiveis', value: `${syncDetail.retryableQueueItemCount}` },
    { label: 'Problemas de sync', value: `${syncDetail.issueCount}` },
  ];
}

function buildReportPendingActions(
  report: SharedExecutionShell['report'],
): VisualReportPendingAction[] {
  const evidenceActions = report.evidenceReferences
    .filter((reference) => !reference.satisfied)
    .map((reference) => ({
      id: `evidence:${reference.requirementLevel}:${reference.label}`,
      label:
        reference.requirementLevel === 'minimum'
          ? `Adicionar evidencia minima: ${translateOperationalMessage(reference.label)}`
          : `Justificar evidencia esperada: ${translateOperationalMessage(reference.label)}`,
      detail: translateOperationalMessage(reference.detail),
      route: 'report' as const,
      blocking: reference.requirementLevel === 'minimum',
    }));

  const riskActions = report.riskFlags
    .filter((risk) => risk.justificationRequired && risk.justificationText.trim().length === 0)
    .map((risk) => ({
      id: `risk:${risk.id}`,
      label: translateOperationalMessage(risk.justificationPrompt ?? risk.title),
      detail: translateOperationalMessage(risk.detail),
      route: 'diagnosis' as const,
      blocking: risk.severity === 'submit-block',
    }));

  return [...evidenceActions, ...riskActions];
}

function toReportStateLabel(state: SharedExecutionShell['report']['state']) {
  switch (state) {
    case 'technician-owned-draft':
      return 'Rascunho do tecnico';
    case 'submitted-pending-sync':
      return 'Enviado localmente - pendente sync';
    case 'submitted-pending-review':
      return 'Enviado - em revisao';
    default:
      return 'Indisponivel';
  }
}

function formatTimestamp(value: string | null) {
  return value ? new Date(value).toLocaleString('pt-BR') : 'Nao registrado';
}

function buildReportEditLockReason(report: SharedExecutionShell['report']): string | null {
  if (report.state === 'submitted-pending-review') {
    return 'O servidor ja aceitou este relatorio. Para corrigir, aguarde retorno/revisao do supervisor.';
  }

  return 'Relatorio bloqueado pelo ciclo atual.';
}

function sanitizeAiSummary(value: string | null | undefined) {
  const trimmed = value?.trim() ?? '';
  return trimmed.length > 0 ? trimmed : null;
}

// Story 8.7 AC 12: classify sync / network / token errors into 4 PT-BR classes
// with a recommended action chip. The caller can render the copy directly and
// hand the action key to the appropriate handler (retry sync, reauth, open
// local queue). The classifier is intentionally minimal — string-pattern and
// HTTP-status mapping — to avoid introducing a new view-model layer.

export type SyncErrorActionKind = 'retry' | 'reauth' | 'open-queue';

export interface SyncErrorClassification {
  copy: string;
  action: SyncErrorActionKind;
}

export interface SyncErrorInput {
  httpStatus?: number;
  errorMessage?: string;
}

const SYNC_ERROR_NO_INTERNET: SyncErrorClassification = {
  copy: 'Sem internet. Seu trabalho esta salvo localmente.',
  action: 'retry',
};

const SYNC_ERROR_SESSION_EXPIRED: SyncErrorClassification = {
  copy: 'Sessao expirada. Faca login novamente.',
  action: 'reauth',
};

const SYNC_ERROR_BACKEND_DEGRADED: SyncErrorClassification = {
  copy: 'Servidor indisponivel ou sobrecarregado. Tentando novamente.',
  action: 'retry',
};

const SYNC_ERROR_UNKNOWN: SyncErrorClassification = {
  copy: 'Falha de sincronizacao. Veja a fila local.',
  action: 'open-queue',
};

export function classifySyncError(input: SyncErrorInput): SyncErrorClassification {
  const { httpStatus, errorMessage } = input;
  const normalizedMessage = errorMessage ?? '';

  if (/network request failed/i.test(normalizedMessage)) {
    return SYNC_ERROR_NO_INTERNET;
  }

  if (
    httpStatus === 401 ||
    httpStatus === 403 ||
    /access token expired|unauthor/i.test(normalizedMessage)
  ) {
    return SYNC_ERROR_SESSION_EXPIRED;
  }

  if (typeof httpStatus === 'number' && httpStatus >= 500 && httpStatus < 600) {
    return SYNC_ERROR_BACKEND_DEGRADED;
  }

  return SYNC_ERROR_UNKNOWN;
}

/**
 * Story 8.8 D-02: map a per-photo `executionStepId` (the canonical step kind
 * that produced the photo) into PT-BR short label. Used as the photo
 * sub-step badge on both the technician report screen and the supervisor
 * review screen. `null`/`undefined` indicates a pre-8.8 row or an unknown
 * step kind — falls back to an explicit "Sem etapa" so the supervisor still
 * gets a stable label.
 */
export function formatPhotoExecutionStepLabel(
  stepId: string | null | undefined,
): string {
  switch (stepId) {
    case 'instrument':
      return 'Instrumento';
    case 'calculation':
      return 'Calculo';
    case 'history':
      return 'Comparativo';
    case 'guidance':
      return 'Checklist';
    case 'report':
      return 'Relatorio';
    case 'context':
      return 'Contexto da tag';
    default:
      return 'Sem etapa';
  }
}

/**
 * Story 8.8 D-02: combine the system-set sub-step badge (`contextNote`) with
 * the canonical step label. Used as the subtitle under a photo card. Returns
 * empty string when neither is meaningful.
 */
export function formatPhotoContextSubtitle(input: {
  contextNote?: string | null;
  executionStepId?: string | null;
}): string {
  const stepLabel = formatPhotoExecutionStepLabel(input.executionStepId);
  const trimmedContextNote = input.contextNote?.trim() ?? '';

  if (trimmedContextNote.length === 0) {
    return stepLabel;
  }

  if (stepLabel === 'Sem etapa') {
    return trimmedContextNote;
  }

  return `${stepLabel} - ${trimmedContextNote}`;
}

export function translateOperationalMessage(value: string | null | undefined): string {
  const translated = translateVisibleText(value);
  if (translated === null) {
    return '';
  }

  return translated
    .replace(/\bAccess token expired\b/gi, 'Sessao expirada')
    .replace(/\bNetwork request failed\b/gi, 'Falha de rede')
    .replace(/\bEvidence binary upload needs retry\b/gi, 'Upload de evidencia precisa de nova tentativa')
    .replace(/\bserver\b/gi, 'servidor')
    .replace(/\bprovider\b/gi, 'provedor')
    .replace(/\breport\b/gi, 'relatorio')
    .replace(/\bphoto attachment\(s\)\b/gi, 'foto(s)')
    .replace(/\blinked locally\b/gi, 'vinculada(s) localmente')
    .replace(/\bsatisfied\b/gi, 'atendida(s)')
    .replace(/\bvisible risk flag\(s\)\b/gi, 'risco(s) visivel(is)');
}
