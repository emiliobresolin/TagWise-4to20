export interface ServiceMetricsSnapshot {
  startedAt: string;
  uptimeMs: number;
  requestCount: number;
  errorCount: number;
  errorRate: number;
}

export class ServiceMetricsState {
  private readonly startedAtDate: Date;
  private readonly startedAt: string;
  private requestCount = 0;
  private errorCount = 0;

  constructor(startedAt: Date = new Date()) {
    this.startedAtDate = startedAt;
    this.startedAt = startedAt.toISOString();
  }

  recordRequest(statusCode: number) {
    this.requestCount += 1;
    if (statusCode >= 500) {
      this.errorCount += 1;
    }
  }

  recordUnhandledError() {
    this.errorCount += 1;
  }

  snapshot(now: Date = new Date()): ServiceMetricsSnapshot {
    return {
      startedAt: this.startedAt,
      uptimeMs: Math.max(0, now.getTime() - this.startedAtDate.getTime()),
      requestCount: this.requestCount,
      errorCount: this.errorCount,
      errorRate:
        this.requestCount > 0 ? Number((this.errorCount / this.requestCount).toFixed(4)) : 0,
    };
  }
}
