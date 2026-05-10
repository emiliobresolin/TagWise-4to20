import { describe, expect, it } from 'vitest';

import { buildVisualWorkPackagePreparation } from './serviceBackedPackages';
import type { ActiveUserSession } from '../auth/model';
import type { LocalAssignedWorkPackageSummary } from '../work-packages/model';

describe('service-backed visual package preparation', () => {
  it('keeps signed-out users away from assigned work package actions', () => {
    const projection = buildVisualWorkPackagePreparation({
      session: null,
      workPackages: [workPackage()],
      packageBusy: false,
    });

    expect(projection.state).toBe('signed-out');
    expect(projection.canRefresh).toBe(false);
    expect(projection.packages).toEqual([]);
  });

  it('separates assigned refresh from snapshot download and cached tag browse', () => {
    const projection = buildVisualWorkPackagePreparation({
      session: session('connected'),
      workPackages: [
        workPackage({ id: 'wp-not-downloaded', hasSnapshot: false }),
        workPackage({ id: 'wp-cached', hasSnapshot: true }),
      ],
      packageBusy: false,
    });

    expect(projection.state).toBe('available');
    expect(projection.canRefresh).toBe(true);
    expect(projection.packages).toMatchObject([
      {
        id: 'wp-not-downloaded',
        cacheState: 'not-downloaded',
        canDownload: true,
        canBrowse: false,
      },
      {
        id: 'wp-cached',
        cacheState: 'cached',
        canDownload: true,
        canBrowse: true,
      },
    ]);
  });

  it('keeps cached packages browsable offline but blocks official downloads', () => {
    const projection = buildVisualWorkPackagePreparation({
      session: session('offline'),
      workPackages: [
        workPackage({ id: 'wp-not-downloaded', hasSnapshot: false }),
        workPackage({ id: 'wp-cached', hasSnapshot: true }),
      ],
      packageBusy: false,
    });

    expect(projection.canRefresh).toBe(false);
    expect(projection.packages).toMatchObject([
      {
        id: 'wp-not-downloaded',
        cacheState: 'connected-required',
        canDownload: false,
        canBrowse: false,
      },
      {
        id: 'wp-cached',
        cacheState: 'cached',
        canDownload: false,
        canBrowse: true,
      },
    ]);
  });

  it('marks manual instruments as local-only pending reconciliation', () => {
    const projection = buildVisualWorkPackagePreparation({
      session: session('offline'),
      workPackages: [
        workPackage({
          id: 'manual-intake:20260510120000',
          sourceReference: 'local-manual:20260510120000',
          hasSnapshot: true,
        }),
      ],
      packageBusy: false,
    });

    expect(projection.packages).toMatchObject([
      {
        cacheState: 'manual-local',
        cacheLabel: 'Cadastro manual local',
        canDownload: false,
        canBrowse: true,
        isManual: true,
        reconciliationLabel: 'Manual/local - pendente de reconciliacao',
      },
    ]);
  });
});

function session(connectionMode: ActiveUserSession['connectionMode']): ActiveUserSession {
  return {
    userId: 'user-technician',
    email: 'tech@tagwise.local',
    displayName: 'Field Technician',
    role: 'technician',
    lastAuthenticatedAt: '2026-05-10T12:00:00.000Z',
    accessTokenExpiresAt: '2026-05-10T13:00:00.000Z',
    refreshTokenExpiresAt: '2026-05-11T13:00:00.000Z',
    connectionMode,
    reviewActionsAvailable: false,
  };
}

function workPackage(
  overrides: Partial<LocalAssignedWorkPackageSummary> = {},
): LocalAssignedWorkPackageSummary {
  const hasSnapshot = overrides.hasSnapshot ?? false;

  return {
    id: 'wp-001',
    sourceReference: 'seed-cmms-001',
    title: 'Assigned package',
    assignedTeam: 'Instrumentation',
    priority: 'high',
    status: 'assigned',
    packageVersion: 1,
    snapshotContractVersion: '2026-04-v1',
    tagCount: 2,
    dueWindow: { startsAt: null, endsAt: null },
    updatedAt: '2026-05-10T12:00:00.000Z',
    downloadedAt: hasSnapshot ? '2026-05-10T12:05:00.000Z' : null,
    localUpdatedAt: '2026-05-10T12:05:00.000Z',
    hasSnapshot,
    snapshotGeneratedAt: hasSnapshot ? '2026-05-10T12:00:00.000Z' : null,
    ...overrides,
  };
}
