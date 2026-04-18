export type ReadinessStatus = 'pending' | 'ready' | 'failed';

export interface ReadinessSnapshot {
  serviceName: string;
  role: 'api' | 'worker';
  startedAt: string;
  ready: boolean;
  checks: Record<string, ReadinessStatus>;
  lastError?: string;
}

export class ReadinessState {
  private readonly snapshotState: ReadinessSnapshot;

  constructor(serviceName: string, role: 'api' | 'worker', checks: string[]) {
    this.snapshotState = {
      serviceName,
      role,
      startedAt: new Date().toISOString(),
      ready: false,
      checks: Object.fromEntries(checks.map((check) => [check, 'pending' satisfies ReadinessStatus])),
    };
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
    };
  }
}
