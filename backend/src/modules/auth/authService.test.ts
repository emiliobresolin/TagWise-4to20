import { describe, expect, it } from 'vitest';
import { newDb } from 'pg-mem';

import { runPostgresMigrations } from '../../platform/db/migrations';
import { AuditEventRepository } from '../audit/auditEventRepository';
import { AuditEventService } from '../audit/auditEventService';
import { AuthRepository } from './authRepository';
import { AuthService } from './authService';

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

describe('AuthService', () => {
  it('authenticates a seeded connected user and issues token pair', async () => {
    const database = newDb();
    const adapter = database.adapters.createPg();
    const pool = new adapter.Pool();
    await runPostgresMigrations(pool);

    const auditRepository = new AuditEventRepository(pool);
    const service = new AuthService(
      new AuthRepository(pool),
      authConfig,
      new AuditEventService(auditRepository),
    );
    await service.ensureSeedUsers();

    const session = await service.loginConnected({
      email: authConfig.seedUsers.technician.email,
      password: authConfig.seedUsers.technician.password,
    }, {
      correlationId: 'corr-login-test',
    });

    expect(session.user.role).toBe('technician');
    expect(session.tokens.accessToken).toContain('.');
    expect(session.tokens.refreshToken).toContain('.');
    expect(await auditRepository.listEventsByTarget('user-session', session.user.id)).toHaveLength(1);

    await pool.end();
  });

  it('refreshes a valid session using the refresh token', async () => {
    const database = newDb();
    const adapter = database.adapters.createPg();
    const pool = new adapter.Pool();
    await runPostgresMigrations(pool);

    const auditRepository = new AuditEventRepository(pool);
    const service = new AuthService(
      new AuthRepository(pool),
      authConfig,
      new AuditEventService(auditRepository),
    );
    await service.ensureSeedUsers();
    const login = await service.loginConnected({
      email: authConfig.seedUsers.supervisor.email,
      password: authConfig.seedUsers.supervisor.password,
    }, {
      correlationId: 'corr-refresh-login',
    });

    const refreshed = await service.refreshConnected(login.tokens.refreshToken, {
      correlationId: 'corr-refresh',
    });

    expect(refreshed.user.role).toBe('supervisor');
    expect(refreshed.tokens.refreshTokenExpiresAt).toBeTruthy();
    expect(await auditRepository.listEventsByTarget('user-session', refreshed.user.id)).toHaveLength(2);

    await pool.end();
  });
});
