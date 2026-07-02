import { canPerformReviewActions, type ActiveUserSession } from '../auth/model';
import type {
  SupervisorReviewApprovalHistoryItem,
  SupervisorReviewEvidenceReference,
  SupervisorReviewPhotoAttachment,
  SupervisorReviewQueueItem,
  SupervisorReviewReportDetail,
  SupervisorReviewRiskFlag,
} from '../review/model';
import {
  buildVisualAiDiagnosisProjection,
  formatPhotoContextSubtitle,
  type VisualAiDiagnosisProjection,
  type VisualAiDiagnosisProjectionInput,
  type VisualReportSummaryRow,
} from './serviceBackedReport';
import { translateOperationalMessage } from './serviceBackedReport';

export type VisualReviewRole = 'supervisor' | 'manager';

export type VisualReviewAccessState =
  | 'signed-out-demo'
  | 'hidden'
  | 'connected-required'
  | 'available';

export interface VisualReviewAccessProjection {
  state: VisualReviewAccessState;
  reviewerRole: VisualReviewRole | null;
  entryVisible: boolean;
  canLoadQueue: boolean;
  canUseDecisionActions: boolean;
  label: string;
  detail: string;
}

export type VisualReviewQueueGroupKey =
  | 'pending-review'
  | 'escalated'
  | 'returned'
  | 'approved'
  | 'other';

export interface VisualReviewQueueItemProjection extends SupervisorReviewQueueItem {
  statusLabel: string;
  submittedAtLabel: string;
  acceptedAtLabel: string;
}

export interface VisualReviewQueueGroup {
  key: VisualReviewQueueGroupKey;
  label: string;
  emptyLabel: string;
  items: VisualReviewQueueItemProjection[];
  count: number;
}

export interface VisualReviewEvidenceReferenceProjection
  extends SupervisorReviewEvidenceReference {
  stateLabel: string;
}

export interface VisualReviewRiskFlagProjection
  extends SupervisorReviewRiskFlag {
  stateLabel: string;
  justificationLabel: string;
}

export interface VisualReviewPhotoAttachmentProjection extends SupervisorReviewPhotoAttachment {
  finalizedLabel: string;
  /**
   * Story 8.8 D-02: PT-BR subtitle combining canonical step kind label and
   * free-form contextNote. Empty when neither is meaningful.
   */
  contextSubtitle: string;
  /**
   * Story 8.8 D-04: PT-BR-safe trimmed technician note for direct rendering,
   * or empty string when none was captured.
   */
  technicianNoteLabel: string;
}

export interface VisualReviewApprovalHistoryProjection
  extends SupervisorReviewApprovalHistoryItem {
  occurredAtLabel: string;
  stateTransitionLabel: string;
}

export interface VisualReviewDetailProjection {
  state: 'available' | 'unavailable';
  reportId: string | null;
  reviewerRole: VisualReviewRole | null;
  title: string;
  lifecycleStateLabel: string;
  syncStateLabel: string;
  summaryRows: VisualReportSummaryRow[];
  evidenceReferences: VisualReviewEvidenceReferenceProjection[];
  riskFlags: VisualReviewRiskFlagProjection[];
  photoAttachments: VisualReviewPhotoAttachmentProjection[];
  evidenceStatusRows: VisualReportSummaryRow[];
  approvalHistory: {
    items: VisualReviewApprovalHistoryProjection[];
    placeholder: string;
  };
  aiDiagnosis: VisualAiDiagnosisProjection;
  canApprove: boolean;
  canReturn: boolean;
  canEscalate: boolean;
  unavailableReason: string | null;
}

export type VisualReviewDecisionKind = 'approve' | 'return' | 'escalate';

export type VisualReviewDecisionRequest =
  | {
      state: 'blocked';
      kind: VisualReviewDecisionKind;
      message: string;
    }
  | {
      state: 'requires-confirmation';
      kind: VisualReviewDecisionKind;
      reportId: string;
      title: string;
      message: string;
      confirmLabel: string;
      comment: string | null;
    };

export interface VisualReviewDecisionCallbacks {
  onApproveReport: (reportId: string) => Promise<void> | void;
  onReturnReport: (reportId: string) => Promise<void> | void;
  onEscalateReport: (reportId: string) => Promise<void> | void;
}

