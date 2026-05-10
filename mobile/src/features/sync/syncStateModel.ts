import type { SharedExecutionSyncState } from '../execution/model';

export const APPROVED_SYNC_STATES = [
  'local-only',
  'queued',
  'syncing',
  'pending-validation',
  'synced',
  'sync-issue',
] as const;

export type SyncStateTone = 'neutral' | 'waiting' | 'active' | 'success' | 'attention';

export interface SyncStateBadgeModel {
  state: SharedExecutionSyncState;
  label: string;
  tone: SyncStateTone;
  detail: string;
}

const SYNC_STATE_LABELS: Record<SharedExecutionSyncState, string> = {
  'local-only': 'Somente local',
  queued: 'Na fila',
  syncing: 'Sincronizando',
  'pending-validation': 'Validacao pendente',
  synced: 'Sincronizado',
  'sync-issue': 'Falha de sync',
};

const SYNC_STATE_DETAILS: Record<SharedExecutionSyncState, string> = {
  'local-only': 'Registro ainda esta somente neste aparelho.',
  queued: 'Fila local contem trabalho de sincronizacao para este registro.',
  syncing: 'Transporte de sync esta processando este registro.',
  'pending-validation': 'Servidor recebeu o payload e a validacao esta pendente.',
  synced: 'Sincronizacao com servidor concluida para este registro.',
  'sync-issue': 'Sync precisa de atencao antes deste registro continuar.',
};

const SYNC_STATE_TONES: Record<SharedExecutionSyncState, SyncStateTone> = {
  'local-only': 'neutral',
  queued: 'waiting',
  syncing: 'active',
  'pending-validation': 'waiting',
  synced: 'success',
  'sync-issue': 'attention',
};

export function isSharedExecutionSyncState(value: unknown): value is SharedExecutionSyncState {
  return (
    typeof value === 'string' &&
    APPROVED_SYNC_STATES.includes(value as (typeof APPROVED_SYNC_STATES)[number])
  );
}

export function formatSyncStateLabel(state: SharedExecutionSyncState): string {
  return SYNC_STATE_LABELS[state];
}

export function buildSyncStateBadgeModel(
  state: SharedExecutionSyncState,
  issueDetail?: string | null,
): SyncStateBadgeModel {
  return {
    state,
    label: formatSyncStateLabel(state),
    tone: SYNC_STATE_TONES[state],
    detail:
      state === 'sync-issue' && issueDetail && issueDetail.trim().length > 0
        ? issueDetail
        : SYNC_STATE_DETAILS[state],
  };
}

export function resolveAggregateSyncState(
  states: readonly SharedExecutionSyncState[],
): SharedExecutionSyncState {
  if (states.length === 0) {
    return 'local-only';
  }

  if (states.includes('sync-issue')) {
    return 'sync-issue';
  }

  if (states.includes('syncing')) {
    return 'syncing';
  }

  if (states.includes('queued')) {
    return 'queued';
  }

  if (states.includes('pending-validation')) {
    return 'pending-validation';
  }

  if (states.every((state) => state === 'synced')) {
    return 'synced';
  }

  return 'local-only';
}
