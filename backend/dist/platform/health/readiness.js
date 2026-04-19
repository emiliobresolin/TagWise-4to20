"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ReadinessState = void 0;
class ReadinessState {
    snapshotState;
    constructor(serviceName, role, checks, metrics) {
        this.snapshotState = {
            serviceName,
            role,
            startedAt: new Date().toISOString(),
            ready: false,
            checks: Object.fromEntries(checks.map((check) => [check, 'pending'])),
            metrics,
        };
    }
    updateMetrics(metrics) {
        this.snapshotState.metrics = metrics;
    }
    markCheckReady(check) {
        this.snapshotState.checks[check] = 'ready';
        this.snapshotState.ready = Object.values(this.snapshotState.checks).every((value) => value === 'ready');
        delete this.snapshotState.lastError;
    }
    markCheckFailed(check, message) {
        this.snapshotState.checks[check] = 'failed';
        this.snapshotState.ready = false;
        this.snapshotState.lastError = message;
    }
    snapshot() {
        return {
            ...this.snapshotState,
            checks: { ...this.snapshotState.checks },
            metrics: { ...this.snapshotState.metrics },
        };
    }
}
exports.ReadinessState = ReadinessState;
