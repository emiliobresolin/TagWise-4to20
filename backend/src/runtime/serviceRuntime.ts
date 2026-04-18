import type { ServiceRole } from '../config/env';
import { createHttpHealthServer, type HealthServerHandle } from '../platform/health/httpHealthServer';
import { ReadinessState, type ReadinessSnapshot } from '../platform/health/readiness';

export interface ServiceRuntimeOptions {
  serviceName: string;
  serviceRole: ServiceRole;
  host: string;
  port: number;
  verifyDatabaseReadiness: () => Promise<void>;
}

export interface ServiceRuntimeHandle {
  start(): Promise<{ port: number }>;
  stop(): Promise<void>;
  snapshot(): ReadinessSnapshot;
}

export function createServiceRuntime(options: ServiceRuntimeOptions): ServiceRuntimeHandle {
  const readiness = new ReadinessState(options.serviceName, options.serviceRole, ['database']);
  const healthServer = createHttpHealthServer({
    serviceName: options.serviceName,
    host: options.host,
    port: options.port,
    getReadinessSnapshot: () => readiness.snapshot(),
  });

  return {
    async start(): Promise<{ port: number }> {
      const server = await healthServer.start();
      await bootstrapReadiness(readiness, options.verifyDatabaseReadiness);
      return server;
    },
    async stop(): Promise<void> {
      await healthServer.stop();
    },
    snapshot(): ReadinessSnapshot {
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
