import type { QueryableDatabase } from '../platform/db/postgres';

export interface ServiceMetricsSignal {
  ready: boolean | null;
  errorCount: number | null;
  errorRate: number | null;
  lastError?: string;
}

export interface ReleaseObservabilitySnapshot {
  generatedAt: string;
  windowHours: number;
  queueDepth: {
    supervisorReviewReports: number;
    managerReviewReports: number;
    pendingEvidenceFinalization: number;
    total: number;
  };
  syncHealth: {
    acceptedReportSubmissions: number;
    stalePendingEvidenceFinalization: number;
    syncFailureSignals: number;
  };
  approvalLatency: {
    decidedReportCount: number;
    averageMinutes: number | null;
    maxMinutes: number | null;
    oldestPendingMinutes: number | null;
  };
  worker: ServiceMetricsSignal;
  backendErrors: ServiceMetricsSignal;
  mobileCrashTrend: {
    capturedErrors: number;
    capturedErrorsInWindow: number;
    byPlatform: Record<string, number>;
    byAppEnvironment: Record<string, number>;
  };
}

export interface ReleaseAlert {
  id: string;
  severity: 'warning' | 'critical';
  message: string;
  value: number | boolean;
  threshold: number | boolean;
}

export interface ReleaseAlertThresholds {
  totalQueueDepthWarning: number;
  staleEvidenceCritical: number;
  syncFailureCritical: number;
  approvalLatencyMinutesWarning: number;
  workerErrorCritical: number;
  backendErrorRateCritical: number;
  mobileCrashCritical: number;
}

export interface ReleaseDashboard {
  title: string;
  generatedAt: string;
  sections: Array<{
    title: string;
    checks: Array<{
      label: string;
      value: number | string | null;
      target: string;
      status: 'ok' | 'warning' | 'critical';
    }>;
  }>;
  alerts: ReleaseAlert[];
}

const defaultWindowHours = 24;
const staleEvidenceMinutes = 60;
const defaultThresholds: ReleaseAlertThresholds = {
  totalQueueDepthWarning: 25,
  staleEvidenceCritical: 1,
  syncFailureCritical: 1,
  approvalLatencyMinutesWarning: 120,
  workerErrorCritical: 1,
  backendErrorRateCritical: 0.05,
  mobileCrashCritical: 1,
};

const decisionActionTypes = [
  'report.supervisor.approved',
  'report.supervisor.returned',
  'report.supervisor.escalated',
  'report.manager.approved',
  'report.manager.returned',
] as const;

export async function buildReleaseObservabilitySnapshot(input: {
  database: QueryableDatabase;
  now?: Date;
  windowHours?: number;
  apiMetrics?: ServiceMetricsSignal;
  workerMetrics?: ServiceMetricsSignal;
}): Promise<ReleaseObservabilitySnapshot> {
  const now = input.now ?? new Date();
  const windowHours = input.windowHours ?? defaultWindowHours;
  const windowStartedAt = new Date(now.getTime() - windowHours * 60 * 60 * 1000);
  const staleEvidenceCutoff = new Date(now.getTime() - staleEvidenceMinutes * 60 * 1000);
  const [
    queueDepth,
    acceptedReportSubmissions,
    pendingEvidenceRows,
    approvalRows,
    pendingReportRows,
    mobileErrorRows,
  ] = await Promise.all([
    readQueueDepth(input.database),
    countAcceptedReports(input.database, windowStartedAt),
    readPendingEvidenceRows(input.database),
    readApprovalLatencyRows(input.database, windowStartedAt),
    readPendingReportRows(input.database),
    readMobileErrorRows(input.database),
  ]);
  const stalePendingEvidenceFinalization = pendingEvidenceRows.filter(
    (row) => parseTimestamp(row.metadata_received_at) <= staleEvidenceCutoff.getTime(),
  ).length;
  const mobileCrashTrend = summarizeMobileCrashTrend(mobileErrorRows, windowStartedAt);

  return {
    generatedAt: now.toISOString(),
    windowHours,
    queueDepth: {
      ...queueDepth,
      pendingEvidenceFinalization: pendingEvidenceRows.length,
      total:
        queueDepth.supervisorReviewReports +
        queueDepth.managerReviewReports +
        pendingEvidenceRows.length,
    },
    syncHealth: {
      acceptedReportSubmissions,
      stalePendingEvidenceFinalization,
      syncFailureSignals: stalePendingEvidenceFinalization,
    },
    approvalLatency: {
      ...summarizeApprovalLatency(approvalRows),
      oldestPendingMinutes: calculateOldestPendingMinutes(pendingReportRows, now),
    },
    worker: input.workerMetrics ?? emptyServiceMetricsSignal(),
    backendErrors: input.apiMetrics ?? emptyServiceMetricsSignal(),
    mobileCrashTrend,
  };
}