export function buildVisualReviewAccess(
  session: ActiveUserSession | null,
): VisualReviewAccessProjection {
  if (!session) {
    return {
      state: 'signed-out-demo',
      reviewerRole: null,
      entryVisible: false,
      canLoadQueue: false,
      canUseDecisionActions: false,
      label: 'Revisao indisponivel',
      detail: 'Entre como supervisor ou gerente conectado para revisar relatorios oficiais.',
    };
  }

  if (session.role !== 'supervisor' && session.role !== 'manager') {
    return {
      state: 'hidden',
      reviewerRole: null,
      entryVisible: false,
      canLoadQueue: false,
      canUseDecisionActions: false,
      label: 'Fluxo do tecnico',
      detail: 'Tecnicos nao acessam filas ou acoes de revisao de supervisor.',
    };
  }

  const reviewerRole: VisualReviewRole = session.role;
  const canReview = canPerformReviewActions(session.role, session.connectionMode);

  if (!canReview) {
    return {
      state: 'connected-required',
      reviewerRole,
      entryVisible: false,
      canLoadQueue: false,
      canUseDecisionActions: false,
      label: 'Conexao obrigatoria para revisao',
      detail:
        'Filas e decisoes oficiais exigem sessao conectada. Perfil em cache nao autoriza aprovacao.',
    };
  }

  return {
    state: 'available',
    reviewerRole,
    entryVisible: true,
    canLoadQueue: true,
    canUseDecisionActions: true,
    label: reviewerRole === 'manager' ? 'Revisao gerencial' : 'Revisao do supervisor',
    detail:
      reviewerRole === 'manager'
        ? 'Relatorios escalados carregam do servico conectado de revisao gerencial.'
        : 'Relatorios aceitos pelo servidor carregam do servico conectado de supervisao.',
  };
}

export function buildVisualReviewQueueGroups(
  items: readonly SupervisorReviewQueueItem[],
): VisualReviewQueueGroup[] {
  const groups = buildEmptyGroups();

  for (const item of items) {
    const key = toQueueGroupKey(item.reportState);
    const group = groups.find((candidate) => candidate.key === key) ?? groups[groups.length - 1];
    group.items.push({
      ...item,
      statusLabel: item.lifecycleState,
      executionSummary: translateOperationalMessage(item.executionSummary),
      submittedAtLabel: formatTimestamp(item.submittedAt),
      acceptedAtLabel: formatTimestamp(item.acceptedAt),
    });
  }

  return groups.map((group) => ({ ...group, count: group.items.length }));
}

