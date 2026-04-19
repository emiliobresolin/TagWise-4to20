export type ReadinessStatus = 'pending' | 'ready' | 'failed';

import type { ServiceMetricsSnapshot } from '../diagnostics/serviceMetrics';

export interface ReadinessSnapshot {
  serviceName: string;
  role: 'api' | 'worker';
  startedAt: string;
  ready: boolean;
  checks: Record<string, ReadinessStatus>;
  metrics: ServiceMetricsSnapshot;
  lastError?: string;
}

export class ReadinessState {
  private readonly snapshotState: ReadinessSnapshot;

  constructor(
    serviceName: string,
    role: 'api' | 'worker',
    checks: string[],
    metrics: ServiceMetricsSnapshot,
  ) {
    this.snapshotState = {
      serviceName,
      role,
      startedAt: new Date().toISOString(),
      ready: false,
      checks: Object.fromEntries(checks.map((check) => [check, 'pending' satisfies ReadinessStatus])),
      metrics,
    };
  }

  updateMetrics(metrics: ServiceMetricsSnapshot) {
    this.snapshotState.metrics = metrics;
  }

  markCheckReady(check: string) {
    this.snapshotState.checks[check] = 'ready';
    this.snapshotState.ready = Object.values(this.snapshotState.checks).every(
      (value) => value === 'ready',
    );
    delete this.snapshotState.lastError;
  }

  markCheckFailed(check: string, message: string) {
    this.snapshotState.checks[check] = 'failed';
    this.snapshotState.ready = false;
    this.snapshotState.lastError = message;
  }

  snapshot(): ReadinessSnapshot {
    return {
      ...this.snapshotState,
      checks: { ...this.snapshotState.checks },
      metrics: { ...this.snapshotState.metrics },
    };
  }
}