export function evaluateReleaseAlerts(
  snapshot: ReleaseObservabilitySnapshot,
  thresholds: ReleaseAlertThresholds = defaultThresholds,
): ReleaseAlert[] {
  const alerts: ReleaseAlert[] = [];

  if (snapshot.queueDepth.total > thresholds.totalQueueDepthWarning) {
    alerts.push({
      id: 'queue-depth-high',
      severity: 'warning',
      message: 'Release queue depth is above the release-health threshold.',
      value: snapshot.queueDepth.total,
      threshold: thresholds.totalQueueDepthWarning,
    });
  }

  if (snapshot.syncHealth.stalePendingEvidenceFinalization >= thresholds.staleEvidenceCritical) {
    alerts.push({
      id: 'evidence-finalization-stale',
      severity: 'critical',
      message: 'Evidence binary finalization has stale pending records.',
      value: snapshot.syncHealth.stalePendingEvidenceFinalization,
      threshold: thresholds.staleEvidenceCritical,
    });
  }

  if (snapshot.syncHealth.syncFailureSignals >= thresholds.syncFailureCritical) {
    alerts.push({
      id: 'sync-failure-signal',
      severity: 'critical',
      message: 'Sync failure signals are present in release observability.',
      value: snapshot.syncHealth.syncFailureSignals,
      threshold: thresholds.syncFailureCritical,
    });
  }

  if (
    snapshot.approvalLatency.maxMinutes !== null &&
    snapshot.approvalLatency.maxMinutes > thresholds.approvalLatencyMinutesWarning
  ) {
    alerts.push({
      id: 'approval-latency-high',
      severity: 'warning',
      message: 'Approval latency is above the release-health threshold.',
      value: snapshot.approvalLatency.maxMinutes,
      threshold: thresholds.approvalLatencyMinutesWarning,
    });
  }

  if (
    snapshot.approvalLatency.oldestPendingMinutes !== null &&
    snapshot.approvalLatency.oldestPendingMinutes > thresholds.approvalLatencyMinutesWarning
  ) {
    alerts.push({
      id: 'approval-review-stale',
      severity: 'warning',
      message: 'A pending approval has exceeded the release-health threshold.',
      value: snapshot.approvalLatency.oldestPendingMinutes,
      threshold: thresholds.approvalLatencyMinutesWarning,
    });
  }

  if (snapshot.worker.ready === false) {
    alerts.push({
      id: 'worker-not-ready',
      severity: 'critical',
      message: 'Worker readiness check is failing.',
      value: false,
      threshold: true,
    });
  }

  if (
    snapshot.worker.errorCount !== null &&
    snapshot.worker.errorCount >= thresholds.workerErrorCritical
  ) {
    alerts.push({
      id: 'worker-errors-present',
      severity: 'critical',
      message: 'Worker service is reporting errors.',
      value: snapshot.worker.errorCount,
      threshold: thresholds.workerErrorCritical,
    });
  }

  if (
    snapshot.backendErrors.errorRate !== null &&
    snapshot.backendErrors.errorRate >= thresholds.backendErrorRateCritical
  ) {
    alerts.push({
      id: 'backend-error-rate-high',
      severity: 'critical',
      message: 'Backend API error rate is above the release threshold.',
      value: snapshot.backendErrors.errorRate,
      threshold: thresholds.backendErrorRateCritical,
    });
  }

  if (snapshot.mobileCrashTrend.capturedErrorsInWindow >= thresholds.mobileCrashCritical) {
    alerts.push({
      id: 'mobile-crash-trend-present',
      severity: 'critical',
      message: 'Mobile crash/error telemetry was captured during the release window.',
      value: snapshot.mobileCrashTrend.capturedErrorsInWindow,
      threshold: thresholds.mobileCrashCritical,
    });
  }

  return alerts;
}

