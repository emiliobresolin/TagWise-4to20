import { describe, expect, it } from 'vitest';
import type { QueryResult, QueryResultRow } from 'pg';

import type { QueryableDatabase } from '../platform/db/postgres';
import {
  buildReleaseDashboard,
  buildReleaseObservabilitySnapshot,
  evaluateReleaseAlerts,
} from './releaseObservability';

describe('release observability', () => {
  it('builds dashboard metrics and severe alerts from release health signals', async () => {
    const snapshot = await buildReleaseObservabilitySnapshot({
      database: buildObservabilityDatabase({
        queueDepth: {
          'Submitted - Pending Supervisor Review': 2,
          'Escalated - Pending Manager Review': 1,
        },
        acceptedReports: 4,
        pendingEvidenceRows: [
          { metadata_received_at: '2026-04-24T12:30:00.000Z' },
          { metadata_received_at: '2026-04-24T13:45:00.000Z' },
        ],
        approvalRows: [
          {
            accepted_at: '2026-04-24T09:00:00.000Z',
            occurred_at: '2026-04-24T12:30:00.000Z',
          },
        ],
        pendingReportRows: [{ accepted_at: '2026-04-24T10:00:00.000Z' }],
        mobileErrorRows: [
          {
            reported_at: '2026-04-24T13:50:00.000Z',
            device_platform: 'android',
            app_environment: 'production',
          },
        ],
      }),
      now: new Date('2026-04-24T14:00:00.000Z'),
      apiMetrics: { ready: true, errorCount: 3, errorRate: 0.08 },
      workerMetrics: { ready: false, errorCount: 1, errorRate: 0.2 },
    });

    const alerts = evaluateReleaseAlerts(snapshot);
    const dashboard = buildReleaseDashboard(snapshot, alerts);

    expect(snapshot.queueDepth).toEqual({
      supervisorReviewReports: 2,
      managerReviewReports: 1,
      pendingEvidenceFinalization: 2,
      total: 5,
    });
    expect(snapshot.syncHealth).toMatchObject({
      acceptedReportSubmissions: 4,
      stalePendingEvidenceFinalization: 1,
      syncFailureSignals: 1,
    });
    expect(snapshot.approvalLatency).toMatchObject({
      decidedReportCount: 1,
      averageMinutes: 210,
      maxMinutes: 210,
      oldestPendingMinutes: 240,
    });
    expect(snapshot.mobileCrashTrend).toMatchObject({
      capturedErrors: 1,
      capturedErrorsInWindow: 1,
      byPlatform: { android: 1 },
      byAppEnvironment: { production: 1 },
    });
    expect(alerts.map((alert) => alert.id)).toEqual(
      expect.arrayContaining([
        'evidence-finalization-stale',
        'sync-failure-signal',
        'approval-latency-high',
        'approval-review-stale',
        'worker-not-ready',
        'worker-errors-present',
        'backend-error-rate-high',
        'mobile-crash-trend-present',
      ]),
    );
    expect(dashboard.sections.flatMap((section) => section.checks)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: 'Stale evidence finalization',
          status: 'critical',
        }),
        expect.objectContaining({
          label: 'Worker ready',
          status: 'critical',
        }),
      ]),
    );
  });

  it('keeps the release dashboard green when no failure signals are present', async () => {
    const snapshot = await buildReleaseObservabilitySnapshot({
      database: buildObservabilityDatabase(),
      now: new Date('2026-04-24T14:00:00.000Z'),
      apiMetrics: { ready: true, errorCount: 0, errorRate: 0 },
      workerMetrics: { ready: true, errorCount: 0, errorRate: 0 },
    });
    const alerts = evaluateReleaseAlerts(snapshot);
    const dashboard = buildReleaseDashboard(snapshot, alerts);

    expect(alerts).toEqual([]);
    expect(dashboard.sections.flatMap((section) => section.checks)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ status: 'ok' }),
      ]),
    );
  });
});

interface ObservabilityRows {
  queueDepth: Record<string, number>;
  acceptedReports: number;
  pendingEvidenceRows: Array<{ metadata_received_at: string }>;
  approvalRows: Array<{ accepted_at: string; occurred_at: string }>;
  pendingReportRows: Array<{ accepted_at: string }>;
  mobileErrorRows: Array<{
    reported_at: string;
    device_platform: string;
    app_environment: string;
  }>;
}

function buildObservabilityDatabase(
  rows: Partial<ObservabilityRows> = {},
): QueryableDatabase {
  const data: ObservabilityRows = {
    queueDepth: {},
    acceptedReports: 0,
    pendingEvidenceRows: [],
    approvalRows: [],
    pendingReportRows: [],
    mobileErrorRows: [],
    ...rows,
  };

  return {
    async query<Result extends QueryResultRow = QueryResultRow>(text: string) {
      if (text.includes('FROM report_submission_records') && text.includes('GROUP BY')) {
        return queryResult<Result>(
          Object.entries(data.queueDepth).map(([lifecycle_state, count]) => ({
            lifecycle_state,
            count: String(count),
          })),
        );
      }

      if (text.includes('FROM report_submission_records') && text.includes('accepted_at >=')) {
        return queryResult<Result>([{ count: String(data.acceptedReports) }]);
      }

      if (text.includes('FROM evidence_sync_records')) {
        return queryResult<Result>(data.pendingEvidenceRows);
      }

      if (text.includes('FROM audit_events audit')) {
        return queryResult<Result>(data.approvalRows);
      }

      if (text.includes('FROM report_submission_records') && text.includes('lifecycle_state IN')) {
        return queryResult<Result>(data.pendingReportRows);
      }

      if (text.includes('FROM mobile_runtime_error_events')) {
        return queryResult<Result>(data.mobileErrorRows);
      }

      throw new Error(`Unexpected release observability query: ${text}`);
    },
  };
}

function queryResult<Result extends QueryResultRow>(rows: QueryResultRow[]): QueryResult<Result> {
  return {
    command: 'SELECT',
    rowCount: rows.length,
    oid: 0,
    fields: [],
    rows: rows as Result[],
  };
}
