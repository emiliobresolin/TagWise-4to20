import type {
  AssignedWorkPackageReadinessState,
  LocalAssignedWorkPackageSummary,
} from './model';

export const ASSIGNED_WORK_PACKAGE_STALE_AFTER_HOURS = 24;
const STALE_AFTER_MS = ASSIGNED_WORK_PACKAGE_STALE_AFTER_HOURS * 60 * 60 * 1000;

export interface AssignedWorkPackageReadiness {
  state: AssignedWorkPackageReadinessState;
  label: string;
  detail: string;
}

export function evaluateAssignedWorkPackageReadiness(
  summary: LocalAssignedWorkPackageSummary,
  now: Date = new Date(),
): AssignedWorkPackageReadiness {
  if (!summary.hasSnapshot) {
    return {
      state: 'incomplete',
      label: 'Incomplete',
      detail: 'Download this package while connected before heading into the field.',
    };
  }

  const downloadedAt = parseTimestamp(summary.downloadedAt);
  const snapshotGeneratedAt = parseTimestamp(summary.snapshotGeneratedAt);

  if (!downloadedAt || !snapshotGeneratedAt) {
    return {
      state: 'age-unknown',
      label: 'Age unknown',
      detail: 'Refresh this package while connected to recover freshness metadata.',
    };
  }

  if (isStale(snapshotGeneratedAt, now)) {
    return {
      state: 'stale',
      label: 'Stale',
      detail: `The upstream snapshot is older than ${ASSIGNED_WORK_PACKAGE_STALE_AFTER_HOURS} hours. Refresh this package before leaving connectivity.`,
    };
  }

  if (isStale(downloadedAt, now)) {
    return {
      state: 'stale',
      label: 'Stale',
      detail: `This package has not been refreshed locally for more than ${ASSIGNED_WORK_PACKAGE_STALE_AFTER_HOURS} hours. Refresh it before leaving connectivity.`,
    };
  }

  return {
    state: 'offline-ready',
    label: 'Offline ready',
    detail: 'This snapshot is complete and recent enough for offline field use.',
  };
}

export function formatAssignedWorkPackageFreshness(timestamp: string | null): string {
  const value = parseTimestamp(timestamp);
  return value ? value.toLocaleString() : 'Age unknown';
}

function parseTimestamp(timestamp: string | null): Date | null {
  if (!timestamp) {
    return null;
  }

  const value = new Date(timestamp);
  return Number.isNaN(value.getTime()) ? null : value;
}

function isStale(timestamp: Date, now: Date): boolean {
  return now.getTime() - timestamp.getTime() > STALE_AFTER_MS;
}
