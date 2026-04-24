import { describe, expect, it } from 'vitest';

import {
  buildSyncStateBadgeModel,
  formatSyncStateLabel,
  isSharedExecutionSyncState,
  resolveAggregateSyncState,
} from './syncStateModel';

describe('syncStateModel', () => {
  it('recognizes only the approved v1 sync states', () => {
    expect(isSharedExecutionSyncState('local-only')).toBe(true);
    expect(isSharedExecutionSyncState('queued')).toBe(true);
    expect(isSharedExecutionSyncState('syncing')).toBe(true);
    expect(isSharedExecutionSyncState('pending-validation')).toBe(true);
    expect(isSharedExecutionSyncState('synced')).toBe(true);
    expect(isSharedExecutionSyncState('sync-issue')).toBe(true);
    expect(isSharedExecutionSyncState('approved')).toBe(false);
  });

  it('formats sync badges without mixing transport state into approval state', () => {
    expect(formatSyncStateLabel('local-only')).toBe('Local Only');
    expect(formatSyncStateLabel('pending-validation')).toBe('Pending Validation');

    expect(buildSyncStateBadgeModel('sync-issue', 'metadata unavailable')).toMatchObject({
      state: 'sync-issue',
      label: 'Sync Issue',
      tone: 'attention',
      detail: 'metadata unavailable',
    });
  });

  it('aggregates report and package sync state deterministically', () => {
    expect(resolveAggregateSyncState([])).toBe('local-only');
    expect(resolveAggregateSyncState(['synced', 'synced'])).toBe('synced');
    expect(resolveAggregateSyncState(['synced', 'pending-validation'])).toBe(
      'pending-validation',
    );
    expect(resolveAggregateSyncState(['pending-validation', 'queued'])).toBe('queued');
    expect(resolveAggregateSyncState(['queued', 'syncing'])).toBe('syncing');
    expect(resolveAggregateSyncState(['syncing', 'sync-issue'])).toBe('sync-issue');
  });
});
