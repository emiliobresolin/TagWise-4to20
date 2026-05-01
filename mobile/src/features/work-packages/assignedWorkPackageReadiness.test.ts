import { describe, expect, it } from 'vitest';

import type { LocalAssignedWorkPackageSummary } from './model';
import {
  evaluateAssignedWorkPackageReadiness,
  formatAssignedWorkPackageFreshness,
} from './assignedWorkPackageReadiness';

const baseSummary: LocalAssignedWorkPackageSummary = {
  id: 'wp-local-001',
  sourceReference: 'seed-cmms-001',
  title: 'Assigned package test',
  assignedTeam: 'Instrumentation Alpha',
  priority: 'high',
  status: 'assigned',
  packageVersion: 1,
  snapshotContractVersion: '2026-04-v1',
  tagCount: 1,
  dueWindow: {
    startsAt: '2026-04-20T08:00:00.000Z',
    endsAt: '2026-04-20T17:00:00.000Z',
  },
  updatedAt: '2026-04-19T10:00:00.000Z',
  downloadedAt: '2026-04-19T10:15:00.000Z',
  localUpdatedAt: '2026-04-19T10:15:00.000Z',
  hasSnapshot: true,
  snapshotGeneratedAt: '2026-04-19T10:00:00.000Z',
};

describe('evaluateAssignedWorkPackageReadiness', () => {
  it('marks undownloaded packages as incomplete', () => {
    expect(
      evaluateAssignedWorkPackageReadiness(
        {
          ...baseSummary,
          hasSnapshot: false,
          downloadedAt: null,
          snapshotGeneratedAt: null,
        },
        new Date('2026-04-19T12:00:00.000Z'),
      ),
    ).toMatchObject({
      state: 'incomplete',
      label: 'Incomplete',
    });
  });

  it('marks snapshots with missing freshness metadata as age unknown', () => {
    expect(
      evaluateAssignedWorkPackageReadiness(
        {
          ...baseSummary,
          snapshotGeneratedAt: null,
        },
        new Date('2026-04-19T12:00:00.000Z'),
      ),
    ).toMatchObject({
      state: 'age-unknown',
      label: 'Age unknown',
    });
  });

  it('marks recently downloaded packages with stale upstream data as stale', () => {
    expect(
      evaluateAssignedWorkPackageReadiness(
        {
          ...baseSummary,
          downloadedAt: '2026-04-20T11:45:00.000Z',
          snapshotGeneratedAt: '2026-04-19T10:00:00.000Z',
        },
        new Date('2026-04-20T12:00:00.000Z'),
      ),
    ).toMatchObject({
      state: 'stale',
      label: 'Stale',
    });
  });

  it('marks packages with recent upstream data but stale local refresh as stale', () => {
    expect(
      evaluateAssignedWorkPackageReadiness(
        {
          ...baseSummary,
          downloadedAt: '2026-04-19T10:15:00.000Z',
          snapshotGeneratedAt: '2026-04-20T11:45:00.000Z',
        },
        new Date('2026-04-20T12:30:00.000Z'),
      ),
    ).toMatchObject({
      state: 'stale',
      label: 'Stale',
    });
  });

  it('marks recently refreshed snapshots as offline ready', () => {
    expect(
      evaluateAssignedWorkPackageReadiness(
        {
          ...baseSummary,
          downloadedAt: '2026-04-20T11:45:00.000Z',
          snapshotGeneratedAt: '2026-04-20T11:30:00.000Z',
        },
        new Date('2026-04-20T12:00:00.000Z'),
      ),
    ).toMatchObject({
      state: 'offline-ready',
      label: 'Offline ready',
    });
  });
});

describe('formatAssignedWorkPackageFreshness', () => {
  it('returns age unknown for missing timestamps', () => {
    expect(formatAssignedWorkPackageFreshness(null)).toBe('Age unknown');
  });
});
