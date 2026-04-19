import { randomUUID } from 'node:crypto';

import type { AuthConfig } from '../../config/env';
import { AuthenticationError, type AuthSessionPayload } from './model';
import { AuthRepository } from './authRepository';
import { hashPassword, verifyPassword } from './passwordCodec';
import { issueTokenPair, verifyRefreshToken } from './tokenCodec';

export interface ConnectedLoginRequest {
  email: string;
  password: string;
}

export class AuthService {
  constructor(
    private readonly repository: AuthRepository,
    private readonly config: AuthConfig,
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

  async loginConnected(request: ConnectedLoginRequest): Promise<AuthSessionPayload> {
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

    return {
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        role: user.role,
      },
      tokens: issueTokenPair(user, user.sessionVersion, this.config),
    };
  }

  async refreshConnected(refreshToken: string): Promise<AuthSessionPayload> {
    const claims = verifyRefreshToken(refreshToken, this.config);
    const user = await this.repository.findById(claims.sub);

    if (!user || user.sessionVersion !== claims.ver) {
      throw new AuthenticationError('Session is no longer valid.');
    }

    return {
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        role: user.role,
      },
      tokens: issueTokenPair(user, user.sessionVersion, this.config),
    };
  }
}

function buildSeedUserId(role: string): string {
  return `seed-${role}-${randomUUID()}`.slice(0, 36);
}
