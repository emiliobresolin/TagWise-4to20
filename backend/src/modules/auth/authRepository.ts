import type { QueryResultRow } from 'pg';

import type { QueryableDatabase } from '../../platform/db/postgres';
import type { SeedUserConfig, UserRole } from '../../config/env';
import type { AuthenticatedUser } from './model';

interface AuthUserRow extends QueryResultRow {
  id: string;
  email: string;
  display_name: string;
  role: UserRole;
  password_hash: string;
  password_salt: string;
  session_version: number;
}

export interface StoredAuthUser extends AuthenticatedUser {
  passwordHash: string;
  passwordSalt: string;
  sessionVersion: number;
}

export interface SeededAuthUserRecord {
  id: string;
  email: string;
  displayName: string;
  role: UserRole;
  passwordHash: string;
  passwordSalt: string;
}

export class AuthRepository {
  constructor(private readonly database: QueryableDatabase) {}

  async upsertSeedUser(user: SeededAuthUserRecord): Promise<void> {
    const now = new Date().toISOString();

    await this.database.query(
      `
        INSERT INTO auth_users (
          id,
          email,
          display_name,
          role,
          password_hash,
          password_salt,
          created_at,
          updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $7)
        ON CONFLICT(email) DO UPDATE SET
          display_name = EXCLUDED.display_name,
          role = EXCLUDED.role,
          password_hash = EXCLUDED.password_hash,
          password_salt = EXCLUDED.password_salt,
          updated_at = EXCLUDED.updated_at;
      `,
      [
        user.id,
        user.email,
        user.displayName,
        user.role,
        user.passwordHash,
        user.passwordSalt,
        now,
      ],
    );
  }

  async findByEmail(email: string): Promise<StoredAuthUser | null> {
    const result = await this.database.query<AuthUserRow>(
      `
        SELECT
          id,
          email,
          display_name,
          role,
          password_hash,
          password_salt,
          session_version
        FROM auth_users
        WHERE LOWER(email) = LOWER($1)
        LIMIT 1;
      `,
      [email],
    );

    return mapAuthUser(result.rows[0]);
  }

  async findById(id: string): Promise<StoredAuthUser | null> {
    const result = await this.database.query<AuthUserRow>(
      `
        SELECT
          id,
          email,
          display_name,
          role,
          password_hash,
          password_salt,
          session_version
        FROM auth_users
        WHERE id = $1
        LIMIT 1;
      `,
      [id],
    );

    return mapAuthUser(result.rows[0]);
  }
}

function mapAuthUser(row: AuthUserRow | undefined): StoredAuthUser | null {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    role: row.role,
    passwordHash: row.password_hash,
    passwordSalt: row.password_salt,
    sessionVersion: row.session_version,
  };
}
