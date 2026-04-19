import { randomUUID } from 'node:crypto';

import type { AuthConfig } from '../../config/env';
import {
  AuthenticationError,
  type AuthSessionPayload,
  type AuthenticatedUser,
} from './model';
import { AuthRepository } from './authRepository';
import { AuditEventService } from '../audit/auditEventService';
import { hashPassword, verifyPassword } from './passwordCodec';
import { issueTokenPair, verifyAccessToken, verifyRefreshToken } from './tokenCodec';

export interface ConnectedLoginRequest {
  email: string;
  password: string;
}

export class AuthService {
  constructor(
    private readonly repository: AuthRepository,
    private readonly config: AuthConfig,
    private readonly auditEvents: AuditEventService,
  ) {}

  async ensureSeedUsers(): Promise<void> {
    const entries = Object.values(this.config.seedUsers);

    for (const entry of entries) {
      const passwordRecord = hashPassword(entry.password);

      await this.repository.upsertSeedUser({
        id: buildSeedUserId(entry.role),
        email: entry.email,
        displayName: entry.displayName,
        role: entry.role,
        passwordHash: passwordRecord.hash,
        passwordSalt: passwordRecord.salt,
      });
    }
  }

  async loginConnected(
    request: ConnectedLoginRequest,
    context: { correlationId: string },
  ): Promise<AuthSessionPayload> {
    const user = await this.repository.findByEmail(request.email);
    if (!user) {
      throw new AuthenticationError('Invalid email or password.');
    }

    const validPassword = verifyPassword(request.password, {
      salt: user.passwordSalt,
      hash: user.passwordHash,
    });

    if (!validPassword) {
      throw new AuthenticationError('Invalid email or password.');
    }

    const session = {
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        role: user.role,
      },
      tokens: issueTokenPair(user, user.sessionVersion, this.config),
    };

    await this.auditEvents.recordEvent({
      actorId: user.id,
      actorRole: user.role,
      actionType: 'auth.login.connected',
      targetObjectType: 'user-session',
      targetObjectId: user.id,
      correlationId: context.correlationId,
      priorState: 'signed_out',
      nextState: 'connected',
      metadata: {
        email: user.email,
      },
    });

    return session;
  }

  async refreshConnected(
    refreshToken: string,
    context: { correlationId: string },
  ): Promise<AuthSessionPayload> {
    const claims = verifyRefreshToken(refreshToken, this.config);
    const user = await this.repository.findById(claims.sub);

    if (!user || user.sessionVersion !== claims.ver) {
      throw new AuthenticationError('Session is no longer valid.');
    }

    const session = {
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        role: user.role,
      },
      tokens: issueTokenPair(user, user.sessionVersion, this.config),
    };

    await this.auditEvents.recordEvent({
      actorId: user.id,
      actorRole: user.role,
      actionType: 'auth.refresh.connected',
      targetObjectType: 'user-session',
      targetObjectId: user.id,
      correlationId: context.correlationId,
      priorState: 'connected',
      nextState: 'connected',
      metadata: {
        email: user.email,
      },
    });

    return session;
  }

  async authenticateAccessToken(accessToken: string): Promise<AuthenticatedUser> {
    const claims = verifyAccessToken(accessToken, this.config);
    const user = await this.repository.findById(claims.sub);

    if (!user || user.sessionVersion !== claims.ver) {
      throw new AuthenticationError('Session is no longer valid.');
    }

    return {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      role: user.role,
    };
  }
}

function buildSeedUserId(role: string): string {
  return `seed-${role}-${randomUUID()}`.slice(0, 36);
}
