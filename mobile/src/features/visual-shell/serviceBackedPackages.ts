import type { ActiveUserSession } from '../auth/model';
import type { LocalAssignedWorkPackageSummary } from '../work-packages/model';
import { isManualInstrumentWorkPackageSummary } from '../work-packages/manualInstrumentModel';

export type VisualWorkPackageCacheState =
  | 'not-downloaded'
  | 'cached'
  | 'manual-local'
  | 'connected-required';

export interface VisualWorkPackageProjection {
  id: string;
  title: string;
  sourceReference: string;
  statusLabel: string;
  tagCountLabel: string;
  cacheState: VisualWorkPackageCacheState;
  cacheLabel: string;
  detail: string;
  canDownload: boolean;
  canBrowse: boolean;
  isManual: boolean;
  reconciliationLabel: string | null;
}

export interface VisualWorkPackagePreparationProjection {
  state: 'signed-out' | 'empty' | 'available';
  title: string;
  detail: string;
  packages: VisualWorkPackageProjection[];
  canRefresh: boolean;
}

export function buildVisualWorkPackagePreparation(input: {
  session: ActiveUserSession | null;
  workPackages: readonly LocalAssignedWorkPackageSummary[];
  packageBusy: boolean;
}): VisualWorkPackagePreparationProjection {
  if (!input.session) {
    return {
      state: 'signed-out',
      title: 'Login obrigatorio',
      detail: 'Pacotes de trabalho carregam somente depois da autenticacao.',
      packages: [],
      canRefresh: false,
    };
  }

  const packages = input.workPackages.map((workPackage) =>
    mapWorkPackage(workPackage, input.session!, input.packageBusy),
  );

  if (packages.length === 0) {
    return {
      state: 'empty',
      title: 'Nenhum pacote atribuido',
      detail:
        input.session.connectionMode === 'connected'
          ? 'Atualize os pacotes atribuidos ou crie um instrumento manual se o campo nao estiver no pacote.'
          : 'Nao ha pacotes em cache para este usuario. Reconecte para atualizar ou crie um cadastro manual local.',
      packages: [],
      canRefresh: input.session.connectionMode === 'connected' && !input.packageBusy,
    };
  }

  return {
    state: 'available',
    title: 'Preparar pacotes',
    detail:
      'Atualize atribuicoes, baixe snapshots para trabalho offline e abra as tags em cache.',
    packages,
    canRefresh: input.session.connectionMode === 'connected' && !input.packageBusy,
  };
}

function mapWorkPackage(
  workPackage: LocalAssignedWorkPackageSummary,
  session: ActiveUserSession,
  packageBusy: boolean,
): VisualWorkPackageProjection {
  const isManual = isManualInstrumentWorkPackageSummary(workPackage);
  const connected = session.connectionMode === 'connected';
  const canDownload = !isManual && connected && !packageBusy;
  const canBrowse = workPackage.hasSnapshot && !packageBusy;
  const cacheState: VisualWorkPackageCacheState = isManual
    ? 'manual-local'
    : workPackage.hasSnapshot
      ? 'cached'
      : connected
        ? 'not-downloaded'
        : 'connected-required';

  return {
    id: workPackage.id,
    title: workPackage.title,
    sourceReference: workPackage.sourceReference,
    statusLabel: toPackageStatusLabel(workPackage.status),
    tagCountLabel: `${workPackage.tagCount} tag(s)`,
    cacheState,
    cacheLabel: toCacheLabel(cacheState, workPackage),
    detail: buildPackageDetail(cacheState, workPackage),
    canDownload,
    canBrowse,
    isManual,
    reconciliationLabel: isManual ? 'Manual/local - pendente de reconciliacao' : null,
  };
}

function toPackageStatusLabel(status: LocalAssignedWorkPackageSummary['status']): string {
  switch (status) {
    case 'attention_needed':
      return 'Atencao';
    case 'completed':
      return 'Concluido';
    case 'in_progress':
      return 'Em andamento';
    case 'pending_review':
      return 'Em revisao';
    default:
      return 'Atribuido';
  }
}

function toCacheLabel(
  state: VisualWorkPackageCacheState,
  workPackage: LocalAssignedWorkPackageSummary,
): string {
  switch (state) {
    case 'manual-local':
      return 'Cadastro manual local';
    case 'cached':
      return workPackage.downloadedAt ? 'Baixado' : 'Em cache';
    case 'connected-required':
      return 'Reconectar para baixar';
    default:
      return 'Nao baixado';
  }
}

function buildPackageDetail(
  state: VisualWorkPackageCacheState,
  workPackage: LocalAssignedWorkPackageSummary,
): string {
  if (state === 'manual-local') {
    return 'Salvo localmente neste aparelho. Reconciliacao com servidor ainda nao foi implementada.';
  }

  if (state === 'cached') {
    return workPackage.snapshotGeneratedAt
      ? `Snapshot em cache desde ${formatTimestamp(workPackage.snapshotGeneratedAt)}.`
      : 'Snapshot em cache local para acesso offline as tags.';
  }

  if (state === 'connected-required') {
    return 'Este pacote esta atribuido, mas ainda nao esta em cache no aparelho.';
  }

  return 'Baixe o snapshot antes de trabalhar offline ou escanear tags do pacote.';
}

function formatTimestamp(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}
