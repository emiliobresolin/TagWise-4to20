import { AuthApiError, type AuthApiClient } from './authApiClient';
import {
  canPerformReviewActions,
  type ActiveUserSession,
  type AuthSessionPayload,
  type CachedAuthSession,
  type SessionRestoreResult,
  type SessionSwitchResult,
} from './model';
import { secureStorageKeys, type SecureKeyValueStore } from '../../platform/secure-storage/secureStorageBoundary';
import { AuthSessionCacheRepository } from '../../data/local/repositories/authSessionCacheRepository';
import { LocalWorkStateRepository } from '../../data/local/repositories/localWorkStateRepository';

interface SessionControllerDependencies {
  apiClient: AuthApiClient;
  secureStorage: SecureKeyValueStore;
  authSessionCache: AuthSessionCacheRepository;
  localWorkState: LocalWorkStateRepository;
  now?: () => Date;
}

export class SessionController {
  private readonly now: () => Date;

  constructor(private readonly dependencies: SessionControllerDependencies) {
    this.now = dependencies.now ?? (() => new Date());
  }

  async restoreSession(): Promise<SessionRestoreResult> {
    const cachedSession = await this.dependencies.authSessionCache.getActiveSession();
    const refreshToken = await this.dependencies.secureStorage.getItem(
      secureStorageKeys.sessionRefreshToken,
    );

    if (!cachedSession || !refreshToken) {
      await this.clearSessionArtifacts();
      return { state: 'signed_out' };
    }

    if (new Date(cachedSession.refreshTokenExpiresAt).getTime() <= this.now().getTime()) {
      await this.clearSessionArtifacts();
      return { state: 'signed_out' };
    }

    try {
      const refreshedSession = await this.dependencies.apiClient.refresh({ refreshToken });
      await this.persistSession(refreshedSession);

      return {
        state: 'signed_in',
        session: toActiveUserSession(refreshedSession, 'connected'),
      };
    } catch (error) {
      if (error instanceof AuthApiError && error.kind === 'server' && error.statusCode === 401) {
        await this.clearSessionArtifacts();
        return { state: 'signed_out' };
      }

      return {
        state: 'signed_in',
        session: toCachedOfflineSession(cachedSession),
      };
    }
  }

  async signInConnected(request: { email: string; password: string }): Promise<ActiveUserSession> {
    const session = await this.dependencies.apiClient.login(request);
    await this.persistSession(session);
    return toActiveUserSession(session, 'connected');
  }

  async clearForUserSwitch(
    connectionMode: ActiveUserSession['connectionMode'],
  ): Promise<SessionSwitchResult> {
    if (connectionMode === 'offline' && (await this.dependencies.localWorkState.hasUnsyncedWork())) {
      return {
        state: 'blocked',
        message: 'Offline user switching is blocked while unsynced local work remains on the device.',
      };
    }

    await this.clearSessionArtifacts();
    return {
      state: 'cleared',
    };
  }

  private async persistSession(session: AuthSessionPayload): Promise<void> {
    await this.dependencies.secureStorage.setItem(
      secureStorageKeys.sessionAccessToken,
      session.tokens.accessToken,
    );
    await this.dependencies.secureStorage.setItem(
      secureStorageKeys.sessionRefreshToken,
      session.tokens.refreshToken,
    );
    await this.dependencies.authSessionCache.saveActiveSession({
      userId: session.user.id,
      email: session.user.email,
      displayName: session.user.displayName,
      role: session.user.role,
      lastAuthenticatedAt: this.now().toISOString(),
      accessTokenExpiresAt: session.tokens.accessTokenExpiresAt,
      refreshTokenExpiresAt: session.tokens.refreshTokenExpiresAt,
    });
  }

  private async clearSessionArtifacts(): Promise<void> {
    await this.dependencies.secureStorage.removeItem(secureStorageKeys.sessionAccessToken);
    await this.dependencies.secureStorage.removeItem(secureStorageKeys.sessionRefreshToken);
    await this.dependencies.authSessionCache.clearActiveSession();
  }
}

function toActiveUserSession(
  session: AuthSessionPayload,
  connectionMode: ActiveUserSession['connectionMode'],
): ActiveUserSession {
  return {
    userId: session.user.id,
    email: session.user.email,
    displayName: session.user.displayName,
    role: session.user.role,
    lastAuthenticatedAt: new Date().toISOString(),
    accessTokenExpiresAt: session.tokens.accessTokenExpiresAt,
    refreshTokenExpiresAt: session.tokens.refreshTokenExpiresAt,
    connectionMode,
    reviewActionsAvailable: canPerformReviewActions(session.user.role, connectionMode),
  };
}

function toCachedOfflineSession(cachedSession: CachedAuthSession): ActiveUserSession {
  return {
    ...cachedSession,
    connectionMode: 'offline',
    reviewActionsAvailable: canPerformReviewActions(cachedSession.role, 'offline'),
  };
}
