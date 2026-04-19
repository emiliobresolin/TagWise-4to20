import { loadServiceEnvironment } from '../config/env';
import { createPostgresPool, verifyPostgresConnectivity } from '../platform/db/postgres';
import { generateCorrelationId } from '../platform/diagnostics/correlation';
import { createStructuredLogger } from '../platform/diagnostics/structuredLogger';
import { createServiceRuntime } from '../runtime/serviceRuntime';
import { AuditEventRepository } from '../modules/audit/auditEventRepository';
import { AuditEventService } from '../modules/audit/auditEventService';
import { AuthRepository } from '../modules/auth/authRepository';
import { AuthService } from '../modules/auth/authService';
import { createApiRequestHandler } from './createApiRequestHandler';

async function main() {
  const environment = loadServiceEnvironment('api');
  const pool = createPostgresPool(environment);
  const logger = createStructuredLogger({
    serviceName: 'api-service',
    serviceRole: 'api',
    correlationId: generateCorrelationId(),
  });
  if (!environment.auth) {
    throw new Error('API auth configuration is missing.');
  }

  const authService = new AuthService(
    new AuthRepository(pool),
    environment.auth,
    new AuditEventService(new AuditEventRepository(pool)),
  );
  await authService.ensureSeedUsers();

  const runtime = createServiceRuntime({
    serviceName: 'api-service',
    serviceRole: 'api',
    host: environment.host,
    port: environment.port,
    verifyDatabaseReadiness: () => verifyPostgresConnectivity(pool),
    logger,
    handleRequest: createApiRequestHandler({ authService }),
  });

  const { port } = await runtime.start();
  logger.info('api.boot.completed', {
    port,
    readiness: runtime.snapshot(),
  });

  registerShutdown(async () => {
    await runtime.stop();
    await pool.end();
  });
}

function registerShutdown(shutdown: () => Promise<void>) {
  let shuttingDown = false;

  const handler = async () => {
    if (shuttingDown) {
      return;
    }

    shuttingDown = true;
    await shutdown();
    process.exit(0);
  };

  process.on('SIGINT', () => void handler());
  process.on('SIGTERM', () => void handler());
}

void main().catch((error) => {
  createStructuredLogger({
    serviceName: 'api-service',
    serviceRole: 'api',
    correlationId: generateCorrelationId(),
  }).error('api.boot.failed', error);
  process.exitCode = 1;
});