export function buildVisualReviewDetailProjection(
  report: SupervisorReviewReportDetail | null,
  access: VisualReviewAccessProjection,
  aiDiagnosis?: VisualAiDiagnosisProjectionInput | null,
): VisualReviewDetailProjection {
  if (!report) {
    return {
      state: 'unavailable',
      reportId: null,
      reviewerRole: access.reviewerRole,
      title: 'Nenhum relatorio selecionado',
      lifecycleStateLabel: 'Indisponivel',
      syncStateLabel: 'Indisponivel',
      summaryRows: [],
      evidenceReferences: [],
      riskFlags: [],
      photoAttachments: [],
      evidenceStatusRows: [],
      approvalHistory: {
        items: [],
        placeholder: 'Abra um relatorio de revisao para ver o historico de auditoria.',
      },
      aiDiagnosis: buildVisualAiDiagnosisProjection(aiDiagnosis),
      canApprove: false,
      canReturn: false,
      canEscalate: false,
      unavailableReason: 'Selecione um relatorio na fila conectada de revisao.',
    };
  }

  const canAct = access.canUseDecisionActions;
  const isSupervisor = access.reviewerRole === 'supervisor';

  return {
    state: 'available',
    reportId: report.reportId,
    reviewerRole: access.reviewerRole,
    title: `Detalhe da revisao ${report.tagId}`,
    lifecycleStateLabel: report.lifecycleState,
    syncStateLabel: report.syncState,
    summaryRows: [
      { label: 'Relatorio', value: report.reportId },
      { label: 'Pacote', value: report.workPackageId },
      { label: 'Tag', value: report.tagId },
      { label: 'Template', value: `${report.templateId} (${report.templateVersion})` },
      { label: 'Tecnico', value: report.technicianUserId },
      { label: 'Enviado em', value: formatTimestamp(report.submittedAt) },
      { label: 'Aceito em', value: formatTimestamp(report.acceptedAt) },
      { label: 'Execucao', value: translateOperationalMessage(report.executionSummary) },
      { label: 'Historico', value: translateOperationalMessage(report.historySummary) },
      { label: 'Orientacao deterministica', value: translateOperationalMessage(report.draftDiagnosisSummary) },
    ],
    evidenceReferences: report.evidenceReferences.map((reference) => ({
      ...reference,
      label: translateOperationalMessage(reference.label),
      detail: translateOperationalMessage(reference.detail),
      stateLabel: reference.satisfied ? 'Atendida' : 'Ausente',
    })),
    riskFlags: report.riskFlags.map((riskFlag) => ({
      ...riskFlag,
      reasonType: translateOperationalMessage(riskFlag.reasonType),
      stateLabel:
        riskFlag.justificationRequired && riskFlag.justificationText.trim().length === 0
          ? 'Justificativa obrigatoria'
          : 'Risco visivel',
      justificationLabel: translateOperationalMessage(riskFlag.justificationText.trim()) || 'Nao capturada',
    })),
    photoAttachments: report.photoAttachments.map((attachment) => ({
      ...attachment,
      finalizedLabel: attachment.presenceFinalizedAt
        ? formatTimestamp(attachment.presenceFinalizedAt)
        : 'Nao finalizada',
      contextSubtitle: formatPhotoContextSubtitle({
        contextNote: attachment.contextNote ?? null,
        executionStepId: attachment.executionStepId ?? null,
      }),
      technicianNoteLabel: attachment.technicianNote?.trim() ?? '',
    })),
    evidenceStatusRows: [
      // Story 8.8 PT-BR sweep: map enum + free-text English evidence status
      // through PT-BR translators so the supervisor never sees raw backend
      // tokens (no-photo-evidence / all-photo-evidence-finalized / etc).
      { label: 'Estado da evidencia', value: translateEvidencePresenceState(report.evidenceStatus.state) },
      {
        label: 'Evidencia fotografica',
        value: translateEvidencePresenceMessage(
          report.evidenceStatus.state,
          report.evidenceStatus.message,
          report.evidenceStatus.pendingPhotoAttachments,
        ),
      },
      { label: 'Fotos totais', value: `${report.evidenceStatus.totalPhotoAttachments}` },
      { label: 'Fotos finalizadas', value: `${report.evidenceStatus.finalizedPhotoAttachments}` },
      { label: 'Fotos pendentes', value: `${report.evidenceStatus.pendingPhotoAttachments}` },
    ],
    approvalHistory: {
      items: report.approvalHistory.items.map((item) => ({
        ...item,
        occurredAtLabel: formatTimestamp(item.occurredAt),
        stateTransitionLabel: `${item.priorState ?? 'Desconhecido'} -> ${
          item.nextState ?? 'Desconhecido'
        }`,
      })),
      // english-approval-history-placeholder: the backend mints an English
      // placeholder sentence when a report has no approval decisions yet.
      // Replace the pass-through with PT-BR copy so the first review of any
      // freshly submitted report stays in the app language.
      placeholder:
        report.approvalHistory.items.length === 0
          ? 'Nenhuma decisao de aprovacao foi registrada para este relatorio ainda.'
          : '',
    },
    aiDiagnosis: buildVisualAiDiagnosisProjection(aiDiagnosis),
    canApprove: canAct,
    canReturn: canAct,
    canEscalate: canAct && isSupervisor,
    unavailableReason: null,
  };
}

export function buildVisualReviewDecisionFeedback(input: {
  kind: VisualReviewDecisionKind;
  reportId: string;
  tagId?: string | null;
}): string {
  const target = input.tagId?.trim() || input.reportId;
  switch (input.kind) {
    case 'approve':
      return `Relatorio ${target} aprovado.`;
    case 'return':
      return `Relatorio ${target} devolvido ao tecnico com comentario.`;
    case 'escalate':
      return `Relatorio ${target} escalonado para gerente.`;
    default:
      return `Decisao registrada para ${target}.`;
  }
}

export function buildVisualReviewDecisionRequest(input: {
  kind: VisualReviewDecisionKind;
  detail: VisualReviewDetailProjection;
  returnComment: string;
  escalationRationale: string;
}): VisualReviewDecisionRequest {
  if (input.detail.state !== 'available' || !input.detail.reportId) {
    return {
      state: 'blocked',
      kind: input.kind,
      message: 'Abra um relatorio de revisao antes de decidir.',
    };
  }

  if (input.kind === 'approve') {
    if (!input.detail.canApprove) {
      return {
        state: 'blocked',
        kind: input.kind,
        message: 'Acesso conectado de revisor e obrigatorio antes de aprovar.',
      };
    }

    return {
      state: 'requires-confirmation',
      kind: input.kind,
      reportId: input.detail.reportId,
      title: 'Confirmar aprovacao',
      message: 'Aprovar este relatorio pelo servico conectado de revisao?',
      confirmLabel: 'Confirmar aprovacao',
      comment: null,
    };
  }

  if (input.kind === 'return') {
    const comment = input.returnComment.trim();
    if (!input.detail.canReturn) {
      return {
        state: 'blocked',
        kind: input.kind,
        message: 'Acesso conectado de revisor e obrigatorio antes de devolver.',
      };
    }

    if (comment.length === 0) {
      return {
        state: 'blocked',
        kind: input.kind,
        message: 'Comentario e obrigatorio antes de devolver o relatorio.',
      };
    }

    return {
      state: 'requires-confirmation',
      kind: input.kind,
      reportId: input.detail.reportId,
      title: 'Confirmar devolucao',
      message: 'Devolver este relatorio com o comentario registrado?',
      confirmLabel: 'Confirmar devolucao',
      comment,
    };
  }

  const rationale = input.escalationRationale.trim();
  if (!input.detail.canEscalate) {
    return {
      state: 'blocked',
      kind: input.kind,
      message: 'Acesso conectado de supervisor e obrigatorio antes de escalar.',
    };
  }

  if (rationale.length === 0) {
    return {
      state: 'blocked',
      kind: input.kind,
      message: 'Justificativa e obrigatoria antes de escalar o relatorio.',
    };
  }

  return {
    state: 'requires-confirmation',
    kind: input.kind,
    reportId: input.detail.reportId,
    title: 'Confirmar escalonamento',
    message: 'Escalar este relatorio para revisao gerencial conectada?',
    confirmLabel: 'Confirmar escalonamento',
    comment: rationale,
  };
}