export function buildReleaseDashboard(
  snapshot: ReleaseObservabilitySnapshot,
  alerts: ReleaseAlert[] = evaluateReleaseAlerts(snapshot),
): ReleaseDashboard {
  return {
    title: 'TagWise Release Health',
    generatedAt: snapshot.generatedAt,
    sections: [
      {
        title: 'Sync and Queues',
        checks: [
          {
            label: 'Total operational queue depth',
            value: snapshot.queueDepth.total,
            target: `<= ${defaultThresholds.totalQueueDepthWarning}`,
            status: hasAlert(alerts, 'queue-depth-high') ? 'warning' : 'ok',
          },
          {
            label: 'Stale evidence finalization',
            value: snapshot.syncHealth.stalePendingEvidenceFinalization,
            target: '0',
            status: hasAlert(alerts, 'evidence-finalization-stale') ? 'critical' : 'ok',
          },
        ],
      },
      {
        title: 'Approval Flow',
        checks: [
          {
            label: 'Max approval latency minutes',
            value: snapshot.approvalLatency.maxMinutes,
            target: `<= ${defaultThresholds.approvalLatencyMinutesWarning}`,
            status: hasAlert(alerts, 'approval-latency-high') ? 'warning' : 'ok',
          },
          {
            label: 'Oldest pending review minutes',
            value: snapshot.approvalLatency.oldestPendingMinutes,
            target: `<= ${defaultThresholds.approvalLatencyMinutesWarning}`,
            status: hasAlert(alerts, 'approval-review-stale') ? 'warning' : 'ok',
          },
        ],
      },
      {
        title: 'Service and Crash Trends',
        checks: [
          {
            label: 'Worker ready',
            value: snapshot.worker.ready === null ? 'not checked' : String(snapshot.worker.ready),
            target: 'true',
            status: hasAlert(alerts, 'worker-not-ready') ? 'critical' : 'ok',
          },
          {
            label: 'Backend API error rate',
            value: snapshot.backendErrors.errorRate,
            target: `< ${defaultThresholds.backendErrorRateCritical}`,
            status: hasAlert(alerts, 'backend-error-rate-high') ? 'critical' : 'ok',
          },
          {
            label: 'Mobile errors in window',
            value: snapshot.mobileCrashTrend.capturedErrorsInWindow,
            target: '0',
            status: hasAlert(alerts, 'mobile-crash-trend-present') ? 'critical' : 'ok',
          },
        ],
      },
    ],
    alerts,
  };
}

async function readQueueDepth(database: QueryableDatabase) {
  const result = await database.query<{
    lifecycle_state: string;
    count: string;
  }>(
    `
      SELECT lifecycle_state, COUNT(*) AS count
      FROM report_submission_records
      WHERE lifecycle_state IN (
        'Submitted - Pending Supervisor Review',
        'Escalated - Pending Manager Review'
      )
      GROUP BY lifecycle_state;
    `,
  );
  const counts = Object.fromEntries(
    result.rows.map((row) => [row.lifecycle_state, Number(row.count)]),
  );

  return {
    supervisorReviewReports: counts['Submitted - Pending Supervisor Review'] ?? 0,
    managerReviewReports: counts['Escalated - Pending Manager Review'] ?? 0,
  };
}

async function countAcceptedReports(database: QueryableDatabase, windowStartedAt: Date) {
  const result = await database.query<{ count: string }>(
    `
      SELECT COUNT(*) AS count
      FROM report_submission_records
      WHERE accepted_at >= $1;
    `,
    [windowStartedAt.toISOString()],
  );

  return Number(result.rows[0]?.count ?? 0);
}

