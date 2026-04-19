"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ServiceMetricsState = void 0;
class ServiceMetricsState {
    startedAtDate;
    startedAt;
    requestCount = 0;
    errorCount = 0;
    constructor(startedAt = new Date()) {
        this.startedAtDate = startedAt;
        this.startedAt = startedAt.toISOString();
    }
    recordRequest(statusCode) {
        this.requestCount += 1;
        if (statusCode >= 500) {
            this.errorCount += 1;
        }
    }
    recordUnhandledError() {
        this.errorCount += 1;
    }
    snapshot(now = new Date()) {
        return {
            startedAt: this.startedAt,
            uptimeMs: Math.max(0, now.getTime() - this.startedAtDate.getTime()),
            requestCount: this.requestCount,
            errorCount: this.errorCount,
            errorRate: this.requestCount > 0 ? Number((this.errorCount / this.requestCount).toFixed(4)) : 0,
        };
    }
}
exports.ServiceMetricsState = ServiceMetricsState;