export function createVisualReviewDecisionActions(callbacks: VisualReviewDecisionCallbacks) {
  return {
    confirmDecision: async (request: VisualReviewDecisionRequest) => {
      if (request.state !== 'requires-confirmation') {
        throw new Error(request.message);
      }

      if (request.kind === 'approve') {
        await callbacks.onApproveReport(request.reportId);
        return;
      }

      if (request.kind === 'return') {
        await callbacks.onReturnReport(request.reportId);
        return;
      }

      await callbacks.onEscalateReport(request.reportId);
    },
  };
}

function buildEmptyGroups(): VisualReviewQueueGroup[] {
  return [
    {
      key: 'pending-review',
      label: 'Aguardando revisao',
      emptyLabel: 'Nenhum relatorio aceito pelo servidor aguarda nesta fila.',
      items: [],
      count: 0,
    },
    {
      key: 'escalated',
      label: 'Escalados',
      emptyLabel: 'Nenhum relatorio escalado esta nesta fila.',
      items: [],
      count: 0,
    },
    {
      key: 'returned',
      label: 'Devolvidos',
      emptyLabel: 'Nenhum relatorio devolvido aparece nesta lista conectada.',
      items: [],
      count: 0,
    },
    {
      key: 'approved',
      label: 'Aprovados',
      emptyLabel: 'Nenhum relatorio aprovado aparece nesta lista conectada.',
      items: [],
      count: 0,
    },
    {
      key: 'other',
      label: 'Outros',
      emptyLabel: 'Nenhum relatorio aparece neste grupo de status.',
      items: [],
      count: 0,
    },
  ];
}

function toQueueGroupKey(
  state: SupervisorReviewQueueItem['reportState'],
): VisualReviewQueueGroupKey {
  switch (state) {
    case 'submitted-pending-review':
      return 'pending-review';
    case 'escalated-pending-manager-review':
      return 'escalated';
    case 'returned-by-supervisor':
    case 'returned-by-manager':
      return 'returned';
    case 'approved':
      return 'approved';
    default:
      return 'other';
  }
}

function formatTimestamp(value: string | null) {
  return value ? new Date(value).toLocaleString('pt-BR') : 'Nao registrado';
}

/**
 * Story 8.8 PT-BR sweep: map the backend `SupervisorReviewEvidencePresenceState`
 * enum into PT-BR copy. Defaults to the raw token so unknown future values are
 * still visible (and obviously English-shaped) on the supervisor screen.
 */
function translateEvidencePresenceState(value: string): string {
  switch (value) {
    case 'no-photo-evidence':
      return 'Sem foto de evidencia';
    case 'all-photo-evidence-finalized':
      return 'Todas as fotos finalizadas';
    case 'pending-photo-evidence':
      return 'Fotos pendentes';
    default:
      return value;
  }
}

/**
 * Story 8.8 PT-BR sweep: replace the backend's English `evidenceStatus.message`
 * sentences with PT-BR copy. The backend authoritatively builds the count;
 * the supervisor sees a translated sentence rather than the raw English.
 */
function translateEvidencePresenceMessage(
  state: string,
  englishMessage: string,
  pendingCount: number,
): string {
  switch (state) {
    case 'no-photo-evidence':
      return 'Nenhuma foto de evidencia anexada neste relatorio.';
    case 'all-photo-evidence-finalized':
      return 'Todas as fotos anexadas ja finalizaram no servidor.';
    case 'pending-photo-evidence':
      return `${pendingCount} foto(s) ainda aguardam presenca finalizada no servidor.`;
    default:
      return translateOperationalMessage(englishMessage);
  }
}