async function readPendingEvidenceRows(database: QueryableDatabase) {
  const result = await database.query<{ metadata_received_at: string }>(
    `
      SELECT metadata_received_at
      FROM evidence_sync_records
      WHERE presence_status = 'metadata-recorded';
    `,
  );

  return result.rows;
}

async function readApprovalLatencyRows(database: QueryableDatabase, windowStartedAt: Date) {
  const result = await database.query<{ accepted_at: string; occurred_at: string }>(
    `
      SELECT report.accepted_at, audit.occurred_at
      FROM audit_events audit
      INNER JOIN report_submission_records report
        ON report.report_id = audit.target_object_id
      WHERE audit.target_object_type = 'report'
        AND audit.action_type = ANY($1)
        AND audit.occurred_at >= $2;
    `,
    [decisionActionTypes, windowStartedAt.toISOString()],
  );

  return result.rows;
}

async function readPendingReportRows(database: QueryableDatabase) {
  const result = await database.query<{ accepted_at: string }>(
    `
      SELECT accepted_at
      FROM report_submission_records
      WHERE lifecycle_state IN (
        'Submitted - Pending Supervisor Review',
        'Escalated - Pending Manager Review'
      );
    `,
  );

  return result.rows;
}

async function readMobileErrorRows(database: QueryableDatabase) {
  const result = await database.query<{
    reported_at: string;
    device_platform: string;
    app_environment: string;
  }>(
    `
      SELECT reported_at, device_platform, app_environment
      FROM mobile_runtime_error_events;
    `,
  );

  return result.rows;
}

function summarizeApprovalLatency(
  rows: Array<{ accepted_at: string; occurred_at: string }>,
) {
  const latencies = rows
    .map((row) => parseTimestamp(row.occurred_at) - parseTimestamp(row.accepted_at))
    .filter((value) => Number.isFinite(value) && value >= 0)
    .map((value) => Math.round(value / 60000));

  if (latencies.length === 0) {
    return {
      decidedReportCount: 0,
      averageMinutes: null,
      maxMinutes: null,
    };
  }

  return {
    decidedReportCount: latencies.length,
    averageMinutes: Math.round(latencies.reduce((sum, value) => sum + value, 0) / latencies.length),
    maxMinutes: Math.max(...latencies),
  };
}

function calculateOldestPendingMinutes(
  rows: Array<{ accepted_at: string }>,
  now: Date,
): number | null {
  const pendingMinutes = rows
    .map((row) => now.getTime() - parseTimestamp(row.accepted_at))
    .filter((value) => Number.isFinite(value) && value >= 0)
    .map((value) => Math.round(value / 60000));

  return pendingMinutes.length > 0 ? Math.max(...pendingMinutes) : null;
}

function summarizeMobileCrashTrend(
  rows: Array<{ reported_at: string; device_platform: string; app_environment: string }>,
  windowStartedAt: Date,
) {
  const byPlatform: Record<string, number> = {};
  const byAppEnvironment: Record<string, number> = {};
  let capturedErrorsInWindow = 0;

  for (const row of rows) {
    byPlatform[row.device_platform] = (byPlatform[row.device_platform] ?? 0) + 1;
    byAppEnvironment[row.app_environment] = (byAppEnvironment[row.app_environment] ?? 0) + 1;

    if (parseTimestamp(row.reported_at) >= windowStartedAt.getTime()) {
      capturedErrorsInWindow += 1;
    }
  }

  return {
    capturedErrors: rows.length,
    capturedErrorsInWindow,
    byPlatform,
    byAppEnvironment,
  };
}

function emptyServiceMetricsSignal(): ServiceMetricsSignal {
  return {
    ready: null,
    errorCount: null,
    errorRate: null,
  };
}

function parseTimestamp(value: string): number {
  return new Date(value).getTime();
}

function hasAlert(alerts: ReleaseAlert[], id: string): boolean {
  return alerts.some((alert) => alert.id === id);
}
