import { afterEach, describe, expect, it } from 'vitest';
import { newDb } from 'pg-mem';

import { createApiRequestHandler } from './createApiRequestHandler';
import { AuditEventRepository } from '../modules/audit/auditEventRepository';
import { AuditEventService } from '../modules/audit/auditEventService';
import { AuthRepository } from '../modules/auth/authRepository';
import { AuthService } from '../modules/auth/authService';
import { createServiceRuntime, type ServiceRuntimeHandle } from '../runtime/serviceRuntime';
import { runPostgresMigrations } from '../platform/db/migrations';

const authConfig = {
  tokenSecret: 'unit-test-secret',
  accessTokenTtlSeconds: 900,
  refreshTokenTtlSeconds: 3600,
  seedUsers: {
    technician: {
      email: 'tech@tagwise.local',
      password: 'TagWise123!',
      displayName: 'Field Technician',
      role: 'technician' as const,
    },
    supervisor: {
      email: 'supervisor@tagwise.local',
      password: 'TagWise123!',
      displayName: 'Field Supervisor',
      role: 'supervisor' as const,
    },
    manager: {
      email: 'manager@tagwise.local',
      password: 'TagWise123!',
      displayName: 'Operations Manager',
      role: 'manager' as const,
    },
  },
};

const runtimes: ServiceRuntimeHandle[] = [];

afterEach(async () => {
  while (runtimes.length > 0) {
    const runtime = runtimes.pop();
    if (runtime) {
      await runtime.stop();
    }
  }
});

describe('createApiRequestHandler', () => {
  it('serves connected login and refresh endpoints on the API runtime', async () => {
    const database = newDb();
    const adapter = database.adapters.createPg();
    const pool = new adapter.Pool();
    await runPostgresMigrations(pool);

    const auditRepository = new AuditEventRepository(pool);
    const authService = new AuthService(
      new AuthRepository(pool),
      authConfig,
      new AuditEventService(auditRepository),
    );
    await authService.ensureSeedUsers();

    const runtime = createServiceRuntime({
      serviceName: 'api-service',
      serviceRole: 'api',
      host: '127.0.0.1',
      port: 0,
      verifyDatabaseReadiness: async () => undefined,
      handleRequest: createApiRequestHandler({ authService }),
    });
    runtimes.push(runtime);

    const { port } = await runtime.start();
    const login = await fetch(`http://127.0.0.1:${port}/auth/login`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-correlation-id': 'corr-api-login',
      },
      body: JSON.stringify({
        email: authConfig.seedUsers.supervisor.email,
        password: authConfig.seedUsers.supervisor.password,
      }),
    });

    expect(login.status).toBe(200);
    expect(login.headers.get('x-correlation-id')).toBe('corr-api-login');
    const loginBody = (await login.json()) as {
      tokens: { refreshToken: string };
      user: { id: string; role: string };
    };
    expect(loginBody.user.role).toBe('supervisor');

    const refresh = await fetch(`http://127.0.0.1:${port}/auth/refresh`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        refreshToken: loginBody.tokens.refreshToken,
      }),
    });

    expect(refresh.status).toBe(200);
    expect(((await refresh.json()) as { user: { role: string } }).user.role).toBe('supervisor');

    const metrics = await fetch(`http://127.0.0.1:${port}/metrics`);
    const metricsBody = (await metrics.json()) as { requestCount: number; errorRate: number };

    expect(metrics.status).toBe(200);
    expect(metricsBody.requestCount).toBeGreaterThanOrEqual(2);
    expect(metricsBody.errorRate).toBe(0);

    const auditEvents = await auditRepository.listEventsByTarget('user-session', loginBody.user.id);
    expect(auditEvents).toHaveLength(2);
    expect(auditEvents[0]?.correlationId).toBe('corr-api-login');
    expect(auditEvents[1]?.correlationId).toBeTruthy();

    await pool.end();
  });
});
