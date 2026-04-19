import type { CachedAuthSession } from '../../../features/auth/model';
import type { LocalDatabase } from '../sqlite/types';

const ACTIVE_SESSION_KEY = 'active';

interface AuthSessionRow {
  user_id: string;
  email: string;
  display_name: string;
  role: CachedAuthSession['role'];
  last_authenticated_at: string;
  access_token_expires_at: string;
  refresh_token_expires_at: string;
}

export class AuthSessionCacheRepository {
  constructor(private readonly database: LocalDatabase) {}

  async getActiveSession(): Promise<CachedAuthSession | null> {
    const row = await this.database.getFirstAsync<AuthSessionRow>(
      `
        SELECT
          user_id,
          email,
          display_name,
          role,
          last_authenticated_at,
          access_token_expires_at,
          refresh_token_expires_at
        FROM auth_session_cache
        WHERE session_key = ?;
      `,
      [ACTIVE_SESSION_KEY],
    );

    if (!row) {
      return null;
    }

    return {
      userId: row.user_id,
      email: row.email,
      displayName: row.display_name,
      role: row.role,
      lastAuthenticatedAt: row.last_authenticated_at,
      accessTokenExpiresAt: row.access_token_expires_at,
      refreshTokenExpiresAt: row.refresh_token_expires_at,
    };
  }

  async saveActiveSession(session: CachedAuthSession): Promise<void> {
    const now = new Date().toISOString();

    await this.database.runAsync(
      `
        INSERT INTO auth_session_cache (
          session_key,
          user_id,
          email,
          display_name,
          role,
          last_authenticated_at,
          access_token_expires_at,
          refresh_token_expires_at,
          updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(session_key) DO UPDATE SET
          user_id = excluded.user_id,
          email = excluded.email,
          display_name = excluded.display_name,
          role = excluded.role,
          last_authenticated_at = excluded.last_authenticated_at,
          access_token_expires_at = excluded.access_token_expires_at,
          refresh_token_expires_at = excluded.refresh_token_expires_at,
          updated_at = excluded.updated_at;
      `,
      [
        ACTIVE_SESSION_KEY,
        session.userId,
        session.email,
        session.displayName,
        session.role,
        session.lastAuthenticatedAt,
        session.accessTokenExpiresAt,
        session.refreshTokenExpiresAt,
        now,
      ],
    );
  }

  async clearActiveSession(): Promise<void> {
    await this.database.runAsync('DELETE FROM auth_session_cache WHERE session_key = ?;', [
      ACTIVE_SESSION_KEY,
    ]);
  }
}
