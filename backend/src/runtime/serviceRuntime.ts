import type { ServiceRole } from '../config/env';
import { ServiceMetricsState } from '../platform/diagnostics/serviceMetrics';
import { createStructuredLogger, type StructuredLogger } from '../platform/diagnostics/structuredLogger';
import { createHttpHealthServer, type HealthServerHandle } from '../platform/health/httpHealthServer';
import { ReadinessState, type ReadinessSnapshot } from '../platform/health/readiness';

export interface ServiceRuntimeOptions {
  serviceName: string;
  serviceRole: ServiceRole;
  host: string;
  port: number;
  verifyDatabaseReadiness: () => Promise<void>;
  logger?: StructuredLogger;
  handleRequest?: Parameters<typeof createHttpHealthServer>[0]['handleRequest'];
}

export interface ServiceRuntimeHandle {
  start(): Promise<{ port: number }>;
  stop(): Promise<void>;
  snapshot(): ReadinessSnapshot;
  logger: StructuredLogger;
}

export function createServiceRuntime(options: ServiceRuntimeOptions): ServiceRuntimeHandle {
  const metrics = new ServiceMetricsState();
  const logger =
    options.logger ??
    createStructuredLogger({
      serviceName: options.serviceName,
      serviceRole: options.serviceRole,
    });
  const readiness = new ReadinessState(
    options.serviceName,
    options.serviceRole,
    ['database'],
    metrics.snapshot(),
  );
  const healthServer = createHttpHealthServer({
    serviceName: options.serviceName,
    host: options.host,
    port: options.port,
    getReadinessSnapshot: () => {
      readiness.updateMetrics(metrics.snapshot());
      return readiness.snapshot();
    },
    getMetricsSnapshot: () => metrics.snapshot(),
    logger,
    metrics,
    handleRequest: options.handleRequest,
  });

  return {
    logger,
    async start(): Promise<{ port: number }> {
      const server = await healthServer.start();
      await bootstrapReadiness(readiness, options.verifyDatabaseReadiness);
      readiness.updateMetrics(metrics.snapshot());
      return server;
    },
    async stop(): Promise<void> {
      await healthServer.stop();
    },
    snapshot(): ReadinessSnapshot {
      readiness.updateMetrics(metrics.snapshot());
      return readiness.snapshot();
    },
  };
}

async function bootstrapReadiness(
  readiness: ReadinessState,
  verifyDatabaseReadiness: () => Promise<void>,
): Promise<void> {
  try {
    await verifyDatabaseReadiness();
    readiness.markCheckReady('database');
  } catch (error) {
    readiness.markCheckFailed(
      'database',
      error instanceof Error ? error.message : 'Unknown database readiness error',
    );
  }
}
