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
      routeAfterSubmit: TECHNICIAN_REPORT_SUBMIT_ROUTE,
      unavailableReason:
        'Carregue um teste local da tag antes de revisar o rascunho do relatorio.',
    };
  }

  const report = shell.report;
  const editable =
    report.state === 'technician-owned-draft' || report.state === 'submitted-pending-sync';
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
    editLockReason: editable ? null : buildReportEditLockReason(report),
    canSaveDraft: editable,
    canSubmit: editable && shell.guidance.submitReadiness === 'ready' && !manualInstrument,
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
      label: 'Diagnostico de IA indisponivel',
      detail:
        'Diagnostico de IA ainda nao disponivel. O relatorio pode ser enviado normalmente. Quando houver conexao, o sistema podera gerar uma analise assistiva com base nos dados coletados.',
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
        label: 'Diagnostico de IA disponivel',
        detail:
          input.detail ??
          'Assistencia diagnostica do provedor foi salva para este relatorio.',
        summary: sanitizeAiSummary(input.summary),
        generatedAtLabel: formatTimestamp(input.generatedAt ?? null),
        providerLabel: input.providerLabel ?? null,
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
        blocking: false,
      };
    case 'failed-nonblocking':
      return {
        state: 'failed-nonblocking',
        label: 'Diagnostico de IA falhou sem bloquear',
        detail:
          input.detail ??
          'Nao foi possivel gerar o diagnostico de IA agora. O relatorio local continua salvo e pode seguir sem bloqueio.',
        summary: null,
        generatedAtLabel: formatTimestamp(input.generatedAt ?? null),
        providerLabel: input.providerLabel ?? null,
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
