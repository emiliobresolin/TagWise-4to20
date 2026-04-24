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
  'local-only': 'Local Only',
  queued: 'Queued',
  syncing: 'Syncing',
  'pending-validation': 'Pending Validation',
  synced: 'Synced',
  'sync-issue': 'Sync Issue',
};

const SYNC_STATE_DETAILS: Record<SharedExecutionSyncState, string> = {
  'local-only': 'Local record is still on this device.',
  queued: 'Local queue contains sync work for this record.',
  syncing: 'Sync transport is actively processing this record.',
  'pending-validation': 'Server received the payload and validation is pending.',
  synced: 'Server sync is complete for this record.',
  'sync-issue': 'Sync needs attention before this record can continue.',
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
