import type {
  SharedExecutionReportLifecycleState,
  SharedExecutionReportState,
  SharedExecutionSyncState,
} from '../execution/model';
import type { LocalAssignedTagEntry } from '../work-packages/model';
import { isManualInstrumentWorkPackageId } from '../work-packages/manualInstrumentModel';

export type VisualTechnicianReportStatus =
  | 'not-started'
  | 'draft'
  | 'pending-sync'
  | 'pending-review'
  | 'returned'
  | 'approved'
  | 'sync-issue'
  | 'manual-local';

export interface VisualTechnicianReportRecord {
  reportId: string;
  workPackageId: string;
  tagId: string;
  templateId: string;
  templateVersion: string;
  // Package snapshot version the report was worked under (null for drafts
  // persisted before the stamp landed). Used to scope the approved-tag lock
  // to the package version the approval happened in.
  packageVersion: number | null;
  reportState: SharedExecutionReportState;
  lifecycleState: SharedExecutionReportLifecycleState;
  syncState: SharedExecutionSyncState;
  reviewNotes: string;
  updatedAt: string;
  submittedAt: string | null;
  syncIssue: string | null;
}

export interface VisualTechnicianReportSummary {
  reportId: string;
  workPackageId: string;
  tagId: string;
  templateId: string;
  packageVersion: number | null;
  tagCode: string;
  title: string;
  status: VisualTechnicianReportStatus;
  statusLabel: string;
  detail: string;
  updatedAtLabel: string;
  submittedAtLabel: string;
  canOpen: boolean;
  canEdit: boolean;
  isManual: boolean;
}

export interface VisualTagWorkStatus {
  status: VisualTechnicianReportStatus;
  label: string;
  detail: string;
}

export function buildTechnicianReportSummaries(input: {
  records: readonly VisualTechnicianReportRecord[];
  tags: readonly LocalAssignedTagEntry[];
}): VisualTechnicianReportSummary[] {
  const tagsByKey = new Map(
    input.tags.map((tag) => [tagKey(tag.workPackageId, tag.tagId), tag]),
  );

  return input.records
    .map((record) => {
      const tag = tagsByKey.get(tagKey(record.workPackageId, record.tagId));
      const status = classifyReportStatus(record);
      const isManual = isManualInstrumentWorkPackageId(record.workPackageId);

      return {
        reportId: record.reportId,
        workPackageId: record.workPackageId,
        tagId: record.tagId,
        templateId: record.templateId,
        packageVersion: record.packageVersion,
        tagCode: tag?.tagCode ?? record.tagId,
        title: tag?.shortDescription ?? record.reportId,
        status,
        statusLabel: reportStatusLabel(status),
        detail: buildReportDetail(record, status),
        updatedAtLabel: formatTimestamp(record.updatedAt),
        submittedAtLabel: formatTimestamp(record.submittedAt),
        canOpen: Boolean(tag),
        canEdit: status === 'draft' || status === 'pending-sync' || status === 'manual-local',
        isManual,
      };
    })
    .sort((a, b) => b.updatedAtLabel.localeCompare(a.updatedAtLabel));
}

export function buildTagWorkStatus(input: {
  tag: LocalAssignedTagEntry;
  reports: readonly VisualTechnicianReportSummary[];
}): VisualTagWorkStatus {
  const report = input.reports.find(
    (candidate) =>
      candidate.workPackageId === input.tag.workPackageId && candidate.tagId === input.tag.tagId,
  );

  if (!report) {
    return {
      status: 'not-started',
      label: 'Nao iniciado',
      detail: 'Nenhum rascunho local encontrado.',
    };
  }

  return {
    status: report.status,
    label: report.statusLabel,
    detail: report.detail,
  };
}

export function reportStatusLabel(status: VisualTechnicianReportStatus): string {
  switch (status) {
    case 'draft':
      return 'Em andamento';
    case 'pending-sync':
      return 'Pendente sync';
    case 'pending-review':
      return 'Em revisao';
    case 'returned':
      return 'Corrigir';
    case 'approved':
      return 'Aprovado';
    case 'sync-issue':
      return 'Erro sync';
    case 'manual-local':
      return 'Manual local';
    default:
      return 'Nao iniciado';
  }
}

export function classifyReportStatus(
  record: Pick<
    VisualTechnicianReportRecord,
    'workPackageId' | 'reportState' | 'lifecycleState' | 'syncState'
  >,
): VisualTechnicianReportStatus {
  if (isManualInstrumentWorkPackageId(record.workPackageId)) {
    return 'manual-local';
  }

  if (record.syncState === 'sync-issue') {
    return 'sync-issue';
  }

  if (
    record.lifecycleState === 'Returned by Supervisor' ||
    record.lifecycleState === 'Returned by Manager'
  ) {
    return 'returned';
  }

  if (record.lifecycleState === 'Approved') {
    return 'approved';
  }

  if (record.reportState === 'submitted-pending-sync' || record.syncState === 'queued') {
    return 'pending-sync';
  }

  if (record.reportState === 'submitted-pending-review') {
    return 'pending-review';
  }

  return 'draft';
}

function buildReportDetail(
  record: VisualTechnicianReportRecord,
  status: VisualTechnicianReportStatus,
): string {
  if (record.syncIssue) {
    return record.syncIssue;
  }

  switch (status) {
    case 'pending-sync':
      return 'Ainda esta no aparelho. Pode ser reaberto antes do envio ao servidor.';
    case 'pending-review':
      return 'Servidor aceitou o envio. Aguarda revisao.';
    case 'returned':
      // qa-p5-f02: a returned report is invalidated (read-only history);
      // the rework path is starting a NEW visit from the report screen.
      return 'Relatorio devolvido e invalidado. Abra e inicie uma nova visita para corrigir.';
    case 'approved':
      return 'Relatorio aprovado no ciclo de revisao.';
    case 'manual-local':
      return 'Cadastro manual local. Reconciliacao com backend ainda pendente.';
    case 'sync-issue':
      return 'Falha de sincronizacao. Tente novamente quando estiver conectado.';
    default:
      return record.lifecycleState;
  }
}

function tagKey(workPackageId: string, tagId: string): string {
  return `${workPackageId}:${tagId}`;
}

function formatTimestamp(value: string | null): string {
  if (!value) {
    return 'Nao registrado';
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('pt-BR');
}
